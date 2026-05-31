import type { ITicketSystem, CreateTicketCmd, TicketRef } from '../../Ports/ITicketSystem';

interface LocalIssue {
  id: string;
  title: string;
  body: string;
  status: string;
  comments: string[];
}

let counter = 0;

/**
 * LocalTicketSystem — stores issues in memory and logs actions to console.
 * Structurally identical to GitHubIssuesTicketSystem / AzureDevOpsTicketSystem —
 * migration is just swapping the class, not the callers.
 */
export class LocalTicketSystem implements ITicketSystem {
  private readonly issues = new Map<string, LocalIssue>();

  async create(cmd: CreateTicketCmd): Promise<TicketRef> {
    const id = `LOCAL-${(++counter).toString().padStart(4, '0')}`;
    this.issues.set(id, { id, title: cmd.title, body: cmd.body, status: 'open', comments: [] });
    console.log(`[LocalTicketSystem] Created issue ${id}: ${cmd.title}`);
    return { externalId: id, externalUrl: `http://localhost:4000/local-issues/${id}` };
  }

  async updateStatus(externalId: string, status: string): Promise<void> {
    const issue = this.issues.get(externalId);
    if (issue) issue.status = status;
    console.log(`[LocalTicketSystem] ${externalId} → ${status}`);
  }

  async addComment(externalId: string, body: string): Promise<void> {
    const issue = this.issues.get(externalId);
    if (issue) issue.comments.push(body);
    console.log(`[LocalTicketSystem] Comment on ${externalId}: ${body.slice(0, 60)}`);
  }
}
