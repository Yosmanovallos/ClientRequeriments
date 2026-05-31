import type { FastifyInstance } from 'fastify';
import type { Container }       from '../../Platform/AdapterRegistration.js';
import type { IRequestsRepository, ListRequestsFilters } from './RequestsRepository.js';
import { RequestsService }      from './RequestsService.js';
import { CreateRequestSchema, ListRequestsSchema } from './RequestsValidators.js';
import { requirePermission, requireProjectAccess } from '../IAM/PermissionGuard.js';
import { Errors } from '../../Shared/errors.js';

/**
 * Register all /requests routes.
 *
 * Access rules enforced here (source of truth is Role.ts + PermissionGuard.ts):
 *   POST  /requests     — CLIENT and above; project access checked if projectId supplied
 *   GET   /requests     — CLIENT and above; results scoped by role:
 *                         CLIENT     → own requests in active project only (createdBy filter)
 *                         AGENT      → all requests in active project ONLY (strict: no cross-project)
 *                         ADMIN      → all requests in their tenant (optionally filtered by project)
 *                         SUPER_ADMIN→ all requests (optionally filtered by project)
 *   GET   /requests/:id — CLIENT and above; AGENT/CLIENT validated against project membership
 */
export function registerRequestsEndpoints(
  app: FastifyInstance,
  container: Container,
  repo: IRequestsRepository,
): void {
  const svc = new RequestsService({
    repo,
    tickets:  container.tickets,
    notifier: container.notifier,
    clock:    container.clock,
  });

  // POST /requests — create a new request
  app.post('/requests', async (req, reply) => {
    requirePermission(req.user, 'requests.create');

    const parsed = CreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        type:   'https://clientrequirements.provana.com/errors/bad_request',
        title:  'BAD_REQUEST',
        status: 400,
        detail: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }

    const input = parsed.data;

    if (input.projectId) {
      requireProjectAccess(req.user, input.projectId);
    }

    const result = await svc.create({
      clientId:       req.user.clientId,
      projectId:      input.projectId ?? null,
      requestType:    input.requestType,
      title:          input.title,
      priority:       input.priority,
      dueDate:        input.dueDate ? new Date(input.dueDate) : null,
      payload:        input.payload,
      idempotencyKey: input.idempotencyKey ?? null,
      createdBy:      req.user.email,
    });

    return reply.status(201).send(result);
  });

  // GET /requests — list requests scoped by role
  app.get('/requests', async (req, reply) => {
    requirePermission(req.user, 'requests.list');

    const parsed = ListRequestsSchema.safeParse(req.query);
    const query  = parsed.success ? parsed.data : {};
    const role   = req.user.role;
    const filters: ListRequestsFilters = {};

    if (query.status) filters.status = query.status;

    if (role === 'SUPER_ADMIN') {
      // Global scope — optional project filter
      if (query.projectId) filters.projectId = query.projectId;

    } else if (role === 'ADMIN') {
      // Tenant scope — clientId filter applied at repo level; optional project filter
      if (query.projectId) {
        requireProjectAccess(req.user, query.projectId);
        filters.projectId = query.projectId;
      }

    } else if (role === 'AGENT') {
      // STRICT project scope — AGENT cannot see cross-project data under any circumstance
      if (query.projectId) {
        requireProjectAccess(req.user, query.projectId);
        filters.projectId = query.projectId;
      } else {
        // No active project selected: restrict to ALL their assigned projects
        filters.projectIds = req.user.projectIds ?? [];
      }

    } else {
      // CLIENT — own requests only, within their assigned projects
      if (query.projectId) {
        requireProjectAccess(req.user, query.projectId);
        filters.projectId = query.projectId;
      } else {
        filters.projectIds = req.user.projectIds ?? [];
      }
      filters.createdBy = req.user.email;
    }

    const rows = await svc.list(req.user.clientId, filters);
    return reply.send({ data: rows, count: rows.length });
  });

  // GET /requests/:id — get a single request with history
  app.get<{ Params: { id: string } }>('/requests/:id', async (req, reply) => {
    requirePermission(req.user, 'requests.read');

    const detail  = await svc.getDetail(req.params.id, req.user.clientId);
    const history = await svc.getHistory(req.params.id, req.user.clientId);

    // AGENT: must be an explicit member of the request's project
    if (req.user.role === 'AGENT' && detail.projectId) {
      if (!req.user.projectIds?.includes(detail.projectId)) {
        throw Errors.forbidden('No access to this project');
      }
    }

    // CLIENT: must be the original submitter and in the request's project
    if (req.user.role === 'CLIENT') {
      if (detail.createdBy && detail.createdBy !== req.user.email) {
        throw Errors.forbidden('No access to this request');
      }
      if (detail.projectId && !req.user.projectIds?.includes(detail.projectId)) {
        throw Errors.forbidden('No access to this project');
      }
    }

    return reply.send({ ...detail, history });
  });
}
