import type { PrismaClient } from '@prisma/client';
import type {
  Organization, CreateOrganizationCmd, UpdateOrganizationPatch, OrganizationMemberRow,
} from './Organization.js';

export interface IOrganizationRepository {
  create(cmd: CreateOrganizationCmd & { id: string }): Promise<Organization>;
  findById(id: string): Promise<Organization | null>;
  /** List all orgs for a project. */
  listByProject(projectId: string): Promise<Organization[]>;
  /** List orgs the user belongs to (across all projects). */
  listByUserId(userId: string): Promise<Organization[]>;
  update(id: string, patch: UpdateOrganizationPatch): Promise<Organization>;
  delete(id: string): Promise<void>;

  // Members
  addMember(orgId: string, userId: string): Promise<OrganizationMemberRow>;
  removeMember(orgId: string, userId: string): Promise<void>;
  listMembers(orgId: string): Promise<OrganizationMemberRow[]>;
}

// ── InMemory ────────────────────────────────────────────────────────────────
export class InMemoryOrganizationRepository implements IOrganizationRepository {
  private readonly orgs    = new Map<string, Organization>();
  // orgId → Set<userId>
  private readonly members = new Map<string, Set<string>>();

  async create(cmd: CreateOrganizationCmd & { id: string }): Promise<Organization> {
    const now = new Date();
    const org: Organization = {
      id:          cmd.id,
      clientId:    cmd.clientId,
      projectId:   cmd.projectId,
      name:        cmd.name,
      description: cmd.description,
      isActive:    true,
      createdAt:   now,
      updatedAt:   now,
    };
    this.orgs.set(org.id, org);
    return org;
  }

  async findById(id: string): Promise<Organization | null> {
    return this.orgs.get(id) ?? null;
  }

  async listByProject(projectId: string): Promise<Organization[]> {
    return [...this.orgs.values()]
      .filter(o => o.projectId === projectId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(o => ({ ...o, memberCount: this.members.get(o.id)?.size ?? 0 }));
  }

  async listByUserId(userId: string): Promise<Organization[]> {
    const orgIds: string[] = [];
    for (const [orgId, userSet] of this.members) {
      if (userSet.has(userId)) orgIds.push(orgId);
    }
    return orgIds.map(id => this.orgs.get(id)).filter((o): o is Organization => o !== undefined);
  }

  async update(id: string, patch: UpdateOrganizationPatch): Promise<Organization> {
    const o = this.orgs.get(id);
    if (!o) throw new Error('Organization not found');
    Object.assign(o, patch, { updatedAt: new Date() });
    return o;
  }

  async delete(id: string): Promise<void> {
    this.orgs.delete(id);
    this.members.delete(id);
  }

  async addMember(orgId: string, userId: string): Promise<OrganizationMemberRow> {
    const set = this.members.get(orgId) ?? new Set<string>();
    set.add(userId);
    this.members.set(orgId, set);
    return { id: crypto.randomUUID(), organizationId: orgId, userId, createdAt: new Date() };
  }

  async removeMember(orgId: string, userId: string): Promise<void> {
    this.members.get(orgId)?.delete(userId);
  }

  async listMembers(orgId: string): Promise<OrganizationMemberRow[]> {
    return [...(this.members.get(orgId) ?? [])].map(userId => ({
      id:             crypto.randomUUID(),
      organizationId: orgId,
      userId,
      createdAt:      new Date(),
    }));
  }
}

// ── Prisma ──────────────────────────────────────────────────────────────────
export class PrismaOrganizationRepository implements IOrganizationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(cmd: CreateOrganizationCmd & { id: string }): Promise<Organization> {
    const row = await this.prisma.organization.create({
      data: {
        id:          cmd.id,
        clientId:    cmd.clientId,
        projectId:   cmd.projectId,
        name:        cmd.name,
        description: cmd.description,
      },
    });
    return this.toDomain(row);
  }

  async findById(id: string): Promise<Organization | null> {
    const row = await this.prisma.organization.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async listByProject(projectId: string): Promise<Organization[]> {
    const rows = await this.prisma.organization.findMany({
      where:   { projectId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    return rows.map(r => ({ ...this.toDomain(r), memberCount: r._count.members }));
  }

  async listByUserId(userId: string): Promise<Organization[]> {
    const rows = await this.prisma.organization.findMany({
      where:   { members: { some: { userId } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(this.toDomain);
  }

  async update(id: string, patch: UpdateOrganizationPatch): Promise<Organization> {
    const row = await this.prisma.organization.update({ where: { id }, data: patch });
    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    // organization_members cascade-deleted by FK constraint
    await this.prisma.organization.delete({ where: { id } });
  }

  async addMember(orgId: string, userId: string): Promise<OrganizationMemberRow> {
    const row = await this.prisma.organizationMember.upsert({
      where:  { organizationId_userId: { organizationId: orgId, userId } },
      update: {},
      create: { organizationId: orgId, userId },
    });
    return { id: row.id, organizationId: row.organizationId, userId: row.userId, createdAt: row.createdAt };
  }

  async removeMember(orgId: string, userId: string): Promise<void> {
    await this.prisma.organizationMember.deleteMany({
      where: { organizationId: orgId, userId },
    });
  }

  async listMembers(orgId: string): Promise<OrganizationMemberRow[]> {
    const rows = await this.prisma.organizationMember.findMany({
      where: { organizationId: orgId },
    });
    return rows.map(r => ({
      id:             r.id,
      organizationId: r.organizationId,
      userId:         r.userId,
      createdAt:      r.createdAt,
    }));
  }

  private toDomain = (r: {
    id: string; clientId: string; projectId: string; name: string;
    description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date;
  }): Organization => ({
    id:          r.id,
    clientId:    r.clientId,
    projectId:   r.projectId,
    name:        r.name,
    description: r.description,
    isActive:    r.isActive,
    createdAt:   r.createdAt,
    updatedAt:   r.updatedAt,
  });
}
