import type { Comment, AddCommentCmd } from './Comment.js';
import type { ICommentsRepository }    from './CommentsRepository.js';
import type { IRequestsRepository }    from '../Requests/RequestsRepository.js';
import type { ITicketSystem }          from '../../Platform/Ports/ITicketSystem.js';
import type { ISanitizer }             from '../../Platform/Ports/ISanitizer.js';
import type { IFileStorage }           from '../../Platform/Ports/IFileStorage.js';
import type { INotifier }              from '../../Platform/Ports/INotifier.js';
import { Errors }                      from '../../Shared/errors.js';

const PROXY_URL_RE = /src="\/api\/comment-files\/([^"]+)"/g;

interface Deps {
  comments:  ICommentsRepository;
  requests:  IRequestsRepository;
  tickets:   ITicketSystem;
  sanitizer: ISanitizer;
  storage:   IFileStorage;
  /** Wired now; used in Phase 9 to notify org members when a CLIENT posts a comment. */
  notifier:  INotifier;
}

export class CommentsService {
  constructor(private readonly deps: Deps) {}

  async add(cmd: AddCommentCmd): Promise<Comment> {
    const req = await this.deps.requests.findById(cmd.requestId, cmd.clientId);
    if (!req) throw Errors.notFound(`Request ${cmd.requestId} not found`);

    const sanitizedBody = this.deps.sanitizer.sanitize(cmd.body);
    if (sanitizedBody.length > 100_000) {
      throw Errors.badRequest('Comment body exceeds 100 000 characters after sanitization');
    }

    const comment: Comment = {
      id:           crypto.randomUUID(),
      requestId:    cmd.requestId,
      body:         sanitizedBody,
      author:       cmd.author,
      authorUserId: cmd.authorUserId,
      visibility:   'public',
      source:       'PORTAL',
      adoCommentId: null,
      createdAt:    new Date(),
    };
    const saved = await this.deps.comments.add(comment);

    // Mirror to ADO as HTML — non-fatal; save returned comment ID for dedup
    if (req.adoWorkItemId) {
      const htmlBody = this.toHtml(sanitizedBody, cmd.author);
      this.deps.tickets
        .addComment(req.adoWorkItemId, htmlBody, req.adoProjectName ?? undefined)
        .then(async (result) => {
          if (result?.id) {
            await this.deps.comments.setAdoCommentId(saved.id, result.id);
          }
        })
        .catch(err => console.error('[CommentsService] ticket comment sync failed:', err));
    }

    // Hydrate images so the POST response has signed URLs (same as list())
    return this.hydrateImages(saved, cmd.clientId);
  }

  async list(requestId: string, clientId: string): Promise<Comment[]> {
    const req = await this.deps.requests.findById(requestId, clientId);
    if (!req) throw Errors.notFound(`Request ${requestId} not found`);
    const comments = await this.deps.comments.listByRequest(requestId, false);
    // Replace stored proxy URLs with fresh signed URLs so <img> tags render without auth headers
    return Promise.all(comments.map(c => this.hydrateImages(c, clientId)));
  }

  /**
   * Append a comment sourced from an external system (e.g. ADO webhook).
   * Does NOT mirror back (would cause an infinite loop).
   * Returns null only if no matching request is found.
   * When adoCommentId is provided, deduplicates: returns the existing comment if already stored.
   */
  async appendExternalComment(
    externalId:   string,
    body:         string,
    author:       string,
    adoCommentId?: string | null,
  ): Promise<Comment | null> {
    const req = await this.deps.requests.findByExternalRef(externalId);
    if (!req) return null;

    // Dedup: if this ADO comment ID is already stored for this request, skip insert
    if (adoCommentId) {
      const existing = await this.deps.comments.findByAdoCommentId(adoCommentId, req.id);
      if (existing) return existing;
    }

    return this.deps.comments.add({
      id:           crypto.randomUUID(),
      requestId:    req.id,
      body,
      author,
      authorUserId: null,
      visibility:   'public',
      source:       'TICKET',
      adoCommentId: adoCommentId ?? null,
      createdAt:    new Date(),
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** Format a portal comment as HTML for ADO Discussion. ADO renders HTML natively. */
  private toHtml(sanitizedHtml: string, author: string): string {
    return `<div><strong>${escapeHtml(author)}</strong> <span style="color:#888">&middot; via Provana Portal</span><br/>${sanitizedHtml}</div>`;
  }

  private async hydrateImages(c: Comment, clientId: string): Promise<Comment> {
    if (!c.body.includes('/api/comment-files/')) return c;

    const keys: string[] = [];
    let match: RegExpExecArray | null;
    PROXY_URL_RE.lastIndex = 0;
    while ((match = PROXY_URL_RE.exec(c.body)) !== null) {
      keys.push(match[1]!);
    }
    if (keys.length === 0) return c;

    // Only sign keys belonging to this tenant; drop cross-tenant or missing keys
    const signedResults = await Promise.all(
      keys.map(async (k) => {
        if (!k.startsWith(`${clientId}/`)) return null;
        try {
          return await this.deps.storage.getSignedUrl(k, 3600);
        } catch {
          return null; // file missing (e.g. local dev server restart) — remove img tag
        }
      }),
    );

    let body = c.body;
    keys.forEach((k, i) => {
      const signed = signedResults[i];
      if (signed) {
        body = body.replace(`/api/comment-files/${k}`, signed);
      } else {
        body = body.replace(
          new RegExp(`<img[^>]*src="/api/comment-files/${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 'g'),
          '',
        );
      }
    });
    return { ...c, body };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
