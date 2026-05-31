import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AzureDevOpsTicketSystem, DEFAULT_STATE_MAP_AGILE } from './AzureDevOpsTicketSystem.js';

const CONFIG = { org: 'acme', project: 'BLG-Reports', pat: 'pat_test_token_xyz' };
const BASE   = 'https://dev.azure.com/acme/BLG-Reports/_apis/wit';

/** Build a successful work-item JSON response. */
function workItemResponse(id = 42, htmlUrl = 'https://dev.azure.com/acme/BLG-Reports/_workitems/edit/42'): Response {
  return new Response(JSON.stringify({
    id, url: `https://dev.azure.com/acme/_apis/wit/workItems/${id}`,
    fields: { 'System.Title': 't' },
    _links: { html: { href: htmlUrl } },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('AzureDevOpsTicketSystem', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  // ── constructor ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('throws when org is missing', () => {
      expect(() => new AzureDevOpsTicketSystem({ ...CONFIG, org: '' })).toThrow(/org is required/);
    });
    it('throws when project is missing', () => {
      expect(() => new AzureDevOpsTicketSystem({ ...CONFIG, project: '' })).toThrow(/project is required/);
    });
    it('throws when pat is missing', () => {
      expect(() => new AzureDevOpsTicketSystem({ ...CONFIG, pat: '' })).toThrow(/pat is required/);
    });
  });

  // ── create ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('POSTs JSON Patch body with Title, Description, Tags', async () => {
      fetchMock.mockResolvedValueOnce(workItemResponse(42));
      const sys = new AzureDevOpsTicketSystem(CONFIG);

      const ref = await sys.create({
        title: '[CBLPBR-630] CLJ Productivity',
        body:  'Goal: track productivity',
        requestReference: 'CBLPBR-630',
        requestType:      'new_report',
        priority:         'High',
        requesterEmail:   'user@example.com',
      });

      expect(ref).toEqual({
        externalId:  '42',
        externalUrl: 'https://dev.azure.com/acme/BLG-Reports/_workitems/edit/42',
      });

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${BASE}/workitems/$Task?api-version=7.1`);          // default work item type is Task
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json-patch+json');

      const body = JSON.parse(init.body);
      expect(body).toEqual([
        { op: 'add', path: '/fields/System.Title',       value: '[CBLPBR-630] CLJ Productivity' },
        { op: 'add', path: '/fields/System.Description', value: 'Goal: track productivity' },
        { op: 'add', path: '/fields/System.Tags',        value: 'CBLPBR-630; new_report; priority:high' },
      ]);
    });

    it('sends Basic Auth header with base64(":" + PAT)', async () => {
      fetchMock.mockResolvedValueOnce(workItemResponse());
      const sys = new AzureDevOpsTicketSystem(CONFIG);
      await sys.create({
        title: 't', body: 'b', requestReference: 'R', requestType: 'new_report', requesterEmail: 'a@b.com',
      });

      const [, init] = fetchMock.mock.calls[0]!;
      const expected = 'Basic ' + Buffer.from(':pat_test_token_xyz').toString('base64');
      expect(init.headers['Authorization']).toBe(expected);
    });

    it('uses ADO_WORK_ITEM_TYPE override (URL-encoded for multi-word types)', async () => {
      fetchMock.mockResolvedValueOnce(workItemResponse());
      const sys = new AzureDevOpsTicketSystem({ ...CONFIG, workItemType: 'User Story' });
      await sys.create({
        title: 't', body: 'b', requestReference: 'R', requestType: 'new_report', requesterEmail: 'a@b.com',
      });

      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${BASE}/workitems/$User%20Story?api-version=7.1`);
    });

    it('falls back to derived URL when response has no _links.html', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        id: 99, url: 'https://dev.azure.com/acme/_apis/wit/workItems/99', fields: {},
      }), { status: 200, headers: { 'content-type': 'application/json' } }));

      const sys = new AzureDevOpsTicketSystem(CONFIG);
      const ref = await sys.create({
        title: 't', body: 'b', requestReference: 'R', requestType: 'new_report', requesterEmail: 'a@b.com',
      });
      expect(ref.externalUrl).toBe('https://dev.azure.com/acme/BLG-Reports/_workitems/edit/99');
    });

    it('throws with ADO error message on non-2xx', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        message: 'The field "System.Title" is required',
      }), { status: 400, headers: { 'content-type': 'application/json' } }));

      const sys = new AzureDevOpsTicketSystem(CONFIG);
      await expect(sys.create({
        title: 't', body: 'b', requestReference: 'R', requestType: 'new_report', requesterEmail: 'a@b.com',
      })).rejects.toThrow(/Azure DevOps POST .* failed: 400 The field "System\.Title" is required/);
    });

    it('omits priority tag when priority not provided', async () => {
      fetchMock.mockResolvedValueOnce(workItemResponse());
      const sys = new AzureDevOpsTicketSystem(CONFIG);
      await sys.create({
        title: 't', body: 'b', requestReference: 'R-1', requestType: 'fix_issue', requesterEmail: 'a@b.com',
      });

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      const tagsOp = body.find((op: { path: string }) => op.path === '/fields/System.Tags');
      expect(tagsOp.value).toBe('R-1; fix_issue');           // no priority segment
    });
  });

  // ── updateStatus ─────────────────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('PATCHes System.State for non-terminal statuses (default Agile mapping)', async () => {
      fetchMock.mockResolvedValueOnce(workItemResponse(42));
      const sys = new AzureDevOpsTicketSystem(CONFIG);
      await sys.updateStatus('42', 'IN DEVELOPMENT');

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${BASE}/workitems/42?api-version=7.1`);
      expect(init.method).toBe('PATCH');
      expect(init.headers['Content-Type']).toBe('application/json-patch+json');
      expect(JSON.parse(init.body)).toEqual([
        { op: 'add', path: '/fields/System.State', value: 'Active' },     // IN DEVELOPMENT → Active in Agile
      ]);
    });

    it('PATCHes State + Reason for DONE (Agile: Closed + Fixed)', async () => {
      fetchMock.mockResolvedValueOnce(workItemResponse(42));
      const sys = new AzureDevOpsTicketSystem(CONFIG);
      await sys.updateStatus('42', 'DONE');

      expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual([
        { op: 'add', path: '/fields/System.State',  value: 'Closed' },
        { op: 'add', path: '/fields/System.Reason', value: 'Fixed' },
      ]);
    });

    it('PATCHes State + Reason for CANCELLED (Removed + Abandoned)', async () => {
      fetchMock.mockResolvedValueOnce(workItemResponse(42));
      const sys = new AzureDevOpsTicketSystem(CONFIG);
      await sys.updateStatus('42', 'CANCELLED');

      expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual([
        { op: 'add', path: '/fields/System.State',  value: 'Removed' },
        { op: 'add', path: '/fields/System.Reason', value: 'Abandoned' },
      ]);
    });

    it('applies stateMap override (Scrum process)', async () => {
      fetchMock.mockResolvedValueOnce(workItemResponse(42));
      const scrumMap = {
        'DONE':       { state: 'Done',    reason: 'Work finished' },
        'IN DEVELOPMENT': { state: 'Committed' },
      };
      const sys = new AzureDevOpsTicketSystem({ ...CONFIG, stateMap: scrumMap });
      await sys.updateStatus('42', 'DONE');

      expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual([
        { op: 'add', path: '/fields/System.State',  value: 'Done' },
        { op: 'add', path: '/fields/System.Reason', value: 'Work finished' },
      ]);
    });

    it('skips update silently when status has no mapping (warn-and-continue)', async () => {
      const sys = new AzureDevOpsTicketSystem(CONFIG);
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await sys.updateStatus('42', 'BOGUS_STATUS_UNKNOWN');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('No mapping for status "BOGUS_STATUS_UNKNOWN"'));

      consoleWarn.mockRestore();
    });

    it('throws on 404 (work item not found)', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        message: 'TF401232: Work item 999 does not exist',
      }), { status: 404, headers: { 'content-type': 'application/json' } }));

      const sys = new AzureDevOpsTicketSystem(CONFIG);
      await expect(sys.updateStatus('999', 'DONE')).rejects.toThrow(/404 TF401232/);
    });

    it('default Agile map covers every portal status', () => {
      // Regression guard: if a new portal status is added (`Request.ts`), this test fails until the mapping is updated.
      const portalStatuses = ['NEW', 'IN REVIEW', 'APPROVED', 'IN DEVELOPMENT', 'UAT', 'CUSTOMER FEEDBACK', 'DONE', 'CANCELLED', 'ON HOLD'];
      for (const s of portalStatuses) {
        expect(DEFAULT_STATE_MAP_AGILE[s], `Missing mapping for portal status "${s}"`).toBeDefined();
      }
    });
  });

  // ── addComment ───────────────────────────────────────────────────────────

  describe('addComment()', () => {
    it('POSTs to /workitems/{id}/comments with {text}', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{"id":1}', { status: 200, headers: { 'content-type': 'application/json' } }));
      const sys = new AzureDevOpsTicketSystem(CONFIG);
      await sys.addComment('42', '**user@example.com:** This is a comment');

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${BASE}/workitems/42/comments?api-version=7.1-preview.3`);
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json');      // plain JSON, not json-patch
      expect(JSON.parse(init.body)).toEqual({ text: '**user@example.com:** This is a comment' });
    });

    it('throws on 401 (bad PAT)', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'TF400813: The user is not authorized' }), { status: 401, headers: { 'content-type': 'application/json' } }));
      const sys = new AzureDevOpsTicketSystem(CONFIG);
      await expect(sys.addComment('42', 'hi')).rejects.toThrow(/401 TF400813/);
    });
  });

  // ── apiUrl override (Azure DevOps Server on-prem) ────────────────────────

  describe('apiUrl override', () => {
    it('uses the override base for Azure DevOps Server installations', async () => {
      fetchMock.mockResolvedValueOnce(workItemResponse());
      const sys = new AzureDevOpsTicketSystem({ ...CONFIG, apiUrl: 'https://tfs.acme.internal/tfs' });
      await sys.create({
        title: 't', body: 'b', requestReference: 'R', requestType: 'new_report', requesterEmail: 'a@b.com',
      });

      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://tfs.acme.internal/tfs/acme/BLG-Reports/_apis/wit/workitems/$Task?api-version=7.1');
    });

    it('URL-encodes org and project names with spaces', async () => {
      fetchMock.mockResolvedValueOnce(workItemResponse());
      const sys = new AzureDevOpsTicketSystem({ org: 'My Org', project: 'BI Reports', pat: 'p' });
      await sys.create({
        title: 't', body: 'b', requestReference: 'R', requestType: 'new_report', requesterEmail: 'a@b.com',
      });

      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://dev.azure.com/My%20Org/BI%20Reports/_apis/wit/workitems/$Task?api-version=7.1');
    });
  });
});
