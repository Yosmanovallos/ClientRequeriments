import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncService } from './SyncService.js';
import { RequestsService } from '../Requests/RequestsService.js';
import { CommentsService } from '../Comments/CommentsService.js';
import { InMemoryRequestsRepository } from '../Requests/RequestsRepository.js';
import { InMemoryCommentsRepository } from '../Comments/CommentsRepository.js';
import type { ITicketSystem } from '../../Platform/Ports/ITicketSystem.js';
import type { INotifier }     from '../../Platform/Ports/INotifier.js';
import type { IClock }        from '../../Platform/Ports/IClock.js';
import type { GitHubIssuesPayload, GitHubIssueCommentPayload } from './GitHubWebhookTypes.js';
import type {
  AzureDevOpsWorkItemUpdatedPayload,
  AzureDevOpsWorkItemCommentedPayload,
} from './AzureDevOpsWebhookTypes.js';

const CLIENT = '00000000-0000-0000-0000-000000000001';

/** Build a full stack — real services + InMemory repos + mock external ports — and seed one request. */
async function buildStackWithSeededRequest() {
  const repo     = new InMemoryRequestsRepository();
  const cRepo    = new InMemoryCommentsRepository();
  const tickets: ITicketSystem = {
    create:       vi.fn(async () => ({ externalId: '42', externalUrl: 'http://gh/42' })),
    updateStatus: vi.fn(async () => undefined),
    addComment:   vi.fn(async () => undefined),
  };
  const notifier: INotifier = { sendEmail: vi.fn(), sendChannelMessage: vi.fn() } as never;
  const clock: IClock = { now: () => new Date('2026-05-29T12:00:00Z') };

  const reqSvc = new RequestsService({ repo, tickets, notifier, clock });
  const cmtSvc = new CommentsService({ comments: cRepo, requests: repo, tickets });
  const sync   = new SyncService({ requests: reqSvc, comments: cmtSvc });

  // Create a request (issues an async ticket call we let resolve)
  const req = await reqSvc.create({
    clientId: CLIENT, requestType: 'new_report', title: 'Seeded',
    priority: 'Medium', dueDate: null, payload: {}, idempotencyKey: null,
    createdBy: 'tester@example.com',
  });

  // Simulate that the ticket adapter wrote back externalId = '42'
  await repo.saveExternalRef(req.id, '42', 'http://gh/42');

  return { sync, repo, cRepo, reqSvc, cmtSvc, requestId: req.id };
}

function issuesPayload(action: string, state: 'open' | 'closed', reason: string | null, number = 42): GitHubIssuesPayload {
  return {
    action,
    issue:  { number, state, state_reason: reason as never, title: 't', html_url: 'http://gh/42', user: { login: 'opener' } },
    sender: { login: 'bi-team' },
  };
}

function commentPayload(action: string, body: string, login = 'bi-team', number = 42): GitHubIssueCommentPayload {
  return {
    action,
    issue:   { number },
    comment: { id: 1, body, user: { login }, html_url: 'http://gh/c/1' },
    sender:  { login },
  };
}

describe('SyncService.handleIssueEvent', () => {
  it('maps closed+completed → DONE', async () => {
    const { sync, repo, requestId } = await buildStackWithSeededRequest();

    const result = await sync.handleIssueEvent(issuesPayload('closed', 'closed', 'completed'));

    expect(result).toEqual({ status: 'applied', mappedTo: 'DONE' });
    const req = await repo.findById(requestId, CLIENT);
    expect(req?.status).toBe('DONE');
  });

  it('maps closed+not_planned → CANCELLED', async () => {
    const { sync, repo, requestId } = await buildStackWithSeededRequest();

    const result = await sync.handleIssueEvent(issuesPayload('closed', 'closed', 'not_planned'));

    expect(result.status).toBe('applied');
    expect(result.mappedTo).toBe('CANCELLED');
    expect((await repo.findById(requestId, CLIENT))?.status).toBe('CANCELLED');
  });

  it('maps reopened → IN REVIEW (default re-triage state)', async () => {
    const { sync, repo, requestId } = await buildStackWithSeededRequest();
    // First close it
    await sync.handleIssueEvent(issuesPayload('closed', 'closed', 'completed'));
    expect((await repo.findById(requestId, CLIENT))?.status).toBe('DONE');

    // Then reopen
    const result = await sync.handleIssueEvent(issuesPayload('reopened', 'open', null));
    expect(result.status).toBe('applied');
    expect(result.mappedTo).toBe('IN REVIEW');
    expect((await repo.findById(requestId, CLIENT))?.status).toBe('IN REVIEW');
  });

  it('ignores non-state-changing actions (labeled, assigned, edited)', async () => {
    const { sync } = await buildStackWithSeededRequest();
    for (const action of ['labeled', 'assigned', 'edited', 'opened']) {
      const r = await sync.handleIssueEvent(issuesPayload(action, 'open', null));
      expect(r.status).toBe('ignored:action');
    }
  });

  it('returns ignored:unknown-issue when the GitHub issue number matches no portal request', async () => {
    const { sync } = await buildStackWithSeededRequest();
    const result = await sync.handleIssueEvent(issuesPayload('closed', 'closed', 'completed', 999));
    expect(result.status).toBe('ignored:unknown-issue');
  });

  it('is idempotent — replayed closed event does not write a duplicate history row', async () => {
    const { sync, requestId, repo } = await buildStackWithSeededRequest();

    await sync.handleIssueEvent(issuesPayload('closed', 'closed', 'completed'));
    await sync.handleIssueEvent(issuesPayload('closed', 'closed', 'completed'));   // replay
    await sync.handleIssueEvent(issuesPayload('closed', 'closed', 'completed'));   // again

    const history = await repo.getHistory(requestId);
    // Exactly one NEW + one DONE — no duplicate DONE entries from replay
    expect(history.filter(h => h.toStatus === 'DONE')).toHaveLength(1);
  });

  it('writes history with source="github" and the sender login as actor', async () => {
    const { sync, requestId, repo } = await buildStackWithSeededRequest();

    await sync.handleIssueEvent({
      ...issuesPayload('closed', 'closed', 'completed'),
      sender: { login: 'octocat' },
    });

    const history = await repo.getHistory(requestId);
    const closeEntry = history.find(h => h.toStatus === 'DONE');
    expect(closeEntry?.source).toBe('github');
    expect(closeEntry?.actor).toBe('octocat');
  });
});

describe('SyncService.handleCommentEvent', () => {
  it('appends a comment on issue_comment.created', async () => {
    const { sync, cmtSvc, requestId } = await buildStackWithSeededRequest();

    const result = await sync.handleCommentEvent(commentPayload('created', 'Looks good!', 'octocat'));

    expect(result.status).toBe('applied');
    const comments = await cmtSvc.list(requestId, CLIENT);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.body).toBe('Looks good!');
    expect(comments[0]!.author).toBe('octocat');
    expect(comments[0]!.source).toBe('TICKET');
  });

  it('ignores edited and deleted comment actions', async () => {
    const { sync } = await buildStackWithSeededRequest();
    expect((await sync.handleCommentEvent(commentPayload('edited',  'x'))).status).toBe('ignored:action');
    expect((await sync.handleCommentEvent(commentPayload('deleted', 'x'))).status).toBe('ignored:action');
  });

  it('returns ignored:unknown-issue when the issue number maps to no request', async () => {
    const { sync } = await buildStackWithSeededRequest();
    const result = await sync.handleCommentEvent(commentPayload('created', 'hi', 'octocat', 9999));
    expect(result.status).toBe('ignored:unknown-issue');
  });

  it('does NOT mirror the comment back to the ticket system (would loop)', async () => {
    const { sync, requestId, cmtSvc } = await buildStackWithSeededRequest();
    // The mock tickets.addComment was set up in buildStackWithSeededRequest; check it's never called
    const mockTickets = (cmtSvc as never as { deps: { tickets: { addComment: ReturnType<typeof vi.fn> } } }).deps.tickets;

    await sync.handleCommentEvent(commentPayload('created', 'from github', 'octocat'));

    expect(mockTickets.addComment).not.toHaveBeenCalled();
    expect((await cmtSvc.list(requestId, CLIENT))).toHaveLength(1);
  });
});

// ─── Azure DevOps event handlers ──────────────────────────────────────────────

function adoUpdatedPayload(opts: {
  workItemId?: number;
  oldState?: string;
  newState?: string;
  revisedBy?: { displayName?: string; uniqueName?: string };
} = {}): AzureDevOpsWorkItemUpdatedPayload {
  return {
    id:        'delivery-uuid-' + Math.random().toString(16).slice(2),
    eventType: 'workitem.updated',
    resource: {
      workItemId: opts.workItemId ?? 42,
      rev:        2,
      revisedBy:  opts.revisedBy ?? { displayName: 'BI Team', uniqueName: 'biteam@acme.com' },
      fields: {
        'System.State': opts.newState ? { oldValue: opts.oldState ?? 'New', newValue: opts.newState } : undefined,
      },
    },
  };
}

function adoCommentedPayload(opts: {
  workItemId?: number;
  history?: string | { newValue?: string };
  revisedBy?: { displayName?: string; uniqueName?: string };
} = {}): AzureDevOpsWorkItemCommentedPayload {
  return {
    id:        'delivery-uuid-' + Math.random().toString(16).slice(2),
    eventType: 'workitem.commented',
    resource: {
      workItemId: opts.workItemId ?? 42,
      revisedBy:  opts.revisedBy ?? { displayName: 'John Doe', uniqueName: 'john@acme.com' },
      fields: { 'System.History': opts.history ?? 'A comment from ADO' },
    },
  };
}

describe('SyncService.handleAdoWorkItemUpdated', () => {
  it('maps Active → IN DEVELOPMENT (Agile process)', async () => {
    const { sync, repo, requestId } = await buildStackWithSeededRequest();

    const result = await sync.handleAdoWorkItemUpdated(adoUpdatedPayload({ newState: 'Active' }));

    expect(result.status).toBe('applied');
    expect(result.mappedTo).toBe('IN DEVELOPMENT');
    expect((await repo.findById(requestId, CLIENT))?.status).toBe('IN DEVELOPMENT');
  });

  it('maps Closed → DONE', async () => {
    const { sync, repo, requestId } = await buildStackWithSeededRequest();
    const result = await sync.handleAdoWorkItemUpdated(adoUpdatedPayload({ newState: 'Closed' }));
    expect(result).toEqual({ status: 'applied', mappedTo: 'DONE' });
    expect((await repo.findById(requestId, CLIENT))?.status).toBe('DONE');
  });

  it('maps Removed → CANCELLED', async () => {
    const { sync, repo, requestId } = await buildStackWithSeededRequest();
    await sync.handleAdoWorkItemUpdated(adoUpdatedPayload({ newState: 'Removed' }));
    expect((await repo.findById(requestId, CLIENT))?.status).toBe('CANCELLED');
  });

  it('handles Scrum process states (Approved, Committed, Done)', async () => {
    const { sync, repo, requestId } = await buildStackWithSeededRequest();
    await sync.handleAdoWorkItemUpdated(adoUpdatedPayload({ newState: 'Committed' }));
    expect((await repo.findById(requestId, CLIENT))?.status).toBe('IN DEVELOPMENT');
    await sync.handleAdoWorkItemUpdated(adoUpdatedPayload({ newState: 'Done' }));
    expect((await repo.findById(requestId, CLIENT))?.status).toBe('DONE');
  });

  it('handles Basic process states (To Do, Doing, Done)', async () => {
    const { sync, repo, requestId } = await buildStackWithSeededRequest();
    await sync.handleAdoWorkItemUpdated(adoUpdatedPayload({ newState: 'Doing' }));
    expect((await repo.findById(requestId, CLIENT))?.status).toBe('IN DEVELOPMENT');
  });

  it('returns ignored:no-state-change when no System.State diff present', async () => {
    const { sync } = await buildStackWithSeededRequest();
    const result = await sync.handleAdoWorkItemUpdated({
      id: 'd', eventType: 'workitem.updated',
      resource: { workItemId: 42, rev: 2, fields: { 'System.AssignedTo': { newValue: 'someone' } } },
    });
    expect(result.status).toBe('ignored:no-state-change');
  });

  it('returns ignored:unknown-state for a state we do not map', async () => {
    const { sync } = await buildStackWithSeededRequest();
    const result = await sync.handleAdoWorkItemUpdated(adoUpdatedPayload({ newState: 'CustomState_That_Doesnt_Exist' }));
    expect(result.status).toBe('ignored:unknown-state');
  });

  it('returns ignored:unknown-workitem when work item id maps to no portal request', async () => {
    const { sync } = await buildStackWithSeededRequest();
    const result = await sync.handleAdoWorkItemUpdated(adoUpdatedPayload({ workItemId: 9999, newState: 'Closed' }));
    expect(result.status).toBe('ignored:unknown-workitem');
  });

  it('returns ignored:missing-workitem-id when payload has no id', async () => {
    const { sync } = await buildStackWithSeededRequest();
    const result = await sync.handleAdoWorkItemUpdated({
      id: 'd', eventType: 'workitem.updated',
      resource: { rev: 1, fields: { 'System.State': { newValue: 'Active' } } } as never,
    });
    expect(result.status).toBe('ignored:missing-workitem-id');
  });

  it('accepts resource.id as alias for resource.workItemId', async () => {
    const { sync, repo, requestId } = await buildStackWithSeededRequest();
    const result = await sync.handleAdoWorkItemUpdated({
      id: 'd', eventType: 'workitem.updated',
      resource: { id: 42, rev: 1, fields: { 'System.State': { newValue: 'Closed' } } },
    });
    expect(result.status).toBe('applied');
    expect((await repo.findById(requestId, CLIENT))?.status).toBe('DONE');
  });

  it('writes history with source="azuredevops" and revisedBy.uniqueName as actor', async () => {
    const { sync, repo, requestId } = await buildStackWithSeededRequest();
    await sync.handleAdoWorkItemUpdated(adoUpdatedPayload({
      newState: 'Closed',
      revisedBy: { displayName: 'John Doe', uniqueName: 'john.doe@acme.com' },
    }));

    const history = await repo.getHistory(requestId);
    const closeEntry = history.find(h => h.toStatus === 'DONE');
    expect(closeEntry?.source).toBe('azuredevops');
    expect(closeEntry?.actor).toBe('john.doe@acme.com');
  });

  it('is idempotent — replayed event does not write duplicate history', async () => {
    const { sync, requestId, repo } = await buildStackWithSeededRequest();
    await sync.handleAdoWorkItemUpdated(adoUpdatedPayload({ newState: 'Closed' }));
    await sync.handleAdoWorkItemUpdated(adoUpdatedPayload({ newState: 'Closed' }));
    await sync.handleAdoWorkItemUpdated(adoUpdatedPayload({ newState: 'Closed' }));

    const history = await repo.getHistory(requestId);
    expect(history.filter(h => h.toStatus === 'DONE')).toHaveLength(1);
  });
});

describe('SyncService.handleAdoWorkItemCommented', () => {
  it('appends comment when System.History is a plain string', async () => {
    const { sync, cmtSvc, requestId } = await buildStackWithSeededRequest();
    const result = await sync.handleAdoWorkItemCommented(adoCommentedPayload({ history: 'Looks good to me' }));

    expect(result.status).toBe('applied');
    const comments = await cmtSvc.list(requestId, CLIENT);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.body).toBe('Looks good to me');
    expect(comments[0]!.author).toBe('John Doe');
    expect(comments[0]!.source).toBe('TICKET');
  });

  it('appends comment when System.History is a {newValue} diff envelope', async () => {
    const { sync, cmtSvc, requestId } = await buildStackWithSeededRequest();
    await sync.handleAdoWorkItemCommented(adoCommentedPayload({ history: { newValue: 'envelope-format comment' } }));

    const comments = await cmtSvc.list(requestId, CLIENT);
    expect(comments[0]!.body).toBe('envelope-format comment');
  });

  it('returns ignored:no-comment when System.History is missing', async () => {
    const { sync } = await buildStackWithSeededRequest();
    const result = await sync.handleAdoWorkItemCommented({
      id: 'd', eventType: 'workitem.commented',
      resource: { workItemId: 42, fields: {} },
    });
    expect(result.status).toBe('ignored:no-comment');
  });

  it('returns ignored:unknown-workitem when id maps to no portal request', async () => {
    const { sync } = await buildStackWithSeededRequest();
    const result = await sync.handleAdoWorkItemCommented(adoCommentedPayload({ workItemId: 9999, history: 'orphan' }));
    expect(result.status).toBe('ignored:unknown-workitem');
  });

  it('falls back to "Azure DevOps" as author when revisedBy is missing', async () => {
    const { sync, cmtSvc, requestId } = await buildStackWithSeededRequest();
    await sync.handleAdoWorkItemCommented({
      id: 'd', eventType: 'workitem.commented',
      resource: { workItemId: 42, fields: { 'System.History': 'anon comment' } },
    });
    const comments = await cmtSvc.list(requestId, CLIENT);
    expect(comments[0]!.author).toBe('Azure DevOps');
  });

  it('does NOT mirror the comment back to ADO (would loop)', async () => {
    const { sync, cmtSvc, requestId } = await buildStackWithSeededRequest();
    const mockTickets = (cmtSvc as never as { deps: { tickets: { addComment: ReturnType<typeof vi.fn> } } }).deps.tickets;

    await sync.handleAdoWorkItemCommented(adoCommentedPayload({ history: 'from ado' }));

    expect(mockTickets.addComment).not.toHaveBeenCalled();
    expect((await cmtSvc.list(requestId, CLIENT))).toHaveLength(1);
  });
});
