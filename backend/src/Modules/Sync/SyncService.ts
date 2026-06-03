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

/** ADO integer priority → portal priority string. */
const PRIORITY_REVERSE_MAP: Record<number, string> = {
  1: 'High', 2: 'High', 3: 'Medium', 4: 'Low',
};

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
  status: 'applied' | 'ignored:no-change' | 'ignored:unknown-workitem' | 'ignored:missing-workitem-id';
  mappedTo?: RequestStatus;
}

export interface AdoCommentedEventResult {
  status: 'applied' | 'ignored:no-comment' | 'ignored:unknown-workitem' | 'ignored:missing-workitem-id';
}

/**
 * SyncService — orchestrates external-system events into portal state changes.
 *
 * Endpoints are responsible for HTTP-layer concerns (HMAC, dedup, response shape).
 * This class owns the *semantic* mapping: external event → portal effect.
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

    const wiStr = String(wiId);
    const actor = payload.resource.revisedBy?.uniqueName
      ?? payload.resource.revisedBy?.displayName
      ?? null;

    const fields = payload.resource.fields;
    const metaUpdates: {
      adoAssignedTo?: string | null;
      priority?: string;
      dueDate?: Date | null;
      title?: string;
    } = {};
    let statusApplied: RequestStatus | undefined;

    // 1. State change
    const stateDiff = fields['System.State'];
    if (stateDiff?.newValue) {
      const target = mapAdoStateToStatus(stateDiff.newValue);
      if (target) {
        const applied = await this.deps.requests.applyExternalStatus(wiStr, target, 'azuredevops', actor);
        if (!applied) return { status: 'ignored:unknown-workitem' };
        statusApplied = target;
      }
    }

    // 2. AssignedTo change
    const assignedToDiff = fields['System.AssignedTo'];
    if (assignedToDiff !== undefined && 'newValue' in (assignedToDiff ?? {})) {
      const raw = (assignedToDiff as { newValue?: unknown }).newValue;
      metaUpdates.adoAssignedTo = typeof raw === 'string'
        ? (raw || null)
        : (raw as { displayName?: string } | null)?.displayName ?? null;
    }

    // 3. Priority change
    const priorityDiff = fields['Microsoft.VSTS.Common.Priority'];
    if (priorityDiff !== undefined && 'newValue' in (priorityDiff ?? {})) {
      const adoInt = Number((priorityDiff as { newValue?: unknown }).newValue);
      if (!isNaN(adoInt) && adoInt > 0) {
        metaUpdates.priority = PRIORITY_REVERSE_MAP[adoInt] ?? 'Medium';
      }
    }

    // 4. Due date change
    const targetDateDiff = fields['Microsoft.VSTS.Scheduling.TargetDate'];
    if (targetDateDiff !== undefined && 'newValue' in (targetDateDiff ?? {})) {
      const newVal = (targetDateDiff as { newValue?: string | null }).newValue;
      metaUpdates.dueDate = newVal ? new Date(newVal) : null;
    }

    // 5. Title change — strip the [REF] prefix that the portal added
    const titleDiff = fields['System.Title'];
    if (titleDiff !== undefined && 'newValue' in (titleDiff ?? {})) {
      const newVal = (titleDiff as { newValue?: string }).newValue;
      if (newVal) {
        metaUpdates.title = newVal.replace(/^\[[\w-]+\]\s*/, '').trim();
      }
    }

    // Apply accumulated meta updates
    if (Object.keys(metaUpdates).length > 0) {
      await this.deps.requests.updateAdoMeta(wiStr, metaUpdates);
    }

    // If nothing actionable changed, report no-change
    if (!statusApplied && Object.keys(metaUpdates).length === 0) {
      return { status: 'ignored:no-change' };
    }

    return { status: 'applied', mappedTo: statusApplied };
  }

  async handleAdoWorkItemCommented(payload: AzureDevOpsWorkItemCommentedPayload): Promise<AdoCommentedEventResult> {
    const wiId = payload.resource.workItemId ?? payload.resource.id;
    if (wiId == null) return { status: 'ignored:missing-workitem-id' };

    // Extract comment text — newer API: resource.comment.text; older: System.History field
    const body =
      payload.resource.comment?.text
      ?? (typeof payload.resource.fields?.['System.History'] === 'string'
        ? payload.resource.fields['System.History']
        : (payload.resource.fields?.['System.History'] as { newValue?: string } | undefined)?.newValue
      )
      ?? '';

    if (!body) return { status: 'ignored:no-comment' };

    const author = payload.resource.comment?.createdBy?.displayName
      ?? payload.resource.revisedBy?.displayName
      ?? payload.resource.revisedBy?.uniqueName
      ?? 'Azure DevOps';

    // ADO comment ID — newer API uses resource.comment.id; older uses resource.id
    const adoCommentId = payload.resource.comment?.id != null
      ? String(payload.resource.comment.id)
      : payload.resource.id != null
        ? String(payload.resource.id)
        : null;

    // appendExternalComment deduplicates by adoCommentId internally
    const comment = await this.deps.comments.appendExternalComment(
      String(wiId), body, author, adoCommentId,
    );
    return { status: comment ? 'applied' : 'ignored:unknown-workitem' };
  }
}
