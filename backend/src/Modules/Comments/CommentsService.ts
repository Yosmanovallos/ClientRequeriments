import TurndownService              from 'turndown';
import type { Comment, AddCommentCmd } from './Comment.js';
import type { ICommentsRepository }    from './CommentsRepository.js';
import type { IRequestsRepository }    from '../Requests/RequestsRepository.js';
import type { ITicketSystem }          from '../../Platform/Ports/ITicketSystem.js';
import type { ISanitizer }             from '../../Platform/Ports/ISanitizer.js';
import type { IFileStorage }           from '../../Platform/Ports/IFileStorage.js';
import type { INotifier }              from '../../Platform/Ports/INotifier.js';
import { Errors }                      from '../../Shared/errors.js';

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });

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
      createdAt:    new Date(),
    };
    const saved = await this.deps.comments.add(comment);

    // Mirror to ticket system as Markdown — non-fatal
    if (req.adoWorkItemId) {
      const markdown = this.toMarkdown(sanitizedBody, cmd.author);
      this.deps.tickets.addComment(req.adoWorkItemId, markdown)
        .catch(err => console.error('[CommentsService] ticket comment sync failed:', err));
    }

    // Phase 9: notify org members when a CLIENT posts a comment
    // if (req.organizationId) {
    //   const emails = await getOrgMemberEmails(req.organizationId, this.deps.orgRepo, this.deps.userRepo);
    //   this.deps.notifier.sendEmail({
    //     to:       emails,
    //     subject:  `New comment on request ${req.reference}`,
    //     htmlBody: `<p><strong>${cmd.author}</strong> added a comment:</p>${sanitizedBody}`,
    //   }).catch(err => console.error('[CommentsService] org notification failed:', err));
    // }

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
   * Append a comment sourced from an external system (e.g. GitHub issue comment webhook).
   * Does NOT mirror back (would cause an infinite loop). Returns null if no request matches.
   */
  async appendExternalComment(
    externalId: string,
    body: string,
    author: string,
  ): Promise<Comment | null> {
    const req = await this.deps.requests.findByExternalRef(externalId);
    if (!req) return null;

    return this.deps.comments.add({
      id:           crypto.randomUUID(),
      requestId:    req.id,
      body,
      author,
      authorUserId: null,
      visibility:   'public',
      source:       'TICKET',
      createdAt:    new Date(),
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private toMarkdown(html: string, author: string): string {
    // Replace inline images with a placeholder before converting — GitHub Issues
    // doesn't support programmatic attachment uploads via API.
    const withoutImages = html.replace(/<img[^>]*>/gi, '[image attached in portal]');
    const md = turndown.turndown(withoutImages);
    return `**${author}:** ${md}`;
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
