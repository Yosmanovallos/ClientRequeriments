import type { PrismaClient } from '@prisma/client';
import type { Project, CreateProjectCmd, UpdateProjectPatch, ProjectMember, ProjectSummary } from './ProjectEntity.js';

export interface IProjectRepository {
  create(cmd: CreateProjectCmd): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  findBySlug(clientId: string, slug: string): Promise<Project | null>;
  /** List all projects in a client. SuperAdmin uses `undefined` clientId to see ALL clients' projects. */
  list(clientId?: string): Promise<Project[]>;
  /** List a specific set of project IDs (for Agent/Client filtered views). */
  listByIds(ids: string[]): Promise<Project[]>;
  update(id: string, patch: UpdateProjectPatch): Promise<Project>;
  archive(id: string): Promise<void>;

  // Members
  addMember(projectId: string, userId: string): Promise<ProjectMember>;
  removeMember(projectId: string, userId: string): Promise<void>;
  listMembers(projectId: string): Promise<ProjectMember[]>;

  /** With counts — used by Control Panel project list. */
  listWithSummary(clientId?: string): Promise<ProjectSummary[]>;
}

// ── InMemory ────────────────────────────────────────────────────────────────
export class InMemoryProjectRepository implements IProjectRepository {
  private readonly projects = new Map<string, Project>();
  private readonly members  = new Map<string, ProjectMember>();

  async create(cmd: CreateProjectCmd): Promise<Project> {
    const now = new Date();
    const p: Project = {
      id:          crypto.randomUUID(),
      clientId:    cmd.clientId,
      name:        cmd.name,
      slug:        cmd.slug,
      description: cmd.description ?? null,
      iconUrl:     cmd.iconUrl ?? null,
      isActive:    true,
      createdAt:   now,
      updatedAt:   now,
    };
    this.projects.set(p.id, p);
    return p;
  }

  async findById(id: string): Promise<Project | null> {
    return this.projects.get(id) ?? null;
  }

  async findBySlug(clientId: string, slug: string): Promise<Project | null> {
    for (const p of this.projects.values()) {
      if (p.clientId === clientId && p.slug === slug) return p;
    }
    return null;
  }

  async list(clientId?: string): Promise<Project[]> {
    return [...this.projects.values()]
      .filter(p => !clientId || p.clientId === clientId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listByIds(ids: string[]): Promise<Project[]> {
    return ids.map(id => this.projects.get(id)).filter((p): p is Project => p !== undefined);
  }

  async update(id: string, patch: UpdateProjectPatch): Promise<Project> {
    const p = this.projects.get(id);
    if (!p) throw new Error('Project not found');
    Object.assign(p, patch, { updatedAt: new Date() });
    return p;
  }

  async archive(id: string): Promise<void> {
    const p = this.projects.get(id);
    if (p) { p.isActive = false; p.updatedAt = new Date(); }
  }

  async addMember(projectId: string, userId: string): Promise<ProjectMember> {
    // Idempotent: same (project,user) returns the existing row
    for (const m of this.members.values()) {
      if (m.projectId === projectId && m.userId === userId) return m;
    }
    const m: ProjectMember = {
      id: crypto.randomUUID(), projectId, userId, createdAt: new Date(),
    };
    this.members.set(m.id, m);
    return m;
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    for (const [id, m] of this.members) {
      if (m.projectId === projectId && m.userId === userId) {
        this.members.delete(id);
        return;
      }
    }
  }

  async listMembers(projectId: string): Promise<ProjectMember[]> {
    return [...this.members.values()].filter(m => m.projectId === projectId);
  }

  async listWithSummary(clientId?: string): Promise<ProjectSummary[]> {
    const list = await this.list(clientId);
    return list.map(p => ({
      ...p,
      memberCount:  [...this.members.values()].filter(m => m.projectId === p.id).length,
      requestCount: 0,    // InMemory has no cross-module link; tests stub this
      formCount:    0,
    }));
  }
}

// ── Prisma ──────────────────────────────────────────────────────────────────
export class PrismaProjectRepository implements IProjectRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(cmd: CreateProjectCmd): Promise<Project> {
    const row = await this.prisma.project.create({
      data: {
        clientId:    cmd.clientId,
        name:        cmd.name,
        slug:        cmd.slug,
        description: cmd.description ?? null,
        iconUrl:     cmd.iconUrl ?? null,
      },
    });
    return this.toDomain(row);
  }

  async findById(id: string): Promise<Project | null> {
    const row = await this.prisma.project.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findBySlug(clientId: string, slug: string): Promise<Project | null> {
    const row = await this.prisma.project.findUnique({
      where: { clientId_slug: { clientId, slug } },
    });
    return row ? this.toDomain(row) : null;
  }

  async list(clientId?: string): Promise<Project[]> {
    const rows = await this.prisma.project.findMany({
      where: clientId ? { clientId } : undefined,
      orderBy: { name: 'asc' },
    });
    return rows.map(this.toDomain);
  }

  async listByIds(ids: string[]): Promise<Project[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.project.findMany({
      where: { id: { in: ids } },
      orderBy: { name: 'asc' },
    });
    return rows.map(this.toDomain);
  }

  async update(id: string, patch: UpdateProjectPatch): Promise<Project> {
    const row = await this.prisma.project.update({ where: { id }, data: patch });
    return this.toDomain(row);
  }

  async archive(id: string): Promise<void> {
    await this.prisma.project.update({ where: { id }, data: { isActive: false } });
  }

  async addMember(projectId: string, userId: string): Promise<ProjectMember> {
    // upsert for idempotency
    const row = await this.prisma.projectMember.upsert({
      where:  { projectId_userId: { projectId, userId } },
      update: {},
      create: { projectId, userId },
    });
    return { id: row.id, projectId: row.projectId, userId: row.userId, createdAt: row.createdAt };
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    await this.prisma.projectMember.deleteMany({ where: { projectId, userId } });
  }

  async listMembers(projectId: string): Promise<ProjectMember[]> {
    const rows = await this.prisma.projectMember.findMany({ where: { projectId } });
    return rows.map(r => ({ id: r.id, projectId: r.projectId, userId: r.userId, createdAt: r.createdAt }));
  }

  async listWithSummary(clientId?: string): Promise<ProjectSummary[]> {
    const rows = await this.prisma.project.findMany({
      where: clientId ? { clientId } : undefined,
      include: {
        _count: { select: { members: true, requests: true, formConfigs: true } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map(r => ({
      ...this.toDomain(r),
      memberCount:  r._count.members,
      requestCount: r._count.requests,
      formCount:    r._count.formConfigs,
    }));
  }

  private toDomain = (r: {
    id: string; clientId: string; name: string; slug: string;
    description: string | null; iconUrl?: string | null; isActive: boolean;
    createdAt: Date; updatedAt: Date;
  }): Project => ({
    id:          r.id,
    clientId:    r.clientId,
    name:        r.name,
    slug:        r.slug,
    description: r.description,
    iconUrl:     r.iconUrl ?? null,
    isActive:    r.isActive,
    createdAt:   r.createdAt,
    updatedAt:   r.updatedAt,
  });
}
