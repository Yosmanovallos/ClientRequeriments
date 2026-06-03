import type { FastifyInstance } from 'fastify';
import type { Container }       from '../../Platform/AdapterRegistration.js';
import type { IAttachmentsRepository } from './AttachmentsRepository.js';
import type { IRequestsRepository }    from '../Requests/RequestsRepository.js';
import { AttachmentsService }   from './AttachmentsService.js';
import { MAX_UPLOAD_BYTES }     from './Attachment.js';
import { validateUpload }       from './validateMime.js';
import { Errors }               from '../../Shared/errors.js';

export function registerAttachmentsEndpoints(
  app: FastifyInstance,
  container: Container,
  attachmentsRepo: IAttachmentsRepository,
  requestsRepo: IRequestsRepository,
): void {
  const svc = new AttachmentsService({
    attachments: attachmentsRepo,
    requests:    requestsRepo,
    storage:     container.storage,
    tickets:     container.tickets,
  });

  // POST /requests/:id/attachments  — multipart/form-data with field "file"
  app.post<{ Params: { id: string } }>('/requests/:id/attachments', async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_UPLOAD_BYTES } }).catch((err: Error) => {
      // Fastify throws a specific code when the file exceeds limits — translate cleanly
      if ((err as Error & { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        throw Errors.badRequest(`File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB limit`);
      }
      throw err;
    });

    if (!file) throw Errors.badRequest('No file uploaded (use multipart/form-data with field "file")');

    const data = await file.toBuffer();

    const mimeErr = await validateUpload(file.filename, data);
    if (mimeErr) throw Errors.badRequest(mimeErr);

    const view = await svc.upload({
      requestId:   req.params.id,
      clientId:    req.user.clientId,
      fileName:    file.filename,
      contentType: file.mimetype,
      data,
      uploadedBy:  req.user.email,
    });
    return reply.status(201).send(view);
  });

  // GET /requests/:id/attachments
  app.get<{ Params: { id: string } }>('/requests/:id/attachments', async (req, reply) => {
    const rows = await svc.list(req.params.id, req.user.clientId);
    return reply.send({ data: rows, count: rows.length });
  });

  // DELETE /requests/:id/attachments/:attId
  app.delete<{ Params: { id: string; attId: string } }>('/requests/:id/attachments/:attId', async (req, reply) => {
    await svc.remove(req.params.attId, req.user.clientId);
    return reply.status(204).send();
  });
}
