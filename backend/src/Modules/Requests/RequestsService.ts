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

/** Portal priority string → ADO integer (1–4). Matches Microsoft.VSTS.Common.Priority. */
const PRIORITY_MAP: Record<string, number> = {
  Highest: 1, High: 2, Medium: 3, Low: 4, Lowest: 4,
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

  /** Patch ADO-synced metadata from a webhook without touching status. */
  async updateAdoMeta(
    externalId: string,
    meta: { adoAssignedTo?: string | null; priority?: string; dueDate?: Date | null; title?: string },
  ): Promise<void> {
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
    const payload   = JSON.parse(req.payload) as Record<string, unknown>;
    const fieldDefs = req.templateId && this.deps.formTemplates
      ? (await this.deps.formTemplates.findById(req.templateId))?.fieldSchema ?? []
      : [];

    const ref = await this.deps.tickets.create({
      title:            `[${req.reference}] ${req.title}`,
      body:             this.buildHtmlBody(req, payload, fieldDefs),
      priority:         req.priority,
      requestReference: req.reference,
      requestType:      req.requestType,
      requesterEmail,
      targetProjectId:  req.adoProjectName ?? undefined,
      nativeFields:     this.buildNativeFields(req),
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

  /** Build native ADO field name → value pairs to be applied alongside the base patch ops. */
  private buildNativeFields(req: Request): Record<string, unknown> {
    const fields: Record<string, unknown> = {};

    const priority = PRIORITY_MAP[req.priority];
    if (priority != null) {
      fields['Microsoft.VSTS.Common.Priority'] = priority;
    }

    if (req.dueDate) {
      const iso = req.dueDate instanceof Date
        ? req.dueDate.toISOString().slice(0, 10)
        : String(req.dueDate);
      fields['Microsoft.VSTS.Scheduling.TargetDate'] = `${iso}T00:00:00.000Z`;
    }

    return fields;
  }

  private buildHtmlBody(
    req:       Request,
    payload:   Record<string, unknown>,
    fieldDefs: FormFieldDef[],
  ): string {
    const labelMap = new Map(fieldDefs.map(f => [f.name, f.label]));

    const dueDateStr = req.dueDate
      ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          .format(req.dueDate instanceof Date ? req.dueDate : new Date(req.dueDate))
      : 'Not set';

    const baseRows = [
      ['Reference',    req.reference],
      ['Request Type', req.requestType],
      ['Priority',     req.priority],
      ['Due Date',     dueDateStr],
    ].map(([label, value]) => this.tr(label, escapeHtml(value))).join('');

    // Render each payload field except known system fields
    const SKIP = new Set(['priority', 'dueDate', 'due_date', 'attachment']);
    let notesSections = '';
    const payloadRows = Object.entries(payload)
      .filter(([key]) => !SKIP.has(key))
      .map(([key, val]) => {
        const label = labelMap.get(key) ?? prettifyKey(key);
        const fieldDef = fieldDefs.find(f => f.name === key);

        if (fieldDef?.type === 'richtext' && typeof val === 'string' && val) {
          // Rich text goes into a separate section below the table
          notesSections += `<h2>${escapeHtml(label)}</h2><div>${val}</div>`;
          return null;
        }
        if (fieldDef?.type === 'attachment') return null;

        const display = Array.isArray(val)
          ? escapeHtml(val.join(', '))
          : val == null ? '' : escapeHtml(String(val));
        return this.tr(label, display);
      })
      .filter(Boolean)
      .join('');

    return `<h2>Request Information</h2>
<table style="border-collapse:collapse;width:100%">${baseRows}${payloadRows}</table>
${notesSections}
<hr/>
<p style="color:#888;font-size:12px">Submitted via Provana Portal</p>`;
  }

  private tr(label: string, value: string): string {
    return `<tr><td style="padding:6px 12px;font-weight:bold;width:200px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 12px">${value}</td></tr>`;
  }

  private toSummary(r: Request): RequestSummary {
    let payloadData: Record<string, unknown> = {};
    try { payloadData = JSON.parse(r.payload); } catch {}
    return { ...r, payloadData };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function prettifyKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/^\s/, '')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
