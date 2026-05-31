import type { FastifyInstance } from 'fastify';
import { FormTemplateService } from './FormTemplateService.js';
import type { IFormTemplateRepository } from './FormTemplateRepository.js';
import { CreateTemplateSchema, UpdateTemplateSchema, ConfigureProjectFormsSchema } from './FormTemplateValidators.js';
import { requirePermission, requireProjectAccess } from '../IAM/PermissionGuard.js';
import type { Role } from '../IAM/Role.js';
import type { IProjectRepository } from '../IAM/ProjectRepository.js';

export function registerFormTemplateEndpoints(
  app: FastifyInstance,
  templateRepo: IFormTemplateRepository,
  projectRepo: IProjectRepository,
): void {
  const svc = new FormTemplateService({ templates: templateRepo });

  // GET /form-templates — list all templates (Admin+ within tenant; SuperAdmin sees all clients)
  app.get('/form-templates', async (req, reply) => {
    requirePermission(req.user, 'formtemplates.list');
    const clientFilter = (req.user.role as Role) === 'SUPER_ADMIN' ? undefined : req.user.clientId;
    const all = await svc.list(clientFilter);
    return reply.send({ data: all, count: all.length });
  });

  // POST /form-templates — create custom template
  app.post('/form-templates', async (req, reply) => {
    requirePermission(req.user, 'formtemplates.create');
    const parsed = CreateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ title: 'BAD_REQUEST', status: 400, detail: parsed.error.message });
    }
    const targetClientId =
      (req.user.role as Role) === 'SUPER_ADMIN' && parsed.data.clientId
        ? parsed.data.clientId
        : req.user.clientId;

    const tpl = await svc.create({
      clientId:    targetClientId,
      name:        parsed.data.name,
      slug:        parsed.data.slug,
      description: parsed.data.description ?? null,
      fieldSchema: parsed.data.fieldSchema,
    });
    return reply.status(201).send(tpl);
  });

  // GET /form-templates/:id — anyone with project access can read templates they have available
  app.get<{ Params: { id: string } }>('/form-templates/:id', async (req, reply) => {
    requirePermission(req.user, 'formtemplates.read');
    const tpl = await svc.getById(req.params.id);
    return reply.send(tpl);
  });

  // PATCH /form-templates/:id
  app.patch<{ Params: { id: string } }>('/form-templates/:id', async (req, reply) => {
    requirePermission(req.user, 'formtemplates.update');
    const parsed = UpdateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ title: 'BAD_REQUEST', status: 400, detail: parsed.error.message });
    }
    const updated = await svc.update(req.params.id, parsed.data);
    return reply.send(updated);
  });

  // DELETE /form-templates/:id
  app.delete<{ Params: { id: string } }>('/form-templates/:id', async (req, reply) => {
    requirePermission(req.user, 'formtemplates.delete');
    await svc.delete(req.params.id);
    return reply.status(204).send();
  });

  // ── Per-project enabling ───────────────────────────────────────────────

  // GET /projects/:id/forms/configs — all configs with embedded template (Admin use; shows enabled + disabled)
  app.get<{ Params: { id: string } }>('/projects/:id/forms/configs', async (req, reply) => {
    requirePermission(req.user, 'formtemplates.configure');
    const project = await projectRepo.findById(req.params.id);
    if (!project) return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Project not found' });
    requireProjectAccess(req.user, project.id, project.clientId);
    if ((req.user.role as Role) === 'ADMIN' && !req.user.projectIds?.includes(project.id)) {
      return reply.status(403).send({ title: 'FORBIDDEN', status: 403, detail: 'No access to this project' });
    }
    const configs = await svc.listProjectConfigs(project.id);
    const enriched = (await Promise.all(
      configs.map(async c => {
        try {
          const template = await svc.getById(c.templateId);
          return { ...c, template };
        } catch {
          return null; // orphan config — template deleted
        }
      }),
    )).filter(Boolean);
    return reply.send({ data: enriched, count: enriched.length });
  });

  // GET /projects/:id/forms — list enabled (visible to anyone with project access)
  app.get<{ Params: { id: string } }>('/projects/:id/forms', async (req, reply) => {
    requirePermission(req.user, 'formtemplates.read');
    const project = await projectRepo.findById(req.params.id);
    if (!project) return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Project not found' });
    requireProjectAccess(req.user, project.id, project.clientId);
    // ADMIN is scoped to their assigned projects only (not all projects in the tenant)
    if ((req.user.role as Role) === 'ADMIN' && !req.user.projectIds?.includes(project.id)) {
      return reply.status(403).send({ title: 'FORBIDDEN', status: 403, detail: 'No access to this project' });
    }

    const enabled = await svc.listEnabledForProject(project.id);
    return reply.send({ data: enabled, count: enabled.length });
  });

  // PUT /projects/:id/forms — replace the project's enabled-template config (Admin+)
  app.put<{ Params: { id: string } }>('/projects/:id/forms', async (req, reply) => {
    requirePermission(req.user, 'formtemplates.configure');
    const project = await projectRepo.findById(req.params.id);
    if (!project) return reply.status(404).send({ title: 'NOT_FOUND', status: 404, detail: 'Project not found' });
    requireProjectAccess(req.user, project.id, project.clientId);
    // ADMIN is scoped to their assigned projects only (not all projects in the tenant)
    if ((req.user.role as Role) === 'ADMIN' && !req.user.projectIds?.includes(project.id)) {
      return reply.status(403).send({ title: 'FORBIDDEN', status: 403, detail: 'No access to this project' });
    }

    const parsed = ConfigureProjectFormsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ title: 'BAD_REQUEST', status: 400, detail: parsed.error.message });
    }
    await svc.setProjectConfigs(project.id, parsed.data.configs);
    const enabled = await svc.listEnabledForProject(project.id);
    return reply.send({ data: enabled, count: enabled.length });
  });
}
