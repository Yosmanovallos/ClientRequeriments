import type { Organization, OrganizationMemberRow, UpdateOrganizationPatch } from './Organization.js';
import type { IOrganizationRepository } from './OrganizationRepository.js';
import type { IUserRepository } from '../IAM/UserRepository.js';
import { Errors } from '../../Shared/errors.js';

interface Deps {
  orgs:  IOrganizationRepository;
  users: IUserRepository;
}

export class OrganizationService {
  constructor(private readonly deps: Deps) {}

  async create(input: {
    clientId:    string;
    projectId:   string;
    name:        string;
    description: string | null;
  }): Promise<Organization> {
    if (!input.name.trim()) throw Errors.badRequest('Organization name is required');

    // Duplicate name check within project
    const existing = await this.deps.orgs.listByProject(input.projectId);
    if (existing.some(o => o.name.toLowerCase() === input.name.trim().toLowerCase())) {
      throw Errors.conflict(`An organization named "${input.name}" already exists in this project`);
    }

    return this.deps.orgs.create({
      id:          crypto.randomUUID(),
      clientId:    input.clientId,
      projectId:   input.projectId,
      name:        input.name.trim(),
      description: input.description,
    });
  }

  async getById(id: string): Promise<Organization> {
    const o = await this.deps.orgs.findById(id);
    if (!o) throw Errors.notFound(`Organization ${id} not found`);
    return o;
  }

  async listByProject(projectId: string): Promise<Organization[]> {
    return this.deps.orgs.listByProject(projectId);
  }

  async update(id: string, patch: UpdateOrganizationPatch): Promise<Organization> {
    const o = await this.getById(id);
    if (patch.name !== undefined && !patch.name.trim()) {
      throw Errors.badRequest('Organization name cannot be empty');
    }
    if (patch.name && patch.name.trim().toLowerCase() !== o.name.toLowerCase()) {
      const existing = await this.deps.orgs.listByProject(o.projectId);
      if (existing.some(e => e.id !== id && e.name.toLowerCase() === patch.name!.trim().toLowerCase())) {
        throw Errors.conflict(`An organization named "${patch.name}" already exists in this project`);
      }
    }
    return this.deps.orgs.update(id, patch);
  }

  async delete(id: string): Promise<void> {
    await this.getById(id);
    // Sync InMemory user-org map before deleting (no-op in Prisma — cascade handles it)
    const members = await this.deps.orgs.listMembers(id);
    for (const m of members) {
      await this.deps.users.removeOrgMembership(m.userId, id);
    }
    await this.deps.orgs.delete(id);
  }

  async addMember(orgId: string, userId: string): Promise<OrganizationMemberRow> {
    await this.getById(orgId);
    const member = await this.deps.orgs.addMember(orgId, userId);
    await this.deps.users.addOrgMembership(userId, orgId);
    return member;
  }

  async removeMember(orgId: string, userId: string): Promise<void> {
    await this.getById(orgId);
    await this.deps.orgs.removeMember(orgId, userId);
    await this.deps.users.removeOrgMembership(userId, orgId);
  }

  async listMembers(orgId: string): Promise<OrganizationMemberRow[]> {
    await this.getById(orgId);
    return this.deps.orgs.listMembers(orgId);
  }
}
