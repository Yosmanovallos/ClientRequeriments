import type { PortalUser, PortalUserWithProjects, CreatePortalUserCmd } from './UserEntity.js';
import type { IUserRepository } from './UserRepository.js';
import type { IProjectRepository } from './ProjectRepository.js';
import { canAssignRole, ROLES, type Role } from './Role.js';
import { Errors } from '../../Shared/errors.js';

interface Deps {
  users:    IUserRepository;
  projects: IProjectRepository;
}

export interface SetupUserCmd {
  /** Role to assign (or null to reset to PENDING). */
  role:        Role | null;
  /** Project IDs to assign — replaces the current set. */
  projectIds:  string[];
}

export class UserService {
  constructor(private readonly deps: Deps) {}

  async me(authUserId: string): Promise<PortalUserWithProjects> {
    const u = await this.deps.users.findByAuthUserId(authUserId);
    if (!u) throw Errors.notFound('User not found');
    return u;
  }

  async getById(id: string): Promise<PortalUser> {
    const u = await this.deps.users.findById(id);
    if (!u) throw Errors.notFound(`User ${id} not found`);
    return u;
  }

  async listPending(clientId?: string): Promise<PortalUserWithProjects[]> {
    return this.deps.users.listPending(clientId);
  }

  async listAll(clientId?: string): Promise<PortalUserWithProjects[]> {
    return this.deps.users.listAll(clientId);
  }

  async create(cmd: CreatePortalUserCmd): Promise<PortalUser> {
    if (!cmd.email.trim())   throw Errors.badRequest('email is required');
    if (!cmd.authUserId)     throw Errors.badRequest('authUserId is required');
    return this.deps.users.create(cmd);
  }

  /**
   * Assign a role to a user. The assigner (typically an Admin or SuperAdmin) must be
   * allowed to grant that role — see `canAssignRole` for the privilege-escalation rule.
   */
  async setRole(input: {
    userId:     string;
    role:       Role | null;
    assignerRole: Role | null;
  }): Promise<PortalUser> {
    if (input.role !== null && !ROLES.includes(input.role)) {
      throw Errors.badRequest(`Invalid role "${input.role}" — must be one of ${ROLES.join(', ')} or null`);
    }
    if (input.role !== null && !canAssignRole(input.assignerRole, input.role)) {
      throw Errors.forbidden(`Cannot assign role "${input.role}" — privilege escalation prevented`);
    }
    await this.getById(input.userId);
    await this.deps.users.setRole(input.userId, input.role);
    return this.getById(input.userId);
  }

  async setActive(userId: string, isActive: boolean): Promise<PortalUser> {
    await this.getById(userId);
    await this.deps.users.setActive(userId, isActive);
    return this.getById(userId);
  }

  /**
   * Replace the user's project memberships. Verifies every project exists.
   * Used both by the "setup user" flow (assign first project) and by per-user editing.
   */
  async setProjectMemberships(userId: string, projectIds: string[]): Promise<void> {
    await this.getById(userId);
    // Verify projects exist (silent ignore would mask typos)
    const found = await this.deps.projects.listByIds(projectIds);
    if (found.length !== projectIds.length) {
      throw Errors.badRequest('One or more projectIds do not exist');
    }
    await this.deps.users.setProjectMemberships(userId, projectIds);
  }

  /** One-shot setup: assign role + projects together. Returns the updated user. */
  async setup(input: {
    userId:       string;
    cmd:          SetupUserCmd;
    assignerRole: Role | null;
  }): Promise<PortalUserWithProjects> {
    await this.setRole({ userId: input.userId, role: input.cmd.role, assignerRole: input.assignerRole });
    await this.setProjectMemberships(input.userId, input.cmd.projectIds);
    const u = await this.getById(input.userId);
    const projectIds      = await this.deps.users.listProjectIdsForUser(input.userId);
    const organizationIds = await this.deps.users.listOrgIdsForUser(input.userId);
    return { ...u, projectIds, organizationIds };
  }
}
