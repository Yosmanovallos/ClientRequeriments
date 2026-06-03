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
    it('throws when pat is missing', () => {
      expect(() => new AzureDevOpsTicketSystem({ ...CONFIG, pat: '' })).toThrow(/pat is required/);
    });
    it('constructs successfully without project (project is optional)', () => {
      expect(() => new AzureDevOpsTicketSystem({ org: 'acme', pat: 'tok' })).not.toThrow();
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
      expect(url).toBe(`${BASE}/workitems/$Task?api-version=7.1`);
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
      expect(tagsOp.value).toBe('R-1; fix_issue');
    });

    it('uses targetProjectId from cmd over default project', async () => {
      fetchMock.mockResolvedValueOnce(workItemResponse(7));
      const sys = new AzureDevOpsTicketSystem(CONFIG);
      await sys.create({
        title: 't', body: 'b', requestReference: 'R', requestType: 'rt', requesterEmail: 'a@b.com',
        targetProjectId: 'OtherProject',
      });

      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toContain('OtherProject');
      expect(url).not.toContain('BLG-Reports');
    });

    it('throws when no project specified anywhere', async () => {
      const sys = new AzureDevOpsTicketSystem({ org: 'acme', pat: 'tok' });
      await expect(sys.create({
        title: 't', body: 'b', requestReference: 'R', requestType: 'rt', requesterEmail: 'a@b.com',
      })).rejects.toThrow(/no project specified/);
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
        { op: 'add', path: '/fields/System.State', value: 'Active' },
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

    it('uses targetProjectId override when provided', async () => {
      fetchMock.mockResolvedValueOnce(workItemResponse(42));
      const sys = new AzureDevOpsTicketSystem(CONFIG);
      await sys.updateStatus('42', 'IN DEVELOPMENT', 'AltProject');

      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toContain('AltProject');
      expect(url).not.toContain('BLG-Reports');
    });

    it('default Agile map covers every portal status', () => {
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
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body)).toEqual({ text: '**user@example.com:** This is a comment' });
    });

    it('throws on 401 (bad PAT)', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'TF400813: The user is not authorized' }), { status: 401, headers: { 'content-type': 'application/json' } }));
      const sys = new AzureDevOpsTicketSystem(CONFIG);
      await expect(sys.addComment('42', 'hi')).rejects.toThrow(/401 TF400813/);
    });

    it('uses targetProjectId for comment URL', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{"id":1}', { status: 200, headers: { 'content-type': 'application/json' } }));
      const sys = new AzureDevOpsTicketSystem(CONFIG);
      await sys.addComment('42', 'hi', 'AnotherProject');

      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toContain('AnotherProject');
      expect(url).not.toContain('BLG-Reports');
    });
  });

  // ── listExternalProjects ─────────────────────────────────────────────────

  describe('listExternalProjects()', () => {
    it('GETs /_apis/projects and maps to ExternalProject[]', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        count: 2,
        value: [
          { id: 'guid-1', name: 'Bell Legal Group', description: 'BLG portal', url: 'https://dev.azure.com/acme/_apis/projects/guid-1' },
          { id: 'guid-2', name: 'Stonebridge',      description: null,         url: 'https://dev.azure.com/acme/_apis/projects/guid-2' },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } }));

      const sys = new AzureDevOpsTicketSystem(CONFIG);
      const projects = await sys.listExternalProjects();

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://dev.azure.com/acme/_apis/projects?api-version=7.1');
      expect(init.method).toBe('GET');

      expect(projects).toEqual([
        { id: 'guid-1', name: 'Bell Legal Group', description: 'BLG portal', url: 'https://dev.azure.com/acme/_apis/projects/guid-1' },
        { id: 'guid-2', name: 'Stonebridge',      description: null,         url: 'https://dev.azure.com/acme/_apis/projects/guid-2' },
      ]);
    });

    it('returns empty array when ADO returns no projects', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ count: 0, value: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      const sys = new AzureDevOpsTicketSystem(CONFIG);
      expect(await sys.listExternalProjects()).toEqual([]);
    });
  });

  // ── listExternalWorkItems ────────────────────────────────────────────────

  describe('listExternalWorkItems()', () => {
    it('issues WIQL query then fetches work items by ID', async () => {
      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify({
          workItems: [{ id: 1, url: '...' }, { id: 2, url: '...' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          count: 2,
          value: [
            { id: 1, url: 'u1', fields: { 'System.Title': 'Alpha', 'System.State': 'To Do', 'Microsoft.VSTS.Common.Priority': 2 }, _links: { html: { href: 'h1' } } },
            { id: 2, url: 'u2', fields: { 'System.Title': 'Beta',  'System.State': 'Doing', 'Microsoft.VSTS.Common.Priority': 1 }, _links: { html: { href: 'h2' } } },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } }));

      const sys = new AzureDevOpsTicketSystem(CONFIG);
      const items = await sys.listExternalWorkItems('BLG-Reports');

      // First call: WIQL POST
      const [wiqlUrl, wiqlInit] = fetchMock.mock.calls[0]!;
      expect(wiqlUrl).toContain('BLG-Reports');
      expect(wiqlUrl).toContain('wiql');
      expect(wiqlInit.method).toBe('POST');

      // Second call: batch GET
      const [getUrl] = fetchMock.mock.calls[1]!;
      expect(getUrl).toContain('ids=1,2');

      expect(items).toEqual([
        { id: '1', title: 'Alpha', state: 'To Do', priority: 2, url: 'h1' },
        { id: '2', title: 'Beta',  state: 'Doing', priority: 1, url: 'h2' },
      ]);
    });

    it('returns empty array when WIQL yields no work items', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ workItems: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      const sys = new AzureDevOpsTicketSystem(CONFIG);
      expect(await sys.listExternalWorkItems('BLG-Reports')).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1); // no second GET needed
    });
  });

  // ── getExternalWorkItem ──────────────────────────────────────────────────

  describe('getExternalWorkItem()', () => {
    it('GETs work item detail and maps all fields', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        id: 1, url: 'item-url',
        fields: {
          'System.Title':                              'Test Item',
          'System.State':                              'To Do',
          'Microsoft.VSTS.Common.Priority':            2,
          'System.Description':                        '<p>Details</p>',
          'System.AssignedTo':                         { displayName: 'Jane Doe' },
          'Microsoft.VSTS.Scheduling.DueDate':         '2026-12-31',
          'System.CreatedDate':                        '2026-06-03T12:00:00Z',
          'System.CreatedBy':                          { displayName: 'ovallosyosman' },
        },
        _links: { html: { href: 'https://dev.azure.com/acme/BLG-Reports/_workitems/edit/1' } },
      }), { status: 200, headers: { 'content-type': 'application/json' } }));

      const sys = new AzureDevOpsTicketSystem(CONFIG);
      const detail = await sys.getExternalWorkItem('BLG-Reports', '1');

      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toContain('BLG-Reports');
      expect(url).toContain('workitems/1');
      expect(url).toContain('$expand=all');

      expect(detail).toEqual({
        id:          '1',
        title:       'Test Item',
        state:       'To Do',
        priority:    2,
        url:         'https://dev.azure.com/acme/BLG-Reports/_workitems/edit/1',
        description: '<p>Details</p>',
        assignedTo:  'Jane Doe',
        dueDate:     '2026-12-31',
        createdAt:   '2026-06-03T12:00:00Z',
        createdBy:   'ovallosyosman',
      });
    });
  });

  // ── listExternalWorkItemComments ─────────────────────────────────────────

  describe('listExternalWorkItemComments()', () => {
    it('GETs /comments and maps to ExternalComment[]', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        totalCount: 2,
        comments: [
          { id: 10, text: 'First comment', createdDate: '2026-06-01T10:00:00Z', createdBy: { displayName: 'Alice' } },
          { id: 11, text: 'Second',        createdDate: '2026-06-02T11:00:00Z', createdBy: { displayName: 'Bob' } },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } }));

      const sys = new AzureDevOpsTicketSystem(CONFIG);
      const comments = await sys.listExternalWorkItemComments('BLG-Reports', '42');

      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toContain('BLG-Reports');
      expect(url).toContain('workitems/42/comments');

      expect(comments).toEqual([
        { id: '10', body: 'First comment', author: 'Alice', createdAt: '2026-06-01T10:00:00Z' },
        { id: '11', body: 'Second',        author: 'Bob',   createdAt: '2026-06-02T11:00:00Z' },
      ]);
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
