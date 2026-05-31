import type { Comment, AddCommentCmd }       from './Comment.js';
import type { ICommentsRepository }            from './CommentsRepository.js';
import type { IRequestsRepository }            from '../Requests/RequestsRepository.js';
import type { ITicketSystem }                  from '../../Platform/Ports/ITicketSystem.js';
import { Errors }                              from '../../Shared/errors.js';

interface Deps {
  comments: ICommentsRepository;
  requests: IRequestsRepository;
  tickets:  ITicketSystem;
}

export class CommentsService {
  constructor(private readonly deps: Deps) {}

  async add(cmd: AddCommentCmd): Promise<Comment> {
    // Access check — request must exist and belong to caller's client
    const req = await this.deps.requests.findById(cmd.requestId, cmd.clientId);
    if (!req) throw Errors.notFound(`Request ${cmd.requestId} not found`);

    const comment: Comment = {
      id:         crypto.randomUUID(),
      requestId:  cmd.requestId,
      body:       cmd.body,
      author:     cmd.author,
      visibility: 'public',
      source:     'PORTAL',
      createdAt:  new Date(),
    };
    const saved = await this.deps.comments.add(comment);

    // Mirror to ticket system — non-fatal
    if (req.adoWorkItemId) {
      this.deps.tickets.addComment(req.adoWorkItemId, `**${cmd.author}:** ${cmd.body}`)
        .catch(err => console.error('[CommentsService] ticket comment sync failed:', err));
    }

    return saved;
  }

  async list(requestId: string, clientId: string): Promise<Comment[]> {
    const req = await this.deps.requests.findById(requestId, clientId);
    if (!req) throw Errors.notFound(`Request ${requestId} not found`);
    return this.deps.comments.listByRequest(requestId, false);
  }

  /**
   * Append a comment sourced from an external system (e.g. GitHub issue comment webhook).
   *
   * - Looks up by externalId (no tenant check — webhooks aren't user-authenticated;
   *   HMAC verification in the Sync endpoint is the trust boundary).
   * - Does NOT mirror the comment back to the ticket system (would create an infinite loop).
   * - Returns null if no portal request matches the externalId (silently ignored upstream).
   */
  async appendExternalComment(
    externalId: string,
    body: string,
    author: string,
  ): Promise<Comment | null> {
    const req = await this.deps.requests.findByExternalRef(externalId);
    if (!req) return null;

    return this.deps.comments.add({
      id:         crypto.randomUUID(),
      requestId:  req.id,
      body,
      author,
      visibility: 'public',
      source:     'TICKET',
      createdAt:  new Date(),
    });
  }
}
