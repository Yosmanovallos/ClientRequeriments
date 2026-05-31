import type { Project, ProjectMember, ProjectSummary, UpdateProjectPatch } from './ProjectEntity.js';
import type { IProjectRepository } from './ProjectRepository.js';
import { Errors } from '../../Shared/errors.js';

interface Deps {
  projects: IProjectRepository;
}

const SLUG_RX = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export class ProjectService {
  constructor(private readonly deps: Deps) {}

  /**
   * Create a new project under a client. Slug must be URL-safe and unique within the client.
   * SuperAdmin can pass any clientId; Admin's clientId is forced server-side by the endpoint.
   */
  async create(input: { clientId: string; name: string; slug: string; description?: string | null; iconUrl?: string | null }): Promise<Project> {
    if (!input.name.trim())            throw Errors.badRequest('Project name is required');
    if (!SLUG_RX.test(input.slug))     throw Errors.badRequest('Project slug must be lowercase letters, digits, and hyphens (max 64 chars)');

    const dup = await this.deps.projects.findBySlug(input.clientId, input.slug);
    if (dup) throw Errors.conflict(`A project with slug "${input.slug}" already exists in this client`);

    return this.deps.projects.create({
      clientId:    input.clientId,
      name:        input.name.trim(),
      slug:        input.slug,
      description: input.description ?? null,
      iconUrl:     input.iconUrl ?? null,
    });
  }

  async getById(id: string): Promise<Project> {
    const p = await this.deps.projects.findById(id);
    if (!p) throw Errors.notFound(`Project ${id} not found`);
    return p;
  }

  async list(clientId?: string): Promise<Project[]> {
    return this.deps.projects.list(clientId);
  }

  async listByIds(ids: string[]): Promise<Project[]> {
    return this.deps.projects.listByIds(ids);
  }

  async listWithSummary(clientId?: string): Promise<ProjectSummary[]> {
    return this.deps.projects.listWithSummary(clientId);
  }

  async update(id: string, patch: UpdateProjectPatch): Promise<Project> {
    await this.getById(id);
    if (patch.name !== undefined && !patch.name.trim()) {
      throw Errors.badRequest('Project name cannot be empty');
    }
    return this.deps.projects.update(id, patch);
  }

  async archive(id: string): Promise<void> {
    await this.getById(id);
    await this.deps.projects.archive(id);
  }

  async addMember(projectId: string, userId: string): Promise<ProjectMember> {
    await this.getById(projectId);
    return this.deps.projects.addMember(projectId, userId);
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    await this.getById(projectId);
    await this.deps.projects.removeMember(projectId, userId);
  }

  async listMembers(projectId: string): Promise<ProjectMember[]> {
    await this.getById(projectId);
    return this.deps.projects.listMembers(projectId);
  }
}
