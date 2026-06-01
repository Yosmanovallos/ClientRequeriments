import type { PrismaClient } from '@prisma/client';
import type { PortalUser, CreatePortalUserCmd, PortalUserWithProjects } from './UserEntity.js';
import type { Role } from './Role.js';

export interface IUserRepository {
  /** Find by IIdentityProvider's `sub` (Supabase auth.users.id / Entra object id). */
  findByAuthUserId(authUserId: string): Promise<PortalUserWithProjects | null>;
  findById(id: string): Promise<PortalUser | null>;
  /** Pending users (role = null) — for the admin approval queue. Includes projectIds. */
  listPending(clientId?: string): Promise<PortalUserWithProjects[]>;
  /** Active + pending. clientId filter for Admin; SuperAdmin passes undefined. Includes projectIds. */
  listAll(clientId?: string): Promise<PortalUserWithProjects[]>;
  create(cmd: CreatePortalUserCmd): Promise<PortalUser>;
  setRole(id: string, role: Role | null): Promise<void>;
  setActive(id: string, isActive: boolean): Promise<void>;
  /** Replace the user's project memberships atomically. */
  setProjectMemberships(userId: string, projectIds: string[]): Promise<void>;
  listProjectIdsForUser(userId: string): Promise<string[]>;
  /** Keep user's org membership cache in sync (InMemory only; no-op in Prisma). */
  addOrgMembership(userId: string, orgId: string): Promise<void>;
  removeOrgMembership(userId: string, orgId: string): Promise<void>;
  listOrgIdsForUser(userId: string): Promise<string[]>;
}

// ── InMemory implementation (no DB needed) ──────────────────────────────────
export class InMemoryUserRepository implements IUserRepository {
  private readonly users          = new Map<string, PortalUser>();
  private readonly memberships    = new Map<string, Set<string>>(); // userId → Set<projectId>
  private readonly orgMemberships = new Map<string, Set<string>>(); // userId → Set<orgId>

  async findByAuthUserId(authUserId: string): Promise<PortalUserWithProjects | null> {
    for (const u of this.users.values()) {
      if (u.authUserId === authUserId) {
        return {
          ...u,
          projectIds:      [...(this.memberships.get(u.id) ?? [])],
          organizationIds: [...(this.orgMemberships.get(u.id) ?? [])],
        };
      }
    }
    return null;
  }

  async findById(id: string): Promise<PortalUser | null> {
    return this.users.get(id) ?? null;
  }

  async listPending(clientId?: string): Promise<PortalUserWithProjects[]> {
    return [...this.users.values()]
      .filter(u => u.role === null && (!clientId || u.clientId === clientId))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(u => ({
        ...u,
        projectIds:      [...(this.memberships.get(u.id) ?? [])],
        organizationIds: [...(this.orgMemberships.get(u.id) ?? [])],
      }));
  }

  async listAll(clientId?: string): Promise<PortalUserWithProjects[]> {
    return [...this.users.values()]
      .filter(u => !clientId || u.clientId === clientId)
      .sort((a, b) => a.email.localeCompare(b.email))
      .map(u => ({
        ...u,
        projectIds:      [...(this.memberships.get(u.id) ?? [])],
        organizationIds: [...(this.orgMemberships.get(u.id) ?? [])],
      }));
  }

  async create(cmd: CreatePortalUserCmd): Promise<PortalUser> {
    const now = new Date();
    const u: PortalUser = {
      id:          crypto.randomUUID(),
      clientId:    cmd.clientId,
      authUserId:  cmd.authUserId,
      email:       cmd.email,
      displayName: cmd.displayName,
      role:        null,
      isActive:    true,
      createdAt:   now,
      updatedAt:   now,
    };
    this.users.set(u.id, u);
    return u;
  }

  async setRole(id: string, role: Role | null): Promise<void> {
    const u = this.users.get(id);
    if (u) { u.role = role; u.updatedAt = new Date(); }
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    const u = this.users.get(id);
    if (u) { u.isActive = isActive; u.updatedAt = new Date(); }
  }

  async setProjectMemberships(userId: string, projectIds: string[]): Promise<void> {
    this.memberships.set(userId, new Set(projectIds));
  }

  async listProjectIdsForUser(userId: string): Promise<string[]> {
    return [...(this.memberships.get(userId) ?? [])];
  }

  async addOrgMembership(userId: string, orgId: string): Promise<void> {
    const set = this.orgMemberships.get(userId) ?? new Set<string>();
    set.add(orgId);
    this.orgMemberships.set(userId, set);
  }

  async removeOrgMembership(userId: string, orgId: string): Promise<void> {
    this.orgMemberships.get(userId)?.delete(orgId);
  }

  async listOrgIdsForUser(userId: string): Promise<string[]> {
    return [...(this.orgMemberships.get(userId) ?? [])];
  }
}

// ── Prisma implementation ───────────────────────────────────────────────────
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByAuthUserId(authUserId: string): Promise<PortalUserWithProjects | null> {
    const row = await this.prisma.portalUser.findUnique({
      where:   { authUserId },
      include: {
        memberships:    { select: { projectId: true } },
        orgMemberships: { select: { organizationId: true } },
      },
    });
    if (!row) return null;
    return {
      ...this.toDomain(row),
      projectIds:      row.memberships.map(m => m.projectId),
      organizationIds: row.orgMemberships.map(m => m.organizationId),
    };
  }

  async findById(id: string): Promise<PortalUser | null> {
    const row = await this.prisma.portalUser.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async listPending(clientId?: string): Promise<PortalUserWithProjects[]> {
    const rows = await this.prisma.portalUser.findMany({
      where:   { role: null, ...(clientId ? { clientId } : {}) },
      orderBy: { createdAt: 'asc' },
      include: {
        memberships:    { select: { projectId: true } },
        orgMemberships: { select: { organizationId: true } },
      },
    });
    return rows.map(r => ({
      ...this.toDomain(r),
      projectIds:      r.memberships.map(m => m.projectId),
      organizationIds: r.orgMemberships.map(m => m.organizationId),
    }));
  }

  async listAll(clientId?: string): Promise<PortalUserWithProjects[]> {
    const rows = await this.prisma.portalUser.findMany({
      where:   clientId ? { clientId } : undefined,
      orderBy: { email: 'asc' },
      include: {
        memberships:    { select: { projectId: true } },
        orgMemberships: { select: { organizationId: true } },
      },
    });
    return rows.map(r => ({
      ...this.toDomain(r),
      projectIds:      r.memberships.map(m => m.projectId),
      organizationIds: r.orgMemberships.map(m => m.organizationId),
    }));
  }

  async create(cmd: CreatePortalUserCmd): Promise<PortalUser> {
    const row = await this.prisma.portalUser.create({
      data: {
        clientId:    cmd.clientId,
        authUserId:  cmd.authUserId,
        email:       cmd.email,
        displayName: cmd.displayName,
        // role + isActive default at the DB level (null / true)
      },
    });
    return this.toDomain(row);
  }

  async setRole(id: string, role: Role | null): Promise<void> {
    await this.prisma.portalUser.update({ where: { id }, data: { role } });
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.prisma.portalUser.update({ where: { id }, data: { isActive } });
  }

  async setProjectMemberships(userId: string, projectIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.projectMember.deleteMany({ where: { userId } });
      if (projectIds.length > 0) {
        await tx.projectMember.createMany({
          data: projectIds.map(projectId => ({ userId, projectId })),
        });
      }
    });
  }

  async listProjectIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: { userId }, select: { projectId: true },
    });
    return rows.map(r => r.projectId);
  }

  /** No-op in Prisma — org memberships are written by OrganizationRepository and read via JOIN. */
  async addOrgMembership(_userId: string, _orgId: string): Promise<void> {}

  /** No-op in Prisma — deletion is handled by OrganizationRepository or FK cascade. */
  async removeOrgMembership(_userId: string, _orgId: string): Promise<void> {}

  async listOrgIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.organizationMember.findMany({
      where:  { userId },
      select: { organizationId: true },
    });
    return rows.map(r => r.organizationId);
  }

  private toDomain = (r: {
    id: string; clientId: string; authUserId: string;
    email: string; displayName: string;
    role: string | null; isActive: boolean;
    createdAt: Date; updatedAt: Date;
  }): PortalUser => ({
    id:          r.id,
    clientId:    r.clientId,
    authUserId:  r.authUserId,
    email:       r.email,
    displayName: r.displayName,
    role:        r.role as Role | null,
    isActive:    r.isActive,
    createdAt:   r.createdAt,
    updatedAt:   r.updatedAt,
  });
}
