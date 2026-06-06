import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProjectService } from './ProjectService.js';
import type { IProjectRepository } from './ProjectRepository.js';
import type { ITicketSystem } from '../../Platform/Ports/ITicketSystem.js';
import { requirePermission, requireProjectAccess } from './PermissionGuard.js';
import type { Role } from './Role.js';

const CreateProjectSchema = z.object({
  name:           z.string().min(1).max(128),
  slug:           z.string().min(1).max(64).optional(),
  description:    z.string().max(2000).nullable().optional(),
  iconUrl:        z.string().max(2_000_000).nullable().optional(),
  adoProjectId:   z.string().max(64).nullable().optional(),
  adoProjectName: z.string().max(256).nullable().optional(),
  /** SuperAdmin-only: target a specific client. Admin is forced to their own. */
  clientId:       z.string().uuid().optional(),
});

const UpdateProjectSchema = z.object({
  name:           z.string().min(1).max(128).optional(),
  description:    z.string().max(2000).nullable().optional(),
  iconUrl:        z.string().max(2_000_000).nullable().optional(),
  isActive:       z.boolean().optional(),
  prefix:         z.string().max(16).nullable().optional(),
  adoProjectId:   z.string().max(64).nullable().optional(),
  adoProjectName: z.string().max(256).nullable().optional(),
});

const AddMemberSchema = z.object({
  userId: z.string().uuid(),
});

export function registerProjectEndpoints(
  app: FastifyInstance,
  projectRepo: IProjectRepository,
  tickets: ITicketSystem,
): void {
  const svc = new ProjectService({ projects: projectRepo, tickets });

  // GET /projects/ado-available — list ADO projects not yet mapped in this client.
  // MUST be registered before /projects/:id so "ado-available" is not treated as an :id param.
  app.get('/projects/ado-available', async (req, reply) => {
    requirePermission(req.user, 'projects.create');
    const available = await svc.listAvailableAdoProjects(req.user.clientId);
    return reply.send({ data: available, count: available.length });
  });

  // POST /projects — create a project (Admin+ only)
  app.post('/projects', async (req, reply) => {
    requirePermission(req.user, 'projects.create');
    const parsed = CreateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ title: 'BAD_REQUEST', status: 400, detail: parsed.error.message });
    }

    const targetClientId =
      (req.user.role as Role) === 'SUPER_ADMIN' && parsed.data.clientId
        ? parsed.data.clientId
        : req.user.clientId;

    const project = await svc.create({
      clientId:       targetClientId,
      name:           parsed.data.name,
      slug:           parsed.data.slug ?? undefined,
      description:    parsed.data.description ?? null,
      iconUrl:        parsed.data.iconUrl ?? null,
      adoProjectId:   parsed.data.adoProjectId ?? null,
      adoProjectName: parsed.data.adoProjectName ?? null,
    });
    return reply.status(201).send(project);
  });

  // GET /projects — list visible projects
  app.get('/projects', async (req, reply) => {
    requirePermission(req.user, 'projects.list');
    const role = req.user.role as Role;
    if (role === 'SUPER_ADMIN') {
      const all = await svc.listWithSummary();
      return reply.send({ data: all, count: all.length });
    }
    const ids = req.user.projectIds ?? [];
    const mine = await svc.listByIds(ids);
    return reply.send({ data: mine, count: mine.length });
  });

  // GET /projects/:id — project details
  app.get<{ Params: { id: string } }>('/projects/:id', async (req, reply) => {
    requirePermission(req.user, 'projects.read');
    const project = await svc.getById(req.params.id);
    requireProjectAccess(req.user, project.id, project.clientId);
    return reply.send(project);
  });

  // PATCH /projects/:id — update
  app.patch<{ Params: { id: string } }>('/projects/:id', async (req, reply) => {
    requirePermission(req.user, 'projects.update');
    const project = await svc.getById(req.params.id);
    requireProjectAccess(req.user, project.id, project.clientId);

    const parsed = UpdateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ title: 'BAD_REQUEST', status: 400, detail: parsed.error.message });
    }
    const updated = await svc.update(project.id, parsed.data);
    return reply.send(updated);
  });

  // DELETE /projects/:id — archive (soft delete)
  app.delete<{ Params: { id: string } }>('/projects/:id', async (req, reply) => {
    requirePermission(req.user, 'projects.archive');
    const project = await svc.getById(req.params.id);
    requireProjectAccess(req.user, project.id, project.clientId);
    await svc.archive(project.id);
    return reply.status(204).send();
  });

  // ── Members ────────────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/projects/:id/members', async (req, reply) => {
    requirePermission(req.user, 'projects.members.list');
    const project = await svc.getById(req.params.id);
    requireProjectAccess(req.user, project.id, project.clientId);
    const members = await svc.listMembers(project.id);
    return reply.send({ data: members, count: members.length });
  });

  app.post<{ Params: { id: string } }>('/projects/:id/members', async (req, reply) => {
    requirePermission(req.user, 'projects.members.add');
    const project = await svc.getById(req.params.id);
    requireProjectAccess(req.user, project.id, project.clientId);

    const parsed = AddMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ title: 'BAD_REQUEST', status: 400, detail: parsed.error.message });
    }
    const member = await svc.addMember(project.id, parsed.data.userId);
    return reply.status(201).send(member);
  });

  app.delete<{ Params: { id: string; userId: string } }>('/projects/:id/members/:userId', async (req, reply) => {
    requirePermission(req.user, 'projects.members.remove');
    const project = await svc.getById(req.params.id);
    requireProjectAccess(req.user, project.id, project.clientId);
    await svc.removeMember(project.id, req.params.userId);
    return reply.status(204).send();
  });
}
