import type {
  ITicketSystem, CreateTicketCmd, TicketRef, AttachmentUploadResult,
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
 *   POST   /{org}/{project}/_apis/wit/attachments                  → upload attachment
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

    // Tags: "portal; {requestType-slug}" — clean, filterable via WIQL
    const tags = ['portal', cmd.requestType, ...(cmd.labels ?? [])].join('; ');

    const basePatch: PatchOp[] = [
      { op: 'add', path: '/fields/System.Title',       value: cmd.title },
      { op: 'add', path: '/fields/System.Description', value: cmd.body },
      { op: 'add', path: '/fields/System.Tags',        value: tags },
    ];

    // Append native fields (Priority, TargetDate, custom fields) from nativeFields map
    const nativePatch: PatchOp[] = Object.entries(cmd.nativeFields ?? {}).map(([field, value]) => ({
      op:    'add' as const,
      path:  `/fields/${field}`,
      value,
    }));

    const url = this.witUrl(project, `/workitems/$${encodeURIComponent(this.workItemType)}?api-version=7.1`);

    // Try full patch; on 400 (unrecognized custom field or unavailable TargetDate) retry with base only
    let data: AdoWorkItem;
    try {
      data = await this.patchApi<AdoWorkItem>('POST', url, [...basePatch, ...nativePatch]);
    } catch (err) {
      if (isAdoFieldError(err) && nativePatch.length > 0) {
        console.warn('[AzureDevOpsTicketSystem] Native field patch failed — retrying with base fields only');
        data = await this.patchApi<AdoWorkItem>('POST', url, basePatch);
      } else {
        throw err;
      }
    }

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

  async addComment(externalId: string, body: string, targetProjectId?: string): Promise<{ id: string } | null> {
    const project = this.resolveProject(targetProjectId);
    const data = await this.jsonApi<{ id: number; text: string }>(
      'POST',
      this.witUrl(project, `/workitems/${encodeURIComponent(externalId)}/comments?api-version=7.1-preview.3`),
      { text: body },
    );
    return { id: String(data.id) };
  }

  async uploadAttachment(
    fileName:        string,
    data:            Buffer,
    contentType:     string,
    targetProjectId?: string,
  ): Promise<AttachmentUploadResult | null> {
    const project    = this.resolveProject(targetProjectId);
    const encodedName = encodeURIComponent(fileName);
    const url        = `${this.baseOrg}/${encodeURIComponent(project)}/_apis/wit/attachments?fileName=${encodedName}&api-version=7.1`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        // ADO attachment API requires application/octet-stream regardless of the file's MIME type.
        'Content-Type':  'application/octet-stream',
        'Accept':        'application/json',
      },
      body: data,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ADO attachment upload failed ${res.status}: ${text}`);
    }

    const result = await res.json() as { id: string; url: string };
    return { adoId: result.id, adoUrl: result.url };
  }

  async linkAttachmentToWorkItem(
    externalId:       string,
    adoAttachmentUrl: string,
    fileName:         string,
    targetProjectId?: string,
  ): Promise<void> {
    const project = this.resolveProject(targetProjectId);
    const url     = this.witUrl(project, `/workitems/${encodeURIComponent(externalId)}?api-version=7.1`);
    const body: PatchOp[] = [{
      op:    'add',
      path:  '/relations/-',
      value: { rel: 'AttachedFile', url: adoAttachmentUrl, attributes: { comment: fileName } },
    }];

    // ADO uses optimistic concurrency: concurrent PATCHes on the same work item return 409.
    // Retry up to 3 times with short back-off — by the time we retry, the other PATCH has committed.
    const DELAYS_MS = [300, 800, 2000];
    for (let attempt = 0; ; attempt++) {
      try {
        await this.patchApi('PATCH', url, body);
        return;
      } catch (err) {
        const is409 = err instanceof Error && err.message.includes('409');
        if (!is409 || attempt >= DELAYS_MS.length) throw err;
        await new Promise<void>(resolve => setTimeout(resolve, DELAYS_MS[attempt]));
      }
    }
  }

  async downloadAttachment(url: string): Promise<{ data: Buffer; contentType: string } | null> {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': this.authHeader },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`ADO attachment download failed ${res.status}: ${msg}`);
    }
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    const arrayBuffer = await res.arrayBuffer();
    return { data: Buffer.from(arrayBuffer), contentType };
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

/** Returns true when an ADO error indicates an unrecognized or unavailable field. */
function isAdoFieldError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('400') || msg.includes('tfs.workitemtracking') || msg.includes('field');
}
