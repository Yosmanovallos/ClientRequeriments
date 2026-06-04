import type { Attachment, AttachmentView, UploadAttachmentCmd } from './Attachment.js';
import type { IAttachmentsRepository } from './AttachmentsRepository.js';
import type { IRequestsRepository }    from '../Requests/RequestsRepository.js';
import type { IFileStorage }           from '../../Platform/Ports/IFileStorage.js';
import type { ITicketSystem }          from '../../Platform/Ports/ITicketSystem.js';
import type { Request }                from '../Requests/Request.js';
import { Errors }                      from '../../Shared/errors.js';

interface Deps {
  attachments: IAttachmentsRepository;
  requests:    IRequestsRepository;
  storage:     IFileStorage;
  /** When provided, newly uploaded attachments are synced to ADO work items. */
  tickets?:    ITicketSystem;
  /** Default signed-URL lifetime in seconds. 1 hour is a reasonable safety net. */
  signedUrlSeconds?: number;
}

export class AttachmentsService {
  private readonly signedUrlSeconds: number;

  constructor(private readonly deps: Deps) {
    this.signedUrlSeconds = deps.signedUrlSeconds ?? 3600;
  }

  async upload(cmd: UploadAttachmentCmd): Promise<AttachmentView> {
    // Access check — request must exist + belong to caller's client
    const req = await this.deps.requests.findById(cmd.requestId, cmd.clientId);
    if (!req) throw Errors.notFound(`Request ${cmd.requestId} not found`);

    const id  = crypto.randomUUID();
    // Key shape: <clientId>/<requestId>/<attachmentId>/<original-filename>
    // Including clientId at the top lets you scope IAM/RLS policies on storage by prefix.
    const safeName = cmd.fileName.replace(/[^\w.\-]/g, '_');
    const key = `${cmd.clientId}/${cmd.requestId}/${id}/${safeName}`;

    await this.deps.storage.upload(key, cmd.data, cmd.contentType);

    const att: Attachment = {
      id,
      requestId:        cmd.requestId,
      clientId:         cmd.clientId,
      commentId:        cmd.commentId ?? null,
      fileName:         cmd.fileName,
      contentType:      cmd.contentType,
      size:             cmd.data.length,
      storageKey:       key,
      uploadedBy:       cmd.uploadedBy,
      adoAttachmentId:  null,
      adoAttachmentUrl: null,
      uploadedAt:       new Date(),
    };
    const saved = await this.deps.attachments.add(att);

    // Non-blocking ADO attachment sync
    if (this.deps.tickets) {
      if (req.adoWorkItemId) {
        // Work item already exists — sync immediately
        this.syncAttachmentToAdo(saved, cmd.data, req).catch(err =>
          console.error(
            `[AttachmentsService] ADO sync failed for "${saved.fileName}" → workItem ${req.adoWorkItemId}:`,
            (err as Error).message ?? err,
          ),
        );
      } else {
        // ADO work item not yet created (fire-and-forget race) — poll until it appears
        this.retrySyncAttachmentToAdo(saved, cmd.data, cmd.requestId, cmd.clientId).catch(err =>
          console.error(
            `[AttachmentsService] ADO retry sync failed for "${saved.fileName}":`,
            (err as Error).message ?? err,
          ),
        );
      }
    }

    const signedUrl = await this.deps.storage.getSignedUrl(saved.storageKey, this.signedUrlSeconds);
    return { ...saved, signedUrl };
  }

  async list(requestId: string, clientId: string): Promise<AttachmentView[]> {
    // Access check
    const req = await this.deps.requests.findById(requestId, clientId);
    if (!req) throw Errors.notFound(`Request ${requestId} not found`);

    const rows = await this.deps.attachments.listByRequest(requestId, clientId);
    // Sign each URL — done in parallel so big lists don't block sequentially
    return Promise.all(rows.map(async (a) => ({
      ...a,
      signedUrl: await this.deps.storage.getSignedUrl(a.storageKey, this.signedUrlSeconds),
    })));
  }

  async remove(id: string, clientId: string): Promise<void> {
    const att = await this.deps.attachments.findById(id, clientId);
    if (!att) throw Errors.notFound(`Attachment ${id} not found`);

    // Delete storage first — if storage delete throws, DB row stays (orphan in DB, not in storage)
    // We accept this trade-off: orphans in DB are cheap and reconcilable; orphans in storage cost money.
    await this.deps.storage.delete(att.storageKey);
    await this.deps.attachments.remove(id, clientId);
  }

  // ── private helpers ───────────────────────────────────────────────────────

  private async retrySyncAttachmentToAdo(
    att:       Attachment,
    data:      Buffer,
    requestId: string,
    clientId:  string,
  ): Promise<void> {
    const DELAYS_MS = [5_000, 15_000, 30_000, 60_000];
    for (const delay of DELAYS_MS) {
      await new Promise<void>(resolve => setTimeout(resolve, delay));
      const req = await this.deps.requests.findById(requestId, clientId);
      if (!req) return; // request was deleted
      if (req.adoWorkItemId) {
        await this.syncAttachmentToAdo(att, data, req);
        return;
      }
    }
    console.warn(
      `[AttachmentsService] ADO work item not available after retries — attachment "${att.fileName}" (request ${requestId}) not synced`,
    );
  }

  private async syncAttachmentToAdo(att: Attachment, data: Buffer, req: Request): Promise<void> {
    const tickets = this.deps.tickets!;
    const result = await tickets.uploadAttachment(
      att.fileName,
      data,
      att.contentType,
      req.adoProjectName ?? undefined,
    );
    if (!result) return; // non-ADO adapter

    await tickets.linkAttachmentToWorkItem(
      req.adoWorkItemId!,
      result.adoUrl,
      att.fileName,
      req.adoProjectName ?? undefined,
    );

    await this.deps.attachments.setAdoRef(att.id, result.adoId, result.adoUrl);
  }
}
