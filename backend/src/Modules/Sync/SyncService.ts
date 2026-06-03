import type { GitHubIssuesPayload, GitHubIssueCommentPayload }    from './GitHubWebhookTypes.js';
import type {
  AzureDevOpsWorkItemUpdatedPayload,
  AzureDevOpsWorkItemCommentedPayload,
} from './AzureDevOpsWebhookTypes.js';
import type { RequestsService } from '../Requests/RequestsService.js';
import type { CommentsService } from '../Comments/CommentsService.js';
import type { RequestStatus }   from '../Requests/Request.js';

interface Deps {
  requests: RequestsService;
  comments: CommentsService;
}

/**
 * When GitHub reopens an issue we have no way to know what fine-grained portal status
 * to restore (we mapped many → "open" on the way out). Reset to IN REVIEW so a human
 * triages it again. Phase 8 may use status history to restore the prior state.
 */
const REOPEN_TARGET: RequestStatus = 'IN REVIEW';

/** Map (GitHub state, state_reason) → portal status. Returns null when there's no defined mapping. */
function mapGithubStateToStatus(state: string, stateReason: string | null): RequestStatus | null {
  if (state === 'closed' && stateReason === 'completed')   return 'DONE';
  if (state === 'closed' && stateReason === 'not_planned') return 'CANCELLED';
  if (state === 'closed')                                   return 'DONE';        // unknown close reason → assume completed
  if (state === 'open')                                     return REOPEN_TARGET;
  return null;
}

/**
 * Map an Azure DevOps `System.State` value → portal status.
 *
 * Covers the three standard process templates (Agile / Scrum / Basic) plus CMMI overlap.
 * Ambiguous reverse mappings (e.g. ADO `New` could correspond to portal `NEW`, `IN REVIEW`,
 * `APPROVED`, or `ON HOLD`) default to the most useful re-triage state.
 *
 * For custom processes / renamed states, users override via the inverse of `ADO_STATE_MAP_JSON`
 * (deferred to a future task — for now custom states return null and the event is silently ignored).
 */
function mapAdoStateToStatus(state: string): RequestStatus | null {
  switch (state) {
    // Agile (most common)
    case 'New':       return 'IN REVIEW';
    case 'Active':    return 'IN DEVELOPMENT';
    case 'Resolved':  return 'UAT';
    case 'Closed':    return 'DONE';
    case 'Removed':   return 'CANCELLED';
    // Scrum
    case 'Approved':  return 'APPROVED';
    case 'Committed': return 'IN DEVELOPMENT';
    case 'Done':      return 'DONE';
    // Basic
    case 'To Do':     return 'NEW';
    case 'Doing':     return 'IN DEVELOPMENT';
    // Unknown / custom — silently ignore
    default:          return null;
  }
}

export interface IssueEventResult {
  status: 'applied' | 'ignored:action' | 'ignored:state' | 'ignored:unknown-issue';
  mappedTo?: RequestStatus;
}

export interface CommentEventResult {
  status: 'applied' | 'ignored:action' | 'ignored:unknown-issue';
}

export interface AdoUpdatedEventResult {
  status: 'applied' | 'ignored:no-state-change' | 'ignored:unknown-state' | 'ignored:unknown-workitem' | 'ignored:missing-workitem-id';
  mappedTo?: RequestStatus;
}

export interface AdoCommentedEventResult {
  status: 'applied' | 'ignored:no-comment' | 'ignored:unknown-workitem' | 'ignored:missing-workitem-id';
}

/**
 * SyncService — orchestrates external-system events into portal state changes.
 *
 * Endpoints are responsible for HTTP-layer concerns (HMAC, dedup, response shape).
 * This class owns the *semantic* mapping: GitHub event → portal effect.
 */
export class SyncService {
  constructor(private readonly deps: Deps) {}

  async handleIssueEvent(payload: GitHubIssuesPayload): Promise<IssueEventResult> {
    // We only care about state transitions, not opened/labeled/assigned/etc.
    if (payload.action !== 'closed' && payload.action !== 'reopened') {
      return { status: 'ignored:action' };
    }

    const target = mapGithubStateToStatus(payload.issue.state, payload.issue.state_reason);
    if (!target) return { status: 'ignored:state' };

    const externalId = String(payload.issue.number);
    const applied = await this.deps.requests.applyExternalStatus(
      externalId, target, 'github', payload.sender.login,
    );
    if (!applied) return { status: 'ignored:unknown-issue' };
    return { status: 'applied', mappedTo: target };
  }

  async handleCommentEvent(payload: GitHubIssueCommentPayload): Promise<CommentEventResult> {
    if (payload.action !== 'created') return { status: 'ignored:action' };

    const externalId = String(payload.issue.number);
    const comment = await this.deps.comments.appendExternalComment(
      externalId, payload.comment.body, payload.comment.user.login,
    );
    return { status: comment ? 'applied' : 'ignored:unknown-issue' };
  }

  // ── Azure DevOps Service Hooks ────────────────────────────────────────────

  async handleAdoWorkItemUpdated(payload: AzureDevOpsWorkItemUpdatedPayload): Promise<AdoUpdatedEventResult> {
    const wiId = payload.resource.workItemId ?? payload.resource.id;
    if (wiId == null) return { status: 'ignored:missing-workitem-id' };

    const stateDiff = payload.resource.fields['System.State'];
    if (!stateDiff?.newValue) return { status: 'ignored:no-state-change' };

    const target = mapAdoStateToStatus(stateDiff.newValue);
    if (!target) return { status: 'ignored:unknown-state' };

    const actor = payload.resource.revisedBy?.uniqueName
      ?? payload.resource.revisedBy?.displayName
      ?? null;

    const applied = await this.deps.requests.applyExternalStatus(
      String(wiId), target, 'azuredevops', actor,
    );
    if (!applied) return { status: 'ignored:unknown-workitem' };

    // Also sync AssignedTo when it changed in this revision
    const assignedToDiff = payload.resource.fields['System.AssignedTo'];
    if (assignedToDiff?.newValue !== undefined) {
      const assignedTo = typeof assignedToDiff.newValue === 'string'
        ? assignedToDiff.newValue || null
        : (assignedToDiff.newValue as { displayName?: string } | null)?.displayName ?? null;
      await this.deps.requests.updateAdoMeta(String(wiId), { adoAssignedTo: assignedTo });
    }

    return { status: 'applied', mappedTo: target };
  }

  async handleAdoWorkItemCommented(payload: AzureDevOpsWorkItemCommentedPayload): Promise<AdoCommentedEventResult> {
    const wiId = payload.resource.workItemId ?? payload.resource.id;
    if (wiId == null) return { status: 'ignored:missing-workitem-id' };

    // ADO surfaces the comment text in System.History. Different ADO versions/connectors
    // send either a raw string or a {newValue} diff envelope — accept both shapes.
    const historyField = payload.resource.fields?.['System.History'];
    const body = typeof historyField === 'string'
      ? historyField
      : (historyField as { newValue?: string } | undefined)?.newValue;

    if (!body) return { status: 'ignored:no-comment' };

    const author = payload.resource.revisedBy?.displayName
      ?? payload.resource.revisedBy?.uniqueName
      ?? 'Azure DevOps';

    const comment = await this.deps.comments.appendExternalComment(String(wiId), body, author);
    return { status: comment ? 'applied' : 'ignored:unknown-workitem' };
  }
}
