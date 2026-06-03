import type {
  ITicketSystem, CreateTicketCmd, TicketRef,
  ExternalProject, WorkItemFilters, WorkItemSummary, WorkItemDetail, ExternalComment,
} from '../../Ports/ITicketSystem.js';

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
 *   GET    /{org}/_apis/projects                                   → list projects
 *   POST   /{org}/{project}/_apis/wit/wiql                         → query work items
 *   GET    /{org}/{project}/_apis/wit/workitems                    → fetch work items by IDs
 *   GET    /{org}/{project}/_apis/wit/workitems/{id}               → get single work item
 *   GET    /{org}/{project}/_apis/wit/workitems/{id}/comments       → list comments
 *
 * Reference: https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items
 */

export interface AzureDevOpsConfig {
  org:     string;
  /** Default project name or GUID. Optional when all callers supply targetProjectId. */
  project?: string;
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
  'ON HOLD':           { state: 'New' },
};

export class AzureDevOpsTicketSystem implements ITicketSystem {
  private readonly baseOrg:        string;
  private readonly defaultProject: string | undefined;
  private readonly workItemType:   string;
  private readonly stateMap:       Record<string, { state: string; reason?: string }>;
  private readonly authHeader:     string;

  constructor(private readonly config: AzureDevOpsConfig) {
    if (!config.org) throw new Error('AzureDevOpsTicketSystem: org is required (set ADO_ORG)');
    if (!config.pat) throw new Error('AzureDevOpsTicketSystem: pat is required (set ADO_PAT)');

    const apiRoot       = (config.apiUrl ?? 'https://dev.azure.com').replace(/\/$/, '');
    this.baseOrg        = `${apiRoot}/${encodeURIComponent(config.org)}`;
    this.defaultProject = config.project;
    this.workItemType   = config.workItemType ?? 'Task';
    this.stateMap       = config.stateMap ?? DEFAULT_STATE_MAP_AGILE;
    this.authHeader     = 'Basic ' + Buffer.from(':' + config.pat).toString('base64');
  }

  // ── ITicketSystem: write operations ──────────────────────────────────────

  async create(cmd: CreateTicketCmd): Promise<TicketRef> {
    const project = this.resolveProject(cmd.targetProjectId);
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
      this.witUrl(project, `/workitems/$${encodeURIComponent(this.workItemType)}?api-version=7.1`),
      patch,
    );

    const htmlUrl = data._links?.html?.href
      ?? `${(this.config.apiUrl ?? 'https://dev.azure.com').replace(/\/$/, '')}/${this.config.org}/${project}/_workitems/edit/${data.id}`;

    return { externalId: String(data.id), externalUrl: htmlUrl };
  }

  async updateStatus(externalId: string, status: string, targetProjectId?: string): Promise<void> {
    const mapping = this.stateMap[status];
    if (!mapping) {
      console.warn(`[AzureDevOpsTicketSystem] No mapping for status "${status}" — skipping update`);
      return;
    }

    const project = this.resolveProject(targetProjectId);
    const patch: PatchOp[] = [
      { op: 'add', path: '/fields/System.State', value: mapping.state },
    ];
    if (mapping.reason) {
      patch.push({ op: 'add', path: '/fields/System.Reason', value: mapping.reason });
    }

    await this.patchApi(
      'PATCH',
      this.witUrl(project, `/workitems/${encodeURIComponent(externalId)}?api-version=7.1`),
      patch,
    );
  }

  async addComment(externalId: string, body: string, targetProjectId?: string): Promise<void> {
    const project = this.resolveProject(targetProjectId);
    await this.jsonApi(
      'POST',
      this.witUrl(project, `/workitems/${encodeURIComponent(externalId)}/comments?api-version=7.1-preview.3`),
      { text: body },
    );
  }

  // ── ITicketSystem: read operations ────────────────────────────────────────

  async listExternalProjects(): Promise<ExternalProject[]> {
    const data = await this.getApi<AdoProjectListResponse>(
      `${this.baseOrg}/_apis/projects?api-version=7.1`,
    );
    return (data.value ?? []).map(p => ({
      id:          p.id,
      name:        p.name,
      description: p.description ?? null,
      url:         p.url,
    }));
  }

  async listExternalWorkItems(projectId: string, filters?: WorkItemFilters): Promise<WorkItemSummary[]> {
    const top = filters?.top ?? 200;
    const stateClause = filters?.state ? ` AND [System.State] = '${filters.state}'` : '';
    const typeClause  = filters?.type  ? ` AND [System.WorkItemType] = '${filters.type}'` : '';

    const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project${stateClause}${typeClause} ORDER BY [System.CreatedDate] DESC`;

    const wiqlResult = await this.jsonApi<AdoWiqlResponse>(
      'POST',
      `${this.baseOrg}/${encodeURIComponent(projectId)}/_apis/wit/wiql?api-version=7.1&$top=${top}`,
      { query: wiql },
    );

    const ids = (wiqlResult.workItems ?? []).map(w => w.id).slice(0, top);
    if (ids.length === 0) return [];

    const fields = 'System.Id,System.Title,System.State,Microsoft.VSTS.Common.Priority';
    const itemsData = await this.getApi<AdoWorkItemListResponse>(
      `${this.baseOrg}/${encodeURIComponent(projectId)}/_apis/wit/workitems?ids=${ids.join(',')}&fields=${fields}&api-version=7.1`,
    );

    return (itemsData.value ?? []).map(item => ({
      id:       String(item.id),
      title:    String(item.fields['System.Title'] ?? ''),
      state:    String(item.fields['System.State'] ?? ''),
      priority: typeof item.fields['Microsoft.VSTS.Common.Priority'] === 'number'
        ? item.fields['Microsoft.VSTS.Common.Priority'] as number
        : null,
      url:      item._links?.html?.href ?? item.url,
    }));
  }

  async getExternalWorkItem(projectId: string, workItemId: string): Promise<WorkItemDetail> {
    const item = await this.getApi<AdoWorkItem>(
      `${this.baseOrg}/${encodeURIComponent(projectId)}/_apis/wit/workitems/${encodeURIComponent(workItemId)}?$expand=all&api-version=7.1`,
    );

    const assignedTo = item.fields['System.AssignedTo'];
    const createdBy  = item.fields['System.CreatedBy'];

    return {
      id:          String(item.id),
      title:       String(item.fields['System.Title'] ?? ''),
      state:       String(item.fields['System.State'] ?? ''),
      priority:    typeof item.fields['Microsoft.VSTS.Common.Priority'] === 'number'
        ? item.fields['Microsoft.VSTS.Common.Priority'] as number
        : null,
      url:         item._links?.html?.href ?? item.url,
      description: item.fields['System.Description']
        ? String(item.fields['System.Description'])
        : null,
      assignedTo:  assignedTo && typeof assignedTo === 'object'
        ? String((assignedTo as Record<string, unknown>)['displayName'] ?? '')
        : null,
      dueDate:     item.fields['Microsoft.VSTS.Scheduling.DueDate']
        ? String(item.fields['Microsoft.VSTS.Scheduling.DueDate'])
        : null,
      createdAt:   String(item.fields['System.CreatedDate'] ?? ''),
      createdBy:   createdBy && typeof createdBy === 'object'
        ? String((createdBy as Record<string, unknown>)['displayName'] ?? '')
        : null,
    };
  }

  async listExternalWorkItemComments(projectId: string, workItemId: string): Promise<ExternalComment[]> {
    const data = await this.getApi<AdoCommentListResponse>(
      `${this.baseOrg}/${encodeURIComponent(projectId)}/_apis/wit/workitems/${encodeURIComponent(workItemId)}/comments?api-version=7.1-preview.3`,
    );

    return (data.comments ?? []).map(c => ({
      id:        String(c.id),
      body:      c.text ?? '',
      author:    c.createdBy?.displayName ?? null,
      createdAt: c.createdDate ?? '',
    }));
  }

  // ── private helpers ──────────────────────────────────────────────────────

  private resolveProject(targetProjectId?: string): string {
    const p = targetProjectId ?? this.defaultProject;
    if (!p) throw new Error('AzureDevOpsTicketSystem: no project specified — pass targetProjectId or set ADO_PROJECT');
    return p;
  }

  private witUrl(project: string, path: string): string {
    return `${this.baseOrg}/${encodeURIComponent(project)}/_apis/wit${path}`;
  }

  private async patchApi<T = unknown>(method: string, url: string, body: PatchOp[]): Promise<T> {
    return this.fetchUrl<T>(method, url, JSON.stringify(body), 'application/json-patch+json');
  }

  private async jsonApi<T = unknown>(method: string, url: string, body: unknown): Promise<T> {
    return this.fetchUrl<T>(method, url, JSON.stringify(body), 'application/json');
  }

  private async getApi<T = unknown>(url: string): Promise<T> {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': this.authHeader,
        'Accept':        'application/json',
      },
    });
    return this.parseResponse<T>('GET', url, res);
  }

  private async fetchUrl<T>(method: string, url: string, body: string, contentType: string): Promise<T> {
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': this.authHeader,
        'Accept':        'application/json',
        'Content-Type':  contentType,
      },
      body,
    });
    return this.parseResponse<T>(method, url, res);
  }

  private async parseResponse<T>(method: string, url: string, res: Response): Promise<T> {
    let parsed: unknown = null;
    if ((res.headers.get('content-type') ?? '').includes('application/json')) {
      try { parsed = await res.json(); } catch { /* tolerate empty */ }
    }
    if (!res.ok) {
      const msg = (parsed as { message?: string } | null)?.message ?? res.statusText;
      throw new Error(`Azure DevOps ${method} ${url} failed: ${res.status} ${msg}`);
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

interface AdoProjectListResponse {
  value: Array<{ id: string; name: string; description?: string; url: string }>;
  count: number;
}

interface AdoWiqlResponse {
  workItems?: Array<{ id: number; url: string }>;
}

interface AdoWorkItemListResponse {
  value: AdoWorkItem[];
  count: number;
}

interface AdoCommentListResponse {
  comments?: Array<{
    id:          number;
    text?:       string;
    createdDate?: string;
    createdBy?:  { displayName?: string };
  }>;
  totalCount?: number;
}
