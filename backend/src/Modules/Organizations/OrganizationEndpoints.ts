import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OrganizationService } from './OrganizationService.js';
import type { IOrganizationRepository } from './OrganizationRepository.js';
import type { IUserRepository } from '../IAM/UserRepository.js';
import type { IProjectRepository } from '../IAM/ProjectRepository.js';
import { requirePermission, requireProjectAccess, requireOrganizationAccess } from '../IAM/PermissionGuard.js';
import type { Role } from '../IAM/Role.js';

const CreateOrgSchema = z.object({
  name:        z.string().min(1).max(128),
  description: z.string().max(2000).nullable().optional(),
});

const UpdateOrgSchema = z.object({
  name:        z.string().min(1).max(128).optional(),
  description: z.string().max(2000).nullable().optional(),
  isActive:    z.boolean().optional(),
});

const AddMemberSchema = z.object({
  userId: z.string().uuid(),
});

export function registerOrganizationEndpoints(
  app: FastifyInstance,
  orgRepo: IOrganizationRepository,
  userRepo: IUserRepository,
  projectRepo: IProjectRepository,
): void {
  const svc = new OrganizationService({ orgs: orgRepo, users: userRepo });

  // ── Organizations under a project ─────────────────────────────────────────

  // POST /projects/:projectId/organizations — create org (Admin+)
  app.post<{ Params: { projectId: string } }>('/projects/:projectId/organizations', async (req, reply) => {
    requirePermission(req.user, 'organizations.create');
    const project = await projectRepo.findById(req.params.projectId);
    if (!project) return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Project not found' });
    requireProjectAccess(req.user, project.id, project.clientId);

    const parsed = CreateOrgSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ title: 'BAD_REQUEST', status: 400, detail: parsed.error.message });
    }

    const clientId = (req.user.role as Role) === 'SUPER_ADMIN' ? project.clientId : req.user.clientId;
    const org = await svc.create({
      clientId,
      projectId:   project.id,
      name:        parsed.data.name,
      description: parsed.data.description ?? null,
    });
    return reply.status(201).send(org);
  });

  // GET /projects/:projectId/organizations — list orgs (Client+, filtered by membership for Client/Agent)
  app.get<{ Params: { projectId: string } }>('/projects/:projectId/organizations', async (req, reply) => {
    requirePermission(req.user, 'organizations.list');
    const project = await projectRepo.findById(req.params.projectId);
    if (!project) return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Project not found' });
    requireProjectAccess(req.user, project.id, project.clientId);

    const role = req.user.role as Role;
    let orgs = await svc.listByProject(project.id);

    // AGENT and CLIENT see only orgs they belong to
    if (role === 'AGENT' || role === 'CLIENT') {
      const userOrgIds = new Set(req.user.organizationIds ?? []);
      orgs = orgs.filter(o => userOrgIds.has(o.id));
    }

    return reply.send({ data: orgs, count: orgs.length });
  });

  // GET /projects/:projectId/organizations/:orgId — get one org
  app.get<{ Params: { projectId: string; orgId: string } }>('/projects/:projectId/organizations/:orgId', async (req, reply) => {
    requirePermission(req.user, 'organizations.read');
    const project = await projectRepo.findById(req.params.projectId);
    if (!project) return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Project not found' });
    requireProjectAccess(req.user, project.id, project.clientId);

    const org = await svc.getById(req.params.orgId);
    if (org.projectId !== project.id) {
      return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Organization not found in this project' });
    }
    requireOrganizationAccess(req.user, org);
    return reply.send(org);
  });

  // PATCH /projects/:projectId/organizations/:orgId — update (Admin+)
  app.patch<{ Params: { projectId: string; orgId: string } }>('/projects/:projectId/organizations/:orgId', async (req, reply) => {
    requirePermission(req.user, 'organizations.update');
    const project = await projectRepo.findById(req.params.projectId);
    if (!project) return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Project not found' });
    requireProjectAccess(req.user, project.id, project.clientId);

    const org = await svc.getById(req.params.orgId);
    if (org.projectId !== project.id) {
      return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Organization not found in this project' });
    }

    const parsed = UpdateOrgSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ title: 'BAD_REQUEST', status: 400, detail: parsed.error.message });
    }

    const updated = await svc.update(org.id, parsed.data);
    return reply.send(updated);
  });

  // DELETE /projects/:projectId/organizations/:orgId — delete (SuperAdmin only)
  app.delete<{ Params: { projectId: string; orgId: string } }>('/projects/:projectId/organizations/:orgId', async (req, reply) => {
    requirePermission(req.user, 'organizations.delete');
    const project = await projectRepo.findById(req.params.projectId);
    if (!project) return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Project not found' });

    const org = await svc.getById(req.params.orgId);
    if (org.projectId !== project.id) {
      return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Organization not found in this project' });
    }

    await svc.delete(org.id);
    return reply.status(204).send();
  });

  // ── Organization members ───────────────────────────────────────────────────

  // GET /projects/:projectId/organizations/:orgId/members — list members (Client+)
  app.get<{ Params: { projectId: string; orgId: string } }>('/projects/:projectId/organizations/:orgId/members', async (req, reply) => {
    requirePermission(req.user, 'organizations.members.list');
    const project = await projectRepo.findById(req.params.projectId);
    if (!project) return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Project not found' });
    requireProjectAccess(req.user, project.id, project.clientId);

    const org = await svc.getById(req.params.orgId);
    if (org.projectId !== project.id) {
      return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Organization not found in this project' });
    }
    requireOrganizationAccess(req.user, org);

    const members = await svc.listMembers(org.id);
    return reply.send({ data: members, count: members.length });
  });

  // POST /projects/:projectId/organizations/:orgId/members — add member (Admin+)
  app.post<{ Params: { projectId: string; orgId: string } }>('/projects/:projectId/organizations/:orgId/members', async (req, reply) => {
    requirePermission(req.user, 'organizations.members.add');
    const project = await projectRepo.findById(req.params.projectId);
    if (!project) return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Project not found' });
    requireProjectAccess(req.user, project.id, project.clientId);

    const org = await svc.getById(req.params.orgId);
    if (org.projectId !== project.id) {
      return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Organization not found in this project' });
    }

    const parsed = AddMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ title: 'BAD_REQUEST', status: 400, detail: parsed.error.message });
    }

    const member = await svc.addMember(org.id, parsed.data.userId);
    return reply.status(201).send(member);
  });

  // DELETE /projects/:projectId/organizations/:orgId/members/:userId — remove member (Admin+)
  app.delete<{ Params: { projectId: string; orgId: string; userId: string } }>(
    '/projects/:projectId/organizations/:orgId/members/:userId',
    async (req, reply) => {
      requirePermission(req.user, 'organizations.members.remove');
      const project = await projectRepo.findById(req.params.projectId);
      if (!project) return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Project not found' });
      requireProjectAccess(req.user, project.id, project.clientId);

      const org = await svc.getById(req.params.orgId);
      if (org.projectId !== project.id) {
        return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Organization not found in this project' });
      }

      await svc.removeMember(org.id, req.params.userId);
      return reply.status(204).send();
    },
  );
}
