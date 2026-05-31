import type { PrismaClient } from '@prisma/client';
import type { Attachment } from './Attachment.js';

export interface IAttachmentsRepository {
  add(att: Attachment): Promise<Attachment>;
  findById(id: string, clientId: string): Promise<Attachment | null>;
  listByRequest(requestId: string, clientId: string): Promise<Attachment[]>;
  remove(id: string, clientId: string): Promise<boolean>;
}

// ── InMemory implementation ─────────────────────────────────────────────────
export class InMemoryAttachmentsRepository implements IAttachmentsRepository {
  private readonly store = new Map<string, Attachment>();

  async add(att: Attachment): Promise<Attachment> {
    this.store.set(att.id, att);
    return att;
  }

  async findById(id: string, clientId: string): Promise<Attachment | null> {
    const a = this.store.get(id);
    return a && a.clientId === clientId ? a : null;
  }

  async listByRequest(requestId: string, clientId: string): Promise<Attachment[]> {
    return [...this.store.values()]
      .filter(a => a.requestId === requestId && a.clientId === clientId)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  async remove(id: string, clientId: string): Promise<boolean> {
    const a = this.store.get(id);
    if (!a || a.clientId !== clientId) return false;
    this.store.delete(id);
    return true;
  }
}

// ── Prisma implementation ──────────────────────────────────────────────────
export class PrismaAttachmentsRepository implements IAttachmentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async add(att: Attachment): Promise<Attachment> {
    const row = await this.prisma.attachment.create({ data: att });
    return this.toDomain(row);
  }

  async findById(id: string, clientId: string): Promise<Attachment | null> {
    const row = await this.prisma.attachment.findFirst({ where: { id, clientId } });
    return row ? this.toDomain(row) : null;
  }

  async listByRequest(requestId: string, clientId: string): Promise<Attachment[]> {
    const rows = await this.prisma.attachment.findMany({
      where: { requestId, clientId },
      orderBy: { uploadedAt: 'desc' },
    });
    return rows.map(this.toDomain);
  }

  async remove(id: string, clientId: string): Promise<boolean> {
    const result = await this.prisma.attachment.deleteMany({ where: { id, clientId } });
    return result.count > 0;
  }

  private toDomain = (r: {
    id: string; requestId: string; clientId: string; fileName: string;
    contentType: string; size: number; storageKey: string; uploadedBy: string; uploadedAt: Date;
  }): Attachment => ({
    id: r.id, requestId: r.requestId, clientId: r.clientId,
    fileName: r.fileName, contentType: r.contentType, size: r.size,
    storageKey: r.storageKey, uploadedBy: r.uploadedBy, uploadedAt: r.uploadedAt,
  });
}
