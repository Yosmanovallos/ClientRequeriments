import type { PrismaClient } from '@prisma/client';
import type { Comment } from './Comment';

export interface ICommentsRepository {
  add(c: Comment): Promise<Comment>;
  listByRequest(requestId: string, includeInternal?: boolean): Promise<Comment[]>;
  setAdoCommentId(commentId: string, adoCommentId: string): Promise<void>;
  findByAdoCommentId(adoCommentId: string, requestId: string): Promise<Comment | null>;
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

  async setAdoCommentId(commentId: string, adoCommentId: string): Promise<void> {
    for (const list of this.store.values()) {
      const c = list.find(x => x.id === commentId);
      if (c) { (c as Comment).adoCommentId = adoCommentId; return; }
    }
  }

  async findByAdoCommentId(adoCommentId: string, requestId: string): Promise<Comment | null> {
    const list = this.store.get(requestId) ?? [];
    return list.find(c => c.adoCommentId === adoCommentId) ?? null;
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
        adoCommentId: c.adoCommentId ?? null,
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

  async setAdoCommentId(commentId: string, adoCommentId: string): Promise<void> {
    await this.prisma.comment.update({
      where: { id: commentId },
      data:  { adoCommentId },
    });
  }

  async findByAdoCommentId(adoCommentId: string, requestId: string): Promise<Comment | null> {
    const row = await this.prisma.comment.findFirst({
      where: { adoCommentId, requestId },
    });
    return row ? this.toDomain(row) : null;
  }

  private toDomain = (r: {
    id: string; requestId: string; body: string; author: string | null;
    authorUserId: string | null; visibility: string; source: string;
    adoCommentId?: string | null; createdAt: Date;
  }): Comment => ({
    id:           r.id,
    requestId:    r.requestId,
    body:         r.body,
    author:       r.author,
    authorUserId: r.authorUserId,
    visibility:   r.visibility as Comment['visibility'],
    source:       r.source as Comment['source'],
    adoCommentId: r.adoCommentId ?? null,
    createdAt:    r.createdAt,
  });
}
