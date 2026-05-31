// ── Data access layer ─────────────────────────────────────────────
// All methods fall back to mock data when Supabase is not configured.

const STATUS_COLORS = {
  'SUBMITTED': 'grey', 'IN REVIEW': 'blue', 'IN DEVELOPMENT': 'blue',
  'CUSTOMER FEEDBACK': 'blue', 'UAT': 'green', 'APPROVED': 'green',
  'RESOLVED': 'green', 'CLOSED': 'grey', 'REJECTED': 'red',
  'ON HOLD': 'amber', 'CREATE FAILED': 'red',
};

const TYPE_ICONS = {
  new_report: 'IconLaptop', new_page: 'IconBook', new_feature: 'IconCloudUp',
  fix_issue: 'IconWrench', view_request: 'IconCode',
  data_eng: 'IconDatabase', other: 'IconChats',
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date(), diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || 'grey';
  const cls = c === 'blue' ? 'badge badge-blue'
    : c === 'green' ? 'badge badge-green'
    : c === 'red'   ? 'badge badge-red'
    : c === 'amber' ? 'badge badge-amber'
    : 'badge badge-grey';
  return <span className={cls}>{status || '—'}</span>;
}

const _now = () => new Date().toISOString();
const MOCK_ROWS = [
  { id: '1', reference: 'CBLPBR-627', title: '2 claims marked as BLG only but aren\'t BLG only', status: 'IN REVIEW',      priority: 'High',    request_type: 'fix_issue',   created_at: _now(), updated_at: _now() },
  { id: '2', reference: 'CBLPBR-628', title: 'Update frequency criteria on both pages',           status: 'IN REVIEW',      priority: 'High',    request_type: 'new_feature', created_at: _now(), updated_at: _now() },
  { id: '3', reference: 'CBLPBR-626', title: 'BC Missing: Check File/Outreach (Repeats > 21 days)', status: 'APPROVED',    priority: 'High',    request_type: 'new_page',   created_at: _now(), updated_at: _now() },
  { id: '4', reference: 'CBLPBR-625', title: 'CLJ Task Productivity',                            status: 'IN DEVELOPMENT', priority: 'Highest', request_type: 'new_page',   created_at: _now(), updated_at: _now() },
  { id: '5', reference: 'CBLPBR-622', title: 'DON Confirmed Dual Reps',                          status: 'IN DEVELOPMENT', priority: 'Highest', request_type: 'new_page',   created_at: _now(), updated_at: _now() },
  { id: '6', reference: 'CBLPBR-624', title: 'Add total counters in the tables (CLJ Task)',      status: 'UAT',            priority: 'High',    request_type: 'new_feature', created_at: _now(), updated_at: _now() },
  { id: '7', reference: 'CBLPBR-562', title: 'Process DC in Claimant CC',                        status: 'CUSTOMER FEEDBACK', priority: 'High', request_type: 'new_page',  created_at: _now(), updated_at: _now() },
  { id: '8', reference: 'CBLPBR-610', title: 'Diseases in visual are duplicated',                status: 'CUSTOMER FEEDBACK', priority: 'Highest', request_type: 'fix_issue', created_at: _now(), updated_at: _now() },
];

const db = {
  async createRequest(type, title, priority, dueDate, payload) {
    if (!window.supabaseClient) {
      const n = 629 + Math.floor(Math.random() * 50);
      return { data: { reference: 'CBLPBR-' + n, id: crypto.randomUUID(), status: 'SUBMITTED' }, error: null };
    }
    return window.supabaseClient.rpc('create_request', {
      p_idempotency_key: crypto.randomUUID(),
      p_request_type:    type,
      p_title:           title || 'Untitled',
      p_priority:        priority || 'High',
      p_due_date:        dueDate || null,
      p_payload:         payload || {},
    });
  },

  async listRequests(search) {
    if (!window.supabaseClient) {
      const s = (search || '').toLowerCase();
      const rows = s
        ? MOCK_ROWS.filter(r => r.title.toLowerCase().includes(s) || r.reference.toLowerCase().includes(s))
        : MOCK_ROWS;
      return { data: rows, error: null };
    }
    let q = window.supabaseClient.from('requests')
      .select('id,reference,title,status,priority,request_type,created_at,updated_at')
      .order('created_at', { ascending: false });
    if (search) q = q.or(`title.ilike.%${search}%,reference.ilike.%${search}%`);
    return q;
  },

  async getDetail(id) {
    if (!window.supabaseClient) return { data: null, error: null };
    return window.supabaseClient.from('v_request_detail').select('*').eq('id', id).single();
  },

  async getHistory(requestId) {
    if (!window.supabaseClient) return { data: [], error: null };
    return window.supabaseClient.from('status_history')
      .select('*').eq('request_id', requestId).order('changed_at');
  },

  async getComments(requestId) {
    if (!window.supabaseClient) return { data: [], error: null };
    return window.supabaseClient.from('comments')
      .select('*').eq('request_id', requestId).eq('visibility', 'public').order('created_at');
  },

  async addComment(requestId, body) {
    if (!window.supabaseClient) return { data: null, error: null };
    return window.supabaseClient.rpc('add_comment', { p_request_id: requestId, p_body: body });
  },
};

Object.assign(window, { db, fmtDate, StatusBadge, STATUS_COLORS, TYPE_ICONS });
