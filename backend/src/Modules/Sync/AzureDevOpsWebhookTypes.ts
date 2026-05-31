/**
 * Type definitions for the subset of Azure DevOps Service Hooks payloads we consume.
 * Only fields we actually read are typed — ADO's full schemas are large and noisy.
 *
 * Reference: https://learn.microsoft.com/en-us/azure/devops/service-hooks/events
 *
 * Event types we handle:
 *   - workitem.updated   — fired when fields change (we care if System.State changed)
 *   - workitem.commented — fired when the System.History field (the comment thread) gets a new entry
 *
 * Event types we ignore (200 OK without action):
 *   - workitem.created   — we created it via the adapter, no need to mirror back
 *   - workitem.deleted, workitem.restored — out of scope for the MVP
 */

export type AzureDevOpsEventType =
  | 'workitem.created'
  | 'workitem.updated'
  | 'workitem.commented'
  | 'workitem.deleted'
  | 'workitem.restored'
  | string;

/** Diff envelope ADO sends for each changed field on workitem.updated. */
export interface FieldDiff<T = unknown> {
  oldValue?: T;
  newValue?: T;
}

export interface AzureDevOpsWorkItemUpdatedPayload {
  id:        string;     // delivery UUID — used for dedup
  eventType: 'workitem.updated' | string;
  resource: {
    id?:           number;      // some ADO versions use `id`
    workItemId?:   number;      // others use `workItemId` — we accept both
    rev:           number;
    revisedBy?:    { displayName?: string; uniqueName?: string };
    fields: {
      'System.State'?:  FieldDiff<string>;
      'System.Reason'?: FieldDiff<string>;
      [field: string]:  FieldDiff | undefined;
    };
  };
}

export interface AzureDevOpsWorkItemCommentedPayload {
  id:        string;
  eventType: 'workitem.commented' | string;
  resource: {
    id?:         number;
    workItemId?: number;
    revisedBy?:  { displayName?: string; uniqueName?: string };
    fields?: {
      // ADO surfaces comment text via the History field on this event
      'System.History'?: string | { newValue?: string };
      [field: string]:  unknown;
    };
  };
}
