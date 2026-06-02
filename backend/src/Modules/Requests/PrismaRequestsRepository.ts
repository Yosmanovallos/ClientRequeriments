import type { PrismaClient } from '@prisma/client';
import type {
  IRequestsRepository,
  ListRequestsFilters,
} from './RequestsRepository';
import type { Request, CreateRequestCmd, StatusHistoryEntry, RequestStatus, RequestType } from './Request';

/**
 * Prisma-backed IRequestsRepository.
 *
 * Drop-in replacement for InMemoryRequestsRepository. Selected at startup
 * in app.ts when DATABASE_URL is set. Business logic (RequestsService) is unchanged.
 *
 * Race-safety notes:
 *  - nextReference() runs inside a transaction with an UPSERT on client_ref_counters;
 *    Postgres row-level locking serialises concurrent callers for the same clientId.
 *  - create() / updateStatus() each open their own transaction so a partial failure
 *    leaves the DB consistent (request + history row written atomically).
 */
export class PrismaRequestsRepository implements IRequestsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(cmd: CreateRequestCmd & { id: string; reference: string }): Promise<Request> {
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.request.create({
        data: {
          id:             cmd.id,
          clientId:       cmd.clientId,
          projectId:      cmd.projectId,
          organizationId: cmd.organizationId,
          templateId:     cmd.templateId ?? null,
          reference:      cmd.reference,
          requestType:    cmd.requestType,
          title:          cmd.title,
          status:         'NEW',
          priority:       cmd.priority,
          dueDate:        cmd.dueDate,
          payload:        JSON.stringify(cmd.payload),
          idempotencyKey: cmd.idempotencyKey,
          createdBy:      cmd.createdBy,
        },
      });
      await tx.statusHistory.create({
        data: {
          requestId:  cmd.id,
          fromStatus: null,
          toStatus:   'NEW',
          source:     'portal',
          actor:      cmd.createdBy,
        },
      });
      return row;
    });
    return this.toDomain(created);
  }

  async findByIdempotencyKey(key: string): Promise<Request | null> {
    const row = await this.prisma.request.findUnique({ where: { idempotencyKey: key } });
    return row ? this.toDomain(row) : null;
  }

  async findById(id: string, clientId: string): Promise<Request | null> {
    const row = await this.prisma.request.findFirst({ where: { id, clientId } });
    return row ? this.toDomain(row) : null;
  }

  async findByExternalRef(externalId: string): Promise<Request | null> {
    const row = await this.prisma.request.findFirst({ where: { adoWorkItemId: externalId } });
    return row ? this.toDomain(row) : null;
  }

  async list(clientId: string, filters?: ListRequestsFilters): Promise<Request[]> {
    // Build the project scope clause
    const projectClause = filters?.projectId
      ? { projectId: filters.projectId }
      : filters?.projectIds
        ? { projectId: { in: filters.projectIds } }
        : {};

    // Build the org-based visibility clause.
    // When organizationIds is set, combine createdBy (own requests) OR organizationId IN orgs.
    let visibilityClause: object = {};
    if (filters?.organizationIds !== undefined) {
      const orClauses: object[] = [];
      if (filters.createdBy) orClauses.push({ createdBy: filters.createdBy });
      if (filters.organizationIds.length > 0) {
        orClauses.push({ organizationId: { in: filters.organizationIds } });
      }
      if (orClauses.length > 0) visibilityClause = { OR: orClauses };
    } else if (filters?.createdBy) {
      visibilityClause = { createdBy: filters.createdBy };
    }

    const rows = await this.prisma.request.findMany({
      where: {
        clientId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...projectClause,
        ...visibilityClause,
      },
      include:  { organization: { select: { name: true } } },
      orderBy:  { createdAt: 'desc' },
    });
    return rows.map(this.toDomain);
  }

  async updateStatus(
    id: string, toStatus: string, fromStatus: string, source: string, actor: string | null,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({ where: { id }, data: { status: toStatus } });
      await tx.statusHistory.create({
        data: { requestId: id, fromStatus, toStatus, source, actor },
      });
    });
  }

  async saveExternalRef(id: string, externalId: string, externalUrl: string): Promise<void> {
    await this.prisma.request.update({
      where: { id },
      data:  { adoWorkItemId: externalId, adoWorkItemUrl: externalUrl },
    });
  }

  async getHistory(requestId: string): Promise<StatusHistoryEntry[]> {
    const rows = await this.prisma.statusHistory.findMany({
      where: { requestId },
      orderBy: { changedAt: 'asc' },
    });
    return rows.map((r) => ({
      id:         r.id,
      requestId:  r.requestId,
      fromStatus: r.fromStatus,
      toStatus:   r.toStatus,
      changedAt:  r.changedAt,
      source:     r.source,
      actor:      r.actor,
    }));
  }

  /**
   * Generate the next per-client reference (e.g. CBLPBR-630).
   * UPSERT + RETURNING is atomic at the row level in Postgres, so concurrent
   * callers for the same clientId get distinct sequential values.
   */
  async nextReference(clientId: string, prefix: string): Promise<string> {
    const row = await this.prisma.clientRefCounter.upsert({
      where:  { clientId },
      create: { clientId, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    return `${prefix}-${row.lastValue}`;
  }

  // ── private ─────────────────────────────────────────────────────────────

  private toDomain = (r: {
    id: string; clientId: string; projectId: string | null; organizationId?: string | null;
    templateId?: string | null;
    reference: string; requestType: string; title: string;
    status: string; priority: string; dueDate: Date | null; payload: string;
    idempotencyKey: string | null; createdBy: string | null;
    adoWorkItemId: string | null; adoWorkItemUrl: string | null;
    createdAt: Date; updatedAt: Date;
    organization?: { name: string } | null;
  }): Request => ({
    id:               r.id,
    clientId:         r.clientId,
    projectId:        r.projectId,
    organizationId:   r.organizationId ?? null,
    organizationName: r.organization?.name ?? null,
    templateId:     r.templateId ?? null,
    reference:      r.reference,
    requestType:    r.requestType as RequestType,
    title:          r.title,
    status:         r.status as RequestStatus,
    priority:       r.priority,
    dueDate:        r.dueDate,
    payload:        r.payload,
    idempotencyKey: r.idempotencyKey,
    createdBy:      r.createdBy,
    adoWorkItemId:  r.adoWorkItemId,
    adoWorkItemUrl: r.adoWorkItemUrl,
    createdAt:      r.createdAt,
    updatedAt:      r.updatedAt,
  });
}
