import type { FastifyInstance } from 'fastify';
import type { Container }       from '../../Platform/AdapterRegistration.js';
import type { ICommentsRepository } from './CommentsRepository.js';
import type { IRequestsRepository } from '../Requests/RequestsRepository.js';
import { CommentsService }      from './CommentsService.js';
import { z }                    from 'zod';

const AddCommentSchema = z.object({
  body: z.string().min(1).max(100_000),
});

export function registerCommentsEndpoints(
  app: FastifyInstance,
  container: Container,
  commentsRepo: ICommentsRepository,
  requestsRepo: IRequestsRepository,
): void {
  const svc = new CommentsService({
    comments:  commentsRepo,
    requests:  requestsRepo,
    tickets:   container.tickets,
    sanitizer: container.sanitizer,
    storage:   container.storage,
    notifier:  container.notifier,
  });

  // GET /requests/:id/comments
  app.get<{ Params: { id: string } }>('/requests/:id/comments', async (req, reply) => {
    const comments = await svc.list(req.params.id, req.user.clientId);
    return reply.send({ data: comments });
  });

  // POST /requests/:id/comments
  app.post<{ Params: { id: string } }>('/requests/:id/comments', async (req, reply) => {
    const parsed = AddCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ title: 'BAD_REQUEST', detail: parsed.error.message, status: 400 });
    }
    const comment = await svc.add({
      requestId:    req.params.id,
      body:         parsed.data.body,
      author:       req.user.displayName,
      authorUserId: req.user.userId,
      clientId:     req.user.clientId,
    });
    return reply.status(201).send(comment);
  });
}
