import type { Request, CreateRequestCmd, StatusHistoryEntry } from './Request';
import type { IRequestsRepository, ListRequestsFilters }      from './RequestsRepository';
import type { ITicketSystem }                                  from '../../Platform/Ports/ITicketSystem';
import type { INotifier }                                      from '../../Platform/Ports/INotifier';
import type { IClock }                                         from '../../Platform/Ports/IClock';
import type { IFormTemplateRepository }                        from '../FormTemplates/FormTemplateRepository';
import type { FormFieldDef }                                   from '../FormTemplates/FormTemplate';
import { evaluateConditions }                                  from '../FormTemplates/conditionEngine';
import { Errors }                                              from '../../Shared/errors';

// Demo client settings — Phase 3 loads these from the DB clients table.
const CLIENT_PREFIX: Record<string, string> = {
  '00000000-0000-0000-0000-000000000001': 'CBLPBR',
};

interface Deps {
  repo:          IRequestsRepository;
  tickets:       ITicketSystem;
  notifier:      INotifier;
  clock:         IClock;
  formTemplates?: IFormTemplateRepository; // optional — skips condition validation when absent
}

export interface RequestSummary extends Omit<Request, 'payload'> {
  payloadData: Record<string, unknown>;
}

export class RequestsService {
  constructor(private readonly deps: Deps) {}

  async create(cmd: CreateRequestCmd): Promise<RequestSummary> {
    // Idempotency check — same key → return existing request
    if (cmd.idempotencyKey) {
      const existing = await this.deps.repo.findByIdempotencyKey(cmd.idempotencyKey);
      if (existing) return this.toSummary(existing);
    }

    // Condition-aware payload validation (when template is known)
    if (cmd.templateId && this.deps.formTemplates) {
      const tpl = await this.deps.formTemplates.findById(cmd.templateId);
      if (tpl && tpl.clientId === cmd.clientId) {
        this.validatePayloadWithConditions(tpl.fieldSchema, cmd.payload as Record<string, unknown>);
      }
    }

    const prefix    = CLIENT_PREFIX[cmd.clientId] ?? 'REQ';
    const reference = await this.deps.repo.nextReference(cmd.clientId, prefix);
    const id        = crypto.randomUUID();

    const req = await this.deps.repo.create({ ...cmd, id, reference });

    // Outbox pattern — fire ticket creation after DB write.
    // In Phase 3 this becomes an outbox worker; for now it runs inline.
    this.createTicketAsync(req, cmd.createdBy).catch(err =>
      console.error('[RequestsService] Ticket creation failed (non-fatal):', err)
    );

    return this.toSummary(req);
  }

  async list(clientId: string, filters?: ListRequestsFilters): Promise<RequestSummary[]> {
    const rows = await this.deps.repo.list(clientId, filters);
    return rows.map(this.toSummary);
  }

  async getDetail(id: string, clientId: string): Promise<RequestSummary> {
    const req = await this.deps.repo.findById(id, clientId);
    if (!req) throw Errors.notFound(`Request ${id} not found`);
    return this.toSummary(req);
  }

  async getHistory(requestId: string, clientId: string): Promise<StatusHistoryEntry[]> {
    // Access check
    await this.getDetail(requestId, clientId);
    return this.deps.repo.getHistory(requestId);
  }

  /**
   * Apply a status change from an external system (e.g. GitHub webhook).
   *
   * - Idempotent: if the request is already at `newStatus`, this is a no-op.
   * - Skips tenant check — webhooks are authenticated by HMAC, not by user session.
   */
  async applyExternalStatus(
    externalId: string,
    newStatus: Request['status'],
    source: string,
    actor: string | null,
  ): Promise<boolean> {
    const req = await this.deps.repo.findByExternalRef(externalId);
    if (!req) return false;
    if (req.status === newStatus) return true;   // idempotent
    await this.deps.repo.updateStatus(req.id, newStatus, req.status, source, actor);
    return true;
  }

  /** Patch ADO-synced metadata (assigned-to, etc.) when a webhook reports a change. */
  async updateAdoMeta(externalId: string, meta: { adoAssignedTo?: string | null }): Promise<void> {
    const req = await this.deps.repo.findByExternalRef(externalId);
    if (!req) return;
    await this.deps.repo.updateAdoMeta(req.id, meta);
  }

  // ── private helpers ──────────────────────────────────────────────────────

  /**
   * Server-side condition-aware payload validation.
   * Runs the same engine as the frontend so the backend is the authoritative source of truth.
   * Hidden fields must not carry values (tamper protection).
   * Visible required fields must have non-empty values.
   */
  private validatePayloadWithConditions(
    schema:  FormFieldDef[],
    payload: Record<string, unknown>,
  ): void {
    const states  = evaluateConditions(schema, payload);
    const errors: string[] = [];

    for (const field of schema) {
      const state = states.get(field.name) ?? { visible: true, required: field.required };

      if (!state.visible) {
        // Reject non-empty values for hidden fields (prevents tampered submissions)
        const val = payload[field.name];
        if (val !== undefined && val !== null && val !== '') {
          throw Errors.badRequest(
            `Field "${field.label}" is hidden by conditional logic and must not have a value.`,
          );
        }
        continue;
      }

      if (state.required && field.type !== 'attachment') {
        const val = payload[field.name];
        if (val === undefined || val === null || val === '') {
          errors.push(`"${field.label}" is required.`);
        }
      }
    }

    if (errors.length > 0) throw Errors.badRequest(errors.join(' '));
  }

  private async createTicketAsync(req: Request, requesterEmail: string): Promise<void> {
    const payload = JSON.parse(req.payload) as Record<string, string>;
    const ref = await this.deps.tickets.create({
      title:            `[${req.reference}] ${req.title}`,
      body:             this.buildTicketBody(req, payload),
      priority:         req.priority,
      requestReference: req.reference,
      requestType:      req.requestType,
      requesterEmail,
      targetProjectId:  req.adoProjectName ?? undefined,
    });
    await this.deps.repo.saveExternalRef(req.id, ref.externalId, ref.externalUrl);

    // Notify team on submission
    await this.deps.notifier.sendChannelMessage(
      `📋 New request ${req.reference}: "${req.title}" [${req.priority}] → ${ref.externalUrl}`
    );
    await this.deps.notifier.sendEmail({
      to:       [requesterEmail],
      subject:  `Request ${req.reference} received — ${req.title}`,
      htmlBody: `<p>Your request <strong>${req.reference}</strong> has been received and is under review.</p><p>Track it at: ${ref.externalUrl}</p>`,
    });
  }

  private buildTicketBody(req: Request, payload: Record<string, string>): string {
    return [
      `**Reference:** ${req.reference}`,
      `**Type:** ${req.requestType}`,
      `**Priority:** ${req.priority}`,
      req.dueDate ? `**Due:** ${req.dueDate.toISOString().slice(0, 10)}` : null,
      '',
      '---',
      ...Object.entries(payload).map(([k, v]) => `**${k}:** ${v}`),
    ]
      .filter(l => l !== null)
      .join('\n');
  }

  private toSummary(r: Request): RequestSummary {
    let payloadData: Record<string, unknown> = {};
    try { payloadData = JSON.parse(r.payload); } catch {}
    return { ...r, payloadData };
  }
}
