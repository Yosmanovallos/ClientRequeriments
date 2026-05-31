import type { Request, CreateRequestCmd, StatusHistoryEntry } from './Request';

export interface ListRequestsFilters {
  status?:     string;
  projectId?:  string;       // filter by a specific project
  projectIds?: string[];     // filter by ANY of these (used when no project is selected)
  createdBy?:  string;       // restrict to requests submitted by this email (CLIENT scope)
}

export interface IRequestsRepository {
  create(cmd: CreateRequestCmd & { id: string; reference: string }): Promise<Request>;
  findByIdempotencyKey(key: string): Promise<Request | null>;
  findById(id: string, clientId: string): Promise<Request | null>;
  /** Look up a request by its external ticket id (e.g. GitHub issue number). No clientId filter — webhooks aren't authenticated by tenant. */
  findByExternalRef(externalId: string): Promise<Request | null>;
  list(clientId: string, filters?: ListRequestsFilters): Promise<Request[]>;
  updateStatus(id: string, toStatus: string, fromStatus: string, source: string, actor: string | null): Promise<void>;
  saveExternalRef(id: string, externalId: string, externalUrl: string): Promise<void>;
  getHistory(requestId: string): Promise<StatusHistoryEntry[]>;
  nextReference(clientId: string, prefix: string): Promise<string>;
}

/**
 * InMemoryRequestsRepository — used when DATABASE_URL is not set.
 * Drop-in replacement for PrismaRequestsRepository; see Phase 3 of the blueprint.
 */
export class InMemoryRequestsRepository implements IRequestsRepository {
  private readonly requests = new Map<string, Request>();
  private readonly history  = new Map<string, StatusHistoryEntry[]>();
  private readonly counters = new Map<string, number>();   // per-client sequence (matches client_ref_counters table)

  async create(cmd: CreateRequestCmd & { id: string; reference: string }): Promise<Request> {
    const now = new Date();
    const req: Request = {
      id:             cmd.id,
      clientId:       cmd.clientId,
      projectId:      cmd.projectId,
      reference:      cmd.reference,
      requestType:    cmd.requestType,
      title:          cmd.title,
      status:         'NEW',
      priority:       cmd.priority,
      dueDate:        cmd.dueDate,
      payload:        JSON.stringify(cmd.payload),
      idempotencyKey: cmd.idempotencyKey,
      createdBy:      cmd.createdBy,
      adoWorkItemId:  null,
      adoWorkItemUrl: null,
      createdAt:      now,
      updatedAt:      now,
    };
    this.requests.set(cmd.id, req);
    await this.recordHistory(cmd.id, null, 'NEW', 'portal', cmd.createdBy);
    return req;
  }

  async findByIdempotencyKey(key: string): Promise<Request | null> {
    for (const r of this.requests.values()) {
      if (r.idempotencyKey === key) return r;
    }
    return null;
  }

  async findById(id: string, clientId: string): Promise<Request | null> {
    const r = this.requests.get(id);
    return r && r.clientId === clientId ? r : null;
  }

  async findByExternalRef(externalId: string): Promise<Request | null> {
    for (const r of this.requests.values()) {
      if (r.adoWorkItemId === externalId) return r;
    }
    return null;
  }

  async list(clientId: string, filters?: ListRequestsFilters): Promise<Request[]> {
    return [...this.requests.values()]
      .filter(r => r.clientId === clientId)
      .filter(r => !filters?.status     || r.status    === filters.status)
      .filter(r => !filters?.projectId  || r.projectId === filters.projectId)
      .filter(r => !filters?.projectIds || filters.projectIds.length === 0 || filters.projectIds.includes(r.projectId ?? ''))
      .filter(r => !filters?.createdBy  || r.createdBy === filters.createdBy)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateStatus(id: string, toStatus: string, fromStatus: string, source: string, actor: string | null): Promise<void> {
    const r = this.requests.get(id);
    if (!r) return;
    r.status    = toStatus as Request['status'];
    r.updatedAt = new Date();
    await this.recordHistory(id, fromStatus, toStatus, source, actor);
  }

  async saveExternalRef(id: string, externalId: string, externalUrl: string): Promise<void> {
    const r = this.requests.get(id);
    if (r) { r.adoWorkItemId = externalId; r.adoWorkItemUrl = externalUrl; }
  }

  async getHistory(requestId: string): Promise<StatusHistoryEntry[]> {
    return this.history.get(requestId) ?? [];
  }

  async nextReference(clientId: string, prefix: string): Promise<string> {
    // Seed at 629 for the demo client so refs continue from CBLPBR-630 (matches legacy demo data).
    const start = this.counters.get(clientId) ?? (prefix === 'CBLPBR' ? 629 : 0);
    const next  = start + 1;
    this.counters.set(clientId, next);
    return `${prefix}-${next}`;
  }

  private async recordHistory(requestId: string, from: string | null, to: string, source: string, actor: string | null) {
    const list = this.history.get(requestId) ?? [];
    list.push({
      id: crypto.randomUUID(),
      requestId,
      fromStatus: from,
      toStatus:   to,
      changedAt:  new Date(),
      source,
      actor,
    });
    this.history.set(requestId, list);
  }
}
