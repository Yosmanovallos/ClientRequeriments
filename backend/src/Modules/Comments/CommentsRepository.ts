import type { PrismaClient } from '@prisma/client';
import type { Comment } from './Comment';

export interface ICommentsRepository {
  add(c: Comment): Promise<Comment>;
  listByRequest(requestId: string, includeInternal?: boolean): Promise<Comment[]>;
}

// ── InMemory implementation (used when no DATABASE_URL) ─────────────────────
export class InMemoryCommentsRepository implements ICommentsRepository {
  private readonly store = new Map<string, Comment[]>();

  async add(c: Comment): Promise<Comment> {
    const list = this.store.get(c.requestId) ?? [];
    list.push(c);
    this.store.set(c.requestId, list);
    return c;
  }

  async listByRequest(requestId: string, includeInternal = false): Promise<Comment[]> {
    const all = this.store.get(requestId) ?? [];
    return includeInternal ? all : all.filter(c => c.visibility === 'public');
  }
}

// ── Prisma implementation ─────────────────────────────────────────────────
export class PrismaCommentsRepository implements ICommentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async add(c: Comment): Promise<Comment> {
    const row = await this.prisma.comment.create({
      data: {
        id:           c.id,
        requestId:    c.requestId,
        body:         c.body,
        author:       c.author,
        authorUserId: c.authorUserId,
        visibility:   c.visibility,
        source:       c.source,
      },
    });
    return this.toDomain(row);
  }

  async listByRequest(requestId: string, includeInternal = false): Promise<Comment[]> {
    const rows = await this.prisma.comment.findMany({
      where: { requestId, ...(includeInternal ? {} : { visibility: 'public' }) },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(this.toDomain);
  }

  private toDomain = (r: {
    id: string; requestId: string; body: string; author: string | null;
    authorUserId: string | null; visibility: string; source: string; createdAt: Date;
  }): Comment => ({
    id:           r.id,
    requestId:    r.requestId,
    body:         r.body,
    author:       r.author,
    authorUserId: r.authorUserId,
    visibility:   r.visibility as Comment['visibility'],
    source:       r.source as Comment['source'],
    createdAt:    r.createdAt,
  });
}
