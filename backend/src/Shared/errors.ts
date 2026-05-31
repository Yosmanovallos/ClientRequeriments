import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  notFound:    (msg = 'Resource not found')       => new AppError(404, 'NOT_FOUND', msg),
  unauthorized:(msg = 'Unauthorized')             => new AppError(401, 'UNAUTHORIZED', msg),
  forbidden:   (msg = 'Forbidden')               => new AppError(403, 'FORBIDDEN', msg),
  conflict:    (msg = 'Conflict')                => new AppError(409, 'CONFLICT', msg),
  badRequest:  (msg: string)                     => new AppError(400, 'BAD_REQUEST', msg),
  internal:    (msg = 'Internal server error')   => new AppError(500, 'INTERNAL', msg),
};

/** RFC 9457 Problem+JSON error handler — register as app.setErrorHandler(problemJsonHandler) */
export function problemJsonHandler(
  error: FastifyError | AppError | Error,
  _req: FastifyRequest,
  reply: FastifyReply,
): void {
  const isApp = error instanceof AppError;
  const status = isApp ? (error as AppError).status : 500;
  const code   = isApp ? (error as AppError).code   : 'INTERNAL';
  const msg    = error.message || 'An unexpected error occurred';

  if (status >= 500) {
    reply.log.error({ err: error }, 'Unhandled error');
  }

  reply.status(status).send({
    type:   `https://clientrequirements.provana.com/errors/${code.toLowerCase()}`,
    title:  code,
    status,
    detail: msg,
  });
}
