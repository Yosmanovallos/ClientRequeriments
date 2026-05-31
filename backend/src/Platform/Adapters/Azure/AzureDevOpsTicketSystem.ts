import type { ITicketSystem, CreateTicketCmd, TicketRef } from '../../Ports/ITicketSystem.js';

/**
 * Azure DevOps adapter for ITicketSystem.
 *
 * Uses native fetch — no `azure-devops-node-api` SDK. The Work Items REST surface is small
 * enough that hand-rolling avoids ~3MB of dependencies and a strict SDK version coupling.
 *
 * Vendor specifics encapsulated here (DO NOT leak to Modules/):
 *   - JSON Patch body format (`application/json-patch+json`) for create/update
 *   - Basic Auth with `Authorization: Basic base64(':' + PAT)` — username MUST be empty
 *   - Work item types live in URL path with `$` prefix and URL-encoded names: `$Task`, `$User%20Story`
 *   - Status mapping (project-process-specific — overridable via `stateMap` config)
 *   - `System.Reason` field paired with state transitions to record WHY a state changed
 *
 * REST surface used (api-version 7.1):
 *   POST   /{org}/{project}/_apis/wit/workitems/${type}            → create
 *   PATCH  /{org}/{project}/_apis/wit/workitems/{id}               → update fields/state
 *   POST   /{org}/{project}/_apis/wit/workitems/{id}/comments       → add comment (preview api)
 *
 * Reference: https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items
 */

export interface AzureDevOpsConfig {
  org:     string;
  project: string;
  pat:     string;
  /** Work item type to create — defaults to "Task". Project must have this type in its process template. */
  workItemType?: string;
  /** Override the API base — for Azure DevOps Server (on-prem). Defaults to https://dev.azure.com */
  apiUrl?: string;
  /**
   * Override the portal-status → ADO-state mapping. Defaults are for the Agile process template.
   * Pass an object keyed by portal status (NEW, IN REVIEW, etc.) with `{ state, reason? }` values.
   */
  stateMap?: Record<string, { state: string; reason?: string }>;
}

/**
 * Default mapping for the Agile process template (the most common).
 * Override via `stateMap` (or `ADO_STATE_MAP_JSON` env) for Scrum / Basic / CMMI projects.
 *
 *   Scrum:  New → Approved → Committed → Done → Removed
 *   Basic:  To Do → Doing → Done
 *   CMMI:   Proposed → Active → Resolved → Closed
 */
export const DEFAULT_STATE_MAP_AGILE: Record<string, { state: string; reason?: string }> = {
  'NEW':               { state: 'New' },
  'IN REVIEW':         { state: 'New' },
  'APPROVED':          { state: 'New' },
  'IN DEVELOPMENT':    { state: 'Active' },
  'UAT':               { state: 'Resolved' },
  'CUSTOMER FEEDBACK': { state: 'Resolved', reason: 'Information received' },
  'DONE':              { state: 'Closed',   reason: 'Fixed' },
  'CANCELLED':         { state: 'Removed',  reason: 'Abandoned' },
  'ON HOLD':           { state: 'New' },        // ADO has no native "on hold"; pair with a tag instead
};

export class AzureDevOpsTicketSystem implements ITicketSystem {
  private readonly base:          string;
  private readonly workItemType:  string;
  private readonly stateMap:      Record<string, { state: string; reason?: string }>;
  private readonly authHeader:    string;

  constructor(private readonly config: AzureDevOpsConfig) {
    if (!config.org)     throw new Error('AzureDevOpsTicketSystem: org is required (set ADO_ORG)');
    if (!config.project) throw new Error('AzureDevOpsTicketSystem: project is required (set ADO_PROJECT)');
    if (!config.pat)     throw new Error('AzureDevOpsTicketSystem: pat is required (set ADO_PAT)');

    const apiRoot = (config.apiUrl ?? 'https://dev.azure.com').replace(/\/$/, '');
    this.base         = `${apiRoot}/${encodeURIComponent(config.org)}/${encodeURIComponent(config.project)}/_apis/wit`;
    this.workItemType = config.workItemType ?? 'Task';
    this.stateMap     = config.stateMap ?? DEFAULT_STATE_MAP_AGILE;
    // ADO Basic Auth: username is empty, password is the PAT
    this.authHeader   = 'Basic ' + Buffer.from(':' + config.pat).toString('base64');
  }

  async create(cmd: CreateTicketCmd): Promise<TicketRef> {
    const tags = [
      cmd.requestReference,
      cmd.requestType,
      ...(cmd.priority ? [`priority:${cmd.priority.toLowerCase()}`] : []),
      ...(cmd.labels ?? []),
    ].join('; ');

    const patch: PatchOp[] = [
      { op: 'add', path: '/fields/System.Title',       value: cmd.title },
      { op: 'add', path: '/fields/System.Description', value: cmd.body },
      { op: 'add', path: '/fields/System.Tags',        value: tags },
    ];

    const data = await this.patchApi<AdoWorkItem>(
      'POST',
      `/workitems/$${encodeURIComponent(this.workItemType)}?api-version=7.1`,
      patch,
    );

    const htmlUrl = data._links?.html?.href
      ?? `${(this.config.apiUrl ?? 'https://dev.azure.com').replace(/\/$/, '')}/${this.config.org}/${this.config.project}/_workitems/edit/${data.id}`;

    return { externalId: String(data.id), externalUrl: htmlUrl };
  }

  async updateStatus(externalId: string, status: string): Promise<void> {
    const mapping = this.stateMap[status];
    if (!mapping) {
      // Unknown status — log and skip rather than corrupt the ADO state machine
      console.warn(`[AzureDevOpsTicketSystem] No mapping for status "${status}" — skipping update`);
      return;
    }

    const patch: PatchOp[] = [
      { op: 'add', path: '/fields/System.State', value: mapping.state },
    ];
    if (mapping.reason) {
      patch.push({ op: 'add', path: '/fields/System.Reason', value: mapping.reason });
    }

    await this.patchApi(
      'PATCH',
      `/workitems/${encodeURIComponent(externalId)}?api-version=7.1`,
      patch,
    );
  }

  async addComment(externalId: string, body: string): Promise<void> {
    await this.jsonApi(
      'POST',
      `/workitems/${encodeURIComponent(externalId)}/comments?api-version=7.1-preview.3`,
      { text: body },
    );
  }

  // ── private helpers ──────────────────────────────────────────────────────

  /** Calls that use the JSON Patch body format (create + update work items). */
  private async patchApi<T = unknown>(method: string, path: string, body: PatchOp[]): Promise<T> {
    return this.fetch<T>(method, path, JSON.stringify(body), 'application/json-patch+json');
  }

  /** Calls that use plain JSON (comments, etc.). */
  private async jsonApi<T = unknown>(method: string, path: string, body: unknown): Promise<T> {
    return this.fetch<T>(method, path, JSON.stringify(body), 'application/json');
  }

  private async fetch<T>(method: string, path: string, body: string, contentType: string): Promise<T> {
    const url = `${this.base}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': this.authHeader,
        'Accept':        'application/json',
        'Content-Type':  contentType,
      },
      body,
    });

    let parsed: unknown = null;
    if ((res.headers.get('content-type') ?? '').includes('application/json')) {
      try { parsed = await res.json(); } catch { /* tolerate empty */ }
    }

    if (!res.ok) {
      const msg = (parsed as { message?: string } | null)?.message ?? res.statusText;
      throw new Error(`Azure DevOps ${method} ${path} failed: ${res.status} ${msg}`);
    }
    return parsed as T;
  }
}

// ── internal types ──────────────────────────────────────────────────────────

interface PatchOp {
  op:    'add' | 'replace' | 'remove' | 'test';
  path:  string;
  value?: unknown;
}

interface AdoWorkItem {
  id:     number;
  url:    string;
  fields: Record<string, unknown>;
  _links?: {
    html?: { href: string };
  };
}
