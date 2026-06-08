import type { Request, CreateRequestCmd, StatusHistoryEntry } from './Request';

export interface ListRequestsFilters {
  status?:         string;
  projectId?:      string;       // filter by a specific project
  projectIds?:     string[];     // filter by ANY of these (used when no project is selected)
  createdBy?:      string;       // restrict to requests submitted by this email
  /** When both createdBy and organizationIds are set, the filter is an OR:
   *  show requests created by the user OR belonging to one of these orgs. */
  organizationIds?: string[];    // org-based visibility (combined with createdBy as OR)
}

export interface IRequestsRepository {
  create(cmd: CreateRequestCmd & { id: string; reference: string }): Promise<Request>;
  findByIdempotencyKey(key: string): Promise<Request | null>;
  findById(id: string, clientId: string): Promise<Request | null>;
  /** Look up a request by its human-readable reference (e.g. CBLGBR-1) within a tenant. */
  findByReference(reference: string, clientId: string): Promise<Request | null>;
  /** Look up a request by its external ticket id (e.g. GitHub issue number). No clientId filter — webhooks aren't authenticated by tenant. */
  findByExternalRef(externalId: string): Promise<Request | null>;
  list(clientId: string, filters?: ListRequestsFilters): Promise<Request[]>;
  updateStatus(id: string, toStatus: string, fromStatus: string, source: string, actor: string | null): Promise<void>;
  saveExternalRef(id: string, externalId: string, externalUrl: string): Promise<void>;
  /** Patch ADO-synced metadata (assigned-to, priority, due date, title) without touching status or other fields. */
  updateAdoMeta(id: string, meta: {
    adoAssignedTo?: string | null;
    priority?: string;
    dueDate?: Date | null;
    title?: string;
  }): Promise<void>;
  getHistory(requestId: string): Promise<StatusHistoryEntry[]>;
  /** Return the prefix configured for this project (e.g. "CFGMBR"), or null if unset. */
  findProjectPrefix(projectId: string): Promise<string | null>;
  /** Atomically increment the per-project counter and return the formatted reference (e.g. "CFGMBR-1"). */
  nextReference(projectId: string, prefix: string): Promise<string>;
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
      id:               cmd.id,
      clientId:         cmd.clientId,
      projectId:        cmd.projectId,
      organizationId:   cmd.organizationId,
      organizationName: null,
      templateId:      cmd.templateId ?? null,
      reference:       cmd.reference,
      requestType:     cmd.requestType,
      title:           cmd.title,
      status:          'NEW',
      priority:        cmd.priority,
      dueDate:         cmd.dueDate,
      payload:         JSON.stringify(cmd.payload),
      idempotencyKey:  cmd.idempotencyKey,
      createdBy:       cmd.createdBy,
      adoWorkItemId:   null,
      adoWorkItemUrl:  null,
      adoProjectName:   cmd.adoProjectName ?? null,
      adoAssignedTo:    null,
      templateSnapshot: cmd.templateSnapshot ?? null,
      createdAt:        now,
      updatedAt:        now,
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

  async findByReference(reference: string, clientId: string): Promise<Request | null> {
    for (const r of this.requests.values()) {
      if (r.reference === reference && r.clientId === clientId) return r;
    }
    return null;
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
      .filter(r => !filters?.status    || r.status    === filters.status)
      .filter(r => !filters?.projectId || r.projectId === filters.projectId)
      .filter(r => !filters?.projectIds || filters.projectIds.length === 0 || filters.projectIds.includes(r.projectId ?? ''))
      .filter(r => {
        // Org-based visibility: when organizationIds is set, apply an OR condition.
        // byCreator is only true when createdBy is set AND matches (not a fallback to true).
        if (filters?.organizationIds !== undefined) {
          const byCreator = !!filters.createdBy && r.createdBy === filters.createdBy;
          const byOrg     = r.organizationId != null && filters.organizationIds.includes(r.organizationId);
          return byCreator || byOrg;
        }
        // Simple createdBy filter (no org context)
        return !filters?.createdBy || r.createdBy === filters.createdBy;
      })
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

  async updateAdoMeta(id: string, meta: {
    adoAssignedTo?: string | null;
    priority?: string;
    dueDate?: Date | null;
    title?: string;
  }): Promise<void> {
    const r = this.requests.get(id);
    if (!r) return;
    if (meta.adoAssignedTo !== undefined) r.adoAssignedTo = meta.adoAssignedTo;
    if (meta.priority !== undefined) r.priority = meta.priority;
    if (meta.dueDate !== undefined) r.dueDate = meta.dueDate;
    if (meta.title !== undefined) r.title = meta.title;
    r.updatedAt = new Date();
  }

  async getHistory(requestId: string): Promise<StatusHistoryEntry[]> {
    return this.history.get(requestId) ?? [];
  }

  async findProjectPrefix(_projectId: string): Promise<string | null> {
    return null; // in-memory mode has no project metadata
  }

  async nextReference(projectId: string, prefix: string): Promise<string> {
    const start = this.counters.get(projectId) ?? 0;
    const next  = start + 1;
    this.counters.set(projectId, next);
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
