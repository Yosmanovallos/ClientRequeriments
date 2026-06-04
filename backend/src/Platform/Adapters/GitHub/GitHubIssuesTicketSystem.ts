import type {
  ITicketSystem, CreateTicketCmd, TicketRef, AttachmentUploadResult,
  ExternalProject, WorkItemFilters, WorkItemSummary, WorkItemDetail, ExternalComment,
} from '../../Ports/ITicketSystem.js';

/**
 * GitHub Issues adapter for ITicketSystem.
 *
 * Uses native `fetch` (Node 18+) — no @octokit/rest SDK dependency.
 * All GitHub-specific knowledge (REST shape, auth header, label conventions,
 * state-vs-state_reason semantics) lives in THIS file. Modules/ never sees any of it.
 *
 * Status mapping (portal → GitHub):
 *   DONE       → state: closed, state_reason: completed
 *   CANCELLED  → state: closed, state_reason: not_planned
 *   everything else (NEW, IN REVIEW, APPROVED, …) → state: open
 *
 * Precise portal status is the source of truth in the DB; GitHub only shows
 * open/closed because issue state has no equivalent to "IN DEVELOPMENT" etc.
 * The webhook handler (Task 007 / Phase 5b) will sync open/close events back.
 */

export interface GitHubConfig {
  token: string;
  owner: string;
  repo:  string;
  apiUrl?: string;   // override for self-hosted GitHub Enterprise; defaults to api.github.com
}

const TERMINAL_STATUSES = new Set(['DONE', 'CANCELLED']);

export class GitHubIssuesTicketSystem implements ITicketSystem {
  private readonly base:    string;
  private readonly headers: Record<string, string>;

  constructor(private readonly config: GitHubConfig) {
    if (!config.token)              throw new Error('GitHubIssuesTicketSystem: token is required (set GITHUB_TOKEN)');
    if (!config.owner || !config.repo) throw new Error('GitHubIssuesTicketSystem: owner and repo are required');

    this.base = `${config.apiUrl ?? 'https://api.github.com'}/repos/${config.owner}/${config.repo}`;
    this.headers = {
      // Bearer works for both classic PATs and fine-grained tokens (modern docs)
      'Authorization':         `Bearer ${config.token}`,
      'Accept':                'application/vnd.github+json',
      'X-GitHub-Api-Version':  '2022-11-28',
      'Content-Type':          'application/json',
      'User-Agent':            'clientrequirements-portal',
    };
  }

  async create(cmd: CreateTicketCmd): Promise<TicketRef> {
    const labels = [
      cmd.requestType,
      ...(cmd.priority ? [`priority:${cmd.priority.toLowerCase()}`] : []),
      ...(cmd.labels ?? []),
    ];
    const data = await this.api<{ number: number; html_url: string }>('POST', '/issues', {
      title: cmd.title,
      body:  cmd.body,
      labels,
    });
    return { externalId: String(data.number), externalUrl: data.html_url };
  }

  async updateStatus(externalId: string, status: string, _targetProjectId?: string): Promise<void> {
    const isTerminal = TERMINAL_STATUSES.has(status);
    const body: Record<string, unknown> = {
      state: isTerminal ? 'closed' : 'open',
    };
    if (status === 'DONE')      body['state_reason'] = 'completed';
    if (status === 'CANCELLED') body['state_reason'] = 'not_planned';
    if (!isTerminal)            body['state_reason'] = null;   // reopen clears reason

    await this.api('PATCH', `/issues/${externalId}`, body);
  }

  async addComment(externalId: string, body: string, _targetProjectId?: string): Promise<{ id: string } | null> {
    await this.api('POST', `/issues/${externalId}/comments`, { body });
    return null;
  }

  async uploadAttachment(
    _fileName: string,
    _data: Buffer,
    _contentType: string,
    _targetProjectId?: string,
  ): Promise<AttachmentUploadResult | null> {
    return null;
  }

  async linkAttachmentToWorkItem(
    _externalId: string,
    _adoAttachmentUrl: string,
    _fileName: string,
    _targetProjectId?: string,
  ): Promise<void> {
    // no-op
  }

  async listExternalProjects(): Promise<ExternalProject[]> {
    return [];
  }

  async listExternalWorkItems(_projectId: string, _filters?: WorkItemFilters): Promise<WorkItemSummary[]> {
    return [];
  }

  async getExternalWorkItem(_projectId: string, _workItemId: string): Promise<WorkItemDetail> {
    throw new Error('getExternalWorkItem is not supported by GitHubIssuesTicketSystem');
  }

  async listExternalWorkItemComments(_projectId: string, _workItemId: string): Promise<ExternalComment[]> {
    return [];
  }

  async downloadAttachment(_url: string): Promise<{ data: Buffer; contentType: string } | null> {
    return null;
  }

  // ── private ─────────────────────────────────────────────────────────────

  private async api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.base}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let parsed: unknown = null;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      try { parsed = await res.json(); } catch { /* tolerate empty body on 204s */ }
    }

    if (!res.ok) {
      const msg = (parsed as { message?: string } | null)?.message ?? res.statusText;
      throw new Error(`GitHub API ${method} ${path} failed: ${res.status} ${msg}`);
    }
    return parsed as T;
  }
}
