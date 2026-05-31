import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UserService } from './UserService.js';
import type { IUserRepository } from './UserRepository.js';
import type { IProjectRepository } from './ProjectRepository.js';
import { requirePermission } from './PermissionGuard.js';
import { ROLES, type Role } from './Role.js';

const SetRoleSchema = z.object({
  role: z.enum(ROLES).nullable(),
});

const SetActiveSchema = z.object({
  isActive: z.boolean(),
});

const SetProjectsSchema = z.object({
  projectIds: z.array(z.string().uuid()),
});

const SetupSchema = z.object({
  role:       z.enum(ROLES).nullable(),
  projectIds: z.array(z.string().uuid()),
});

export function registerUserEndpoints(
  app: FastifyInstance,
  userRepo: IUserRepository,
  projectRepo: IProjectRepository,
): void {
  const svc = new UserService({ users: userRepo, projects: projectRepo });

  /**
   * GET /users/me — always allowed for authenticated users (including PENDING).
   * The frontend uses this on every page load to render avatar + role-aware UI.
   */
  app.get('/users/me', async (req, reply) => {
    // No requirePermission — even PENDING users can see their own status.
    if (!req.user) return reply.status(401).send({ title: 'UNAUTHORIZED', status: 401, detail: 'Not authenticated' });
    const me = await svc.me(req.user.userId);
    return reply.send(me);
  });

  // GET /users/pending — approval queue (Admin+ only, scoped to client)
  app.get('/users/pending', async (req, reply) => {
    requirePermission(req.user, 'users.list');
    const clientFilter = (req.user.role as Role) === 'SUPER_ADMIN' ? undefined : req.user.clientId;
    const pending = await svc.listPending(clientFilter);
    return reply.send({ data: pending, count: pending.length });
  });

  // GET /users — full list (Admin sees own client, SuperAdmin sees all)
  app.get('/users', async (req, reply) => {
    requirePermission(req.user, 'users.list');
    const clientFilter = (req.user.role as Role) === 'SUPER_ADMIN' ? undefined : req.user.clientId;
    const all = await svc.listAll(clientFilter);
    return reply.send({ data: all, count: all.length });
  });

  // PATCH /users/:id/role — assign or change a role. Enforces canAssignRole.
  app.patch<{ Params: { id: string } }>('/users/:id/role', async (req, reply) => {
    requirePermission(req.user, 'users.assign_role');
    const parsed = SetRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ title: 'BAD_REQUEST', status: 400, detail: parsed.error.message });
    }
    const updated = await svc.setRole({
      userId:       req.params.id,
      role:         parsed.data.role,
      assignerRole: (req.user.role as Role | null) ?? null,
    });
    return reply.send(updated);
  });

  // PATCH /users/:id/projects — replace project memberships
  app.patch<{ Params: { id: string } }>('/users/:id/projects', async (req, reply) => {
    requirePermission(req.user, 'users.assign_projects');
    const parsed = SetProjectsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ title: 'BAD_REQUEST', status: 400, detail: parsed.error.message });
    }
    await svc.setProjectMemberships(req.params.id, parsed.data.projectIds);
    return reply.status(204).send();
  });

  // PATCH /users/:id/active — toggle account active state
  app.patch<{ Params: { id: string } }>('/users/:id/active', async (req, reply) => {
    requirePermission(req.user, 'users.activate');
    const parsed = SetActiveSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ title: 'BAD_REQUEST', status: 400, detail: parsed.error.message });
    }
    const updated = await svc.setActive(req.params.id, parsed.data.isActive);
    return reply.send(updated);
  });

  // PATCH /users/:id — one-shot setup: assign role + project list together (used by Control Panel modal)
  app.patch<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    requirePermission(req.user, 'users.update');
    const parsed = SetupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ title: 'BAD_REQUEST', status: 400, detail: parsed.error.message });
    }
    const updated = await svc.setup({
      userId:       req.params.id,
      cmd:          parsed.data,
      assignerRole: (req.user.role as Role | null) ?? null,
    });
    return reply.send(updated);
  });
}
