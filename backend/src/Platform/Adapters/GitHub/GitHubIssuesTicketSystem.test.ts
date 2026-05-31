import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitHubIssuesTicketSystem } from './GitHubIssuesTicketSystem.js';

const CONFIG = { token: 'ghp_test_token', owner: 'acme', repo: 'requests' };
const BASE   = 'https://api.github.com/repos/acme/requests';

/** Build a Response-like object the adapter can consume. */
function mockResponse(status: number, body: unknown, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });
}

describe('GitHubIssuesTicketSystem', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── constructor ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('throws when token is missing', () => {
      expect(() => new GitHubIssuesTicketSystem({ token: '', owner: 'a', repo: 'b' })).toThrow(/token is required/);
    });
    it('throws when owner is missing', () => {
      expect(() => new GitHubIssuesTicketSystem({ token: 't', owner: '', repo: 'b' })).toThrow(/owner and repo/);
    });
    it('throws when repo is missing', () => {
      expect(() => new GitHubIssuesTicketSystem({ token: 't', owner: 'a', repo: '' })).toThrow(/owner and repo/);
    });
  });

  // ── create ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('POSTs to /issues with title, body, and combined labels', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(201, {
        number: 42,
        html_url: 'https://github.com/acme/requests/issues/42',
      }));

      const sys = new GitHubIssuesTicketSystem(CONFIG);
      const ref = await sys.create({
        title: '[CBLPBR-630] CLJ Task Productivity',
        body:  'goal: track productivity',
        requestReference: 'CBLPBR-630',
        requestType:      'new_report',
        requesterEmail:   'user@example.com',
        priority:         'High',
        labels:           ['custom-tag'],
      });

      expect(ref).toEqual({
        externalId:  '42',
        externalUrl: 'https://github.com/acme/requests/issues/42',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${BASE}/issues`);
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body);
      expect(body.title).toBe('[CBLPBR-630] CLJ Task Productivity');
      expect(body.labels).toEqual(['new_report', 'priority:high', 'custom-tag']);
    });

    it('sends Authorization Bearer header and GitHub API version', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(201, { number: 1, html_url: 'http://x/1' }));

      const sys = new GitHubIssuesTicketSystem(CONFIG);
      await sys.create({
        title: 't', body: 'b', requestReference: 'R-1', requestType: 'new_report', requesterEmail: 'a@b.com',
      });

      const [, init] = fetchMock.mock.calls[0]!;
      expect(init.headers['Authorization']).toBe('Bearer ghp_test_token');
      expect(init.headers['Accept']).toBe('application/vnd.github+json');
      expect(init.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
      expect(init.headers['User-Agent']).toBe('clientrequirements-portal');
    });

    it('throws with GitHub error message on non-2xx response', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(422, { message: 'Validation Failed' }));

      const sys = new GitHubIssuesTicketSystem(CONFIG);
      await expect(sys.create({
        title: 't', body: 'b', requestReference: 'R-1', requestType: 'new_report', requesterEmail: 'a@b.com',
      })).rejects.toThrow(/GitHub API POST \/issues failed: 422 Validation Failed/);
    });

    it('omits priority label when priority is not provided', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(201, { number: 1, html_url: 'http://x/1' }));

      const sys = new GitHubIssuesTicketSystem(CONFIG);
      await sys.create({
        title: 't', body: 'b', requestReference: 'R-1', requestType: 'fix_issue', requesterEmail: 'a@b.com',
      });

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.labels).toEqual(['fix_issue']);
    });
  });

  // ── updateStatus ─────────────────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('PATCHes with state=open for non-terminal statuses', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, {}));

      const sys = new GitHubIssuesTicketSystem(CONFIG);
      await sys.updateStatus('42', 'IN REVIEW');

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${BASE}/issues/42`);
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toEqual({ state: 'open', state_reason: null });
    });

    it('closes with state_reason=completed for DONE', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, {}));

      const sys = new GitHubIssuesTicketSystem(CONFIG);
      await sys.updateStatus('42', 'DONE');

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body).toEqual({ state: 'closed', state_reason: 'completed' });
    });

    it('closes with state_reason=not_planned for CANCELLED', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, {}));

      const sys = new GitHubIssuesTicketSystem(CONFIG);
      await sys.updateStatus('42', 'CANCELLED');

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body).toEqual({ state: 'closed', state_reason: 'not_planned' });
    });

    it('throws on 404 (issue not found)', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(404, { message: 'Not Found' }));

      const sys = new GitHubIssuesTicketSystem(CONFIG);
      await expect(sys.updateStatus('999', 'DONE')).rejects.toThrow(/404 Not Found/);
    });
  });

  // ── addComment ───────────────────────────────────────────────────────────

  describe('addComment()', () => {
    it('POSTs to /issues/{number}/comments with the body field', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(201, { id: 99 }));

      const sys = new GitHubIssuesTicketSystem(CONFIG);
      await sys.addComment('42', '**user@example.com:** This is a comment');

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${BASE}/issues/42/comments`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ body: '**user@example.com:** This is a comment' });
    });

    it('throws on 401 (bad token)', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(401, { message: 'Bad credentials' }));

      const sys = new GitHubIssuesTicketSystem(CONFIG);
      await expect(sys.addComment('42', 'hi')).rejects.toThrow(/401 Bad credentials/);
    });
  });

  // ── apiUrl override (GitHub Enterprise) ──────────────────────────────────

  describe('apiUrl override', () => {
    it('uses the override base URL for Enterprise installations', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(201, { number: 1, html_url: 'http://x/1' }));

      const sys = new GitHubIssuesTicketSystem({ ...CONFIG, apiUrl: 'https://github.acme.internal/api/v3' });
      await sys.create({
        title: 't', body: 'b', requestReference: 'R-1', requestType: 'new_report', requesterEmail: 'a@b.com',
      });

      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://github.acme.internal/api/v3/repos/acme/requests/issues');
    });
  });
});
