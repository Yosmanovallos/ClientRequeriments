import type { Project, ProjectMember, ProjectSummary, UpdateProjectPatch } from './ProjectEntity.js';
import type { IProjectRepository } from './ProjectRepository.js';
import type { ITicketSystem, ExternalProject } from '../../Platform/Ports/ITicketSystem.js';
import { Errors } from '../../Shared/errors.js';

interface Deps {
  projects: IProjectRepository;
  tickets:  ITicketSystem;
}

const SLUG_RX = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function autoSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'project';
}

export class ProjectService {
  constructor(private readonly deps: Deps) {}

  /**
   * Create a new project under a client.
   * When adoProjectId is provided, the project is linked to an ADO project (mapping mode).
   * When omitted, a standalone local project is created (non-ADO deployments / legacy path).
   */
  async create(input: {
    clientId:        string;
    name:            string;
    slug?:           string;
    description?:    string | null;
    iconUrl?:        string | null;
    adoProjectId?:   string | null;
    adoProjectName?: string | null;
  }): Promise<Project> {
    if (!input.name.trim()) throw Errors.badRequest('Project name is required');

    // Derive slug from name when not provided (common when creating from ADO selector)
    const slug = input.slug?.trim() || autoSlug(input.name);
    if (!SLUG_RX.test(slug)) throw Errors.badRequest('Project slug must be lowercase letters, digits, and hyphens (max 64 chars)');

    // Prevent duplicate slug within the client
    const dupSlug = await this.deps.projects.findBySlug(input.clientId, slug);
    if (dupSlug) throw Errors.conflict(`A project with slug "${slug}" already exists in this client`);

    // Prevent duplicate ADO project mapping within the client
    if (input.adoProjectId) {
      const dupAdo = await this.deps.projects.findByAdoProjectId(input.clientId, input.adoProjectId);
      if (dupAdo) throw Errors.conflict(`ADO project "${input.adoProjectId}" is already mapped to a portal project in this client`);
    }

    return this.deps.projects.create({
      clientId:       input.clientId,
      name:           input.name.trim(),
      slug,
      description:    input.description ?? null,
      iconUrl:        input.iconUrl ?? null,
      adoProjectId:   input.adoProjectId ?? null,
      adoProjectName: input.adoProjectName ?? null,
    });
  }

  /**
   * Returns ADO projects available for mapping: all external projects minus those
   * already mapped for this client.
   */
  async listAvailableAdoProjects(clientId: string): Promise<ExternalProject[]> {
    const [external, mapped] = await Promise.all([
      this.deps.tickets.listExternalProjects(),
      this.deps.projects.listMappedAdoProjectIds(clientId),
    ]);
    const mappedSet = new Set(mapped);
    return external.filter(p => !mappedSet.has(p.id));
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
