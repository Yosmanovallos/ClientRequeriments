import React, { useEffect, useRef, useState } from 'react';
import { requestsApi, type RequestDetail, type Comment, type StatusHistoryEntry } from '../api/requests';
import { attachmentsApi, type AttachmentView } from '../api/attachments';
import { formTemplatesApi, type FormTemplate } from '../api/formTemplates';
import { fmtDate, fmtCommentDate, STATUS_COLORS, TYPE_LABEL } from '../lib/utils';
import { useApp } from '../context/AppContext';
import CommentEditor, { type CommentEditorHandle } from '../components/CommentEditor';
import CommentBody from '../components/CommentBody';
import TopNav from '../components/layout/TopNav';
import PortalBanner from '../components/layout/PortalBanner';
import FormCrumbs from '../components/layout/FormCrumbs';
import LoadingSpinner from '../components/LoadingSpinner';

interface Props { requestId: string; }

function fmtDisplayDate(val: string): string {
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function initials(str: string): string {
  return (str ?? '').split(/[\s@._-]+/).filter(Boolean).slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '').join('') || '?';
}

// ── Activity timeline helpers ─────────────────────────────────────────────────

type HistoryGroup = { type: 'history'; items: StatusHistoryEntry[] };
type CommentGroup = { type: 'comment'; entry: Comment };
type TimelineGroup = HistoryGroup | CommentGroup;

function buildGroups(history: StatusHistoryEntry[], comments: Comment[]): TimelineGroup[] {
  type RawItem =
    | { kind: 'history'; entry: StatusHistoryEntry; date: number }
    | { kind: 'comment'; entry: Comment; date: number };

  const items: RawItem[] = [
    ...history.map(h => ({ kind: 'history' as const, entry: h, date: new Date(h.changedAt).getTime() })),
    ...comments.map(c => ({ kind: 'comment' as const, entry: c, date: new Date(c.createdAt).getTime() })),
  ].sort((a, b) => a.date - b.date);

  const groups: TimelineGroup[] = [];
  for (const item of items) {
    if (item.kind === 'history') {
      const last = groups[groups.length - 1];
      if (last?.type === 'history') {
        last.items.push(item.entry);
      } else {
        groups.push({ type: 'history', items: [item.entry] });
      }
    } else {
      groups.push({ type: 'comment', entry: item.entry });
    }
  }
  return groups;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ViewRequestDetail({ requestId }: Props) {
  const { user } = useApp();
  const [req,         setReq]         = useState<RequestDetail | null>(null);
  const [comments,    setComments]    = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<AttachmentView[]>([]);
  const [template,    setTemplate]    = useState<FormTemplate | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [commentHtml, setCommentHtml] = useState('');
  const [sending,     setSending]     = useState(false);
  const [cmtError,    setCmtError]    = useState('');
  const [showDetails,    setShowDetails]    = useState(true);
  const [notifOn,        setNotifOn]        = useState(false);
  const [commentOpen,    setCommentOpen]    = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [showAllActivity, setShowAllActivity] = useState(false);
  const editorRef = useRef<CommentEditorHandle>(null);

  useEffect(() => {
    if (commentOpen) editorRef.current?.focus();
  }, [commentOpen]);

  useEffect(() => {
    if (!requestId) { setLoading(false); return; }
    Promise.all([
      requestsApi.getDetail(requestId),
      requestsApi.listComments(requestId),
      attachmentsApi.list(requestId),
    ]).then(([{ data: r }, { data: c }, { data: a }]) => {
      setReq(r ?? null);
      setComments((c as { data: Comment[] } | null)?.data ?? []);
      setAttachments(a ?? []);
      setLoading(false);
      if (r?.projectId) {
        const slug = r.requestType.replace(/_/g, '-');
        formTemplatesApi.listByProject(r.projectId)
          .then(({ data }) => setTemplate(data?.data.find(t => t.slug === slug) ?? null))
          .catch(() => {});
      }
    });
  }, [requestId]);

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!req || editorRef.current?.isEmpty()) return;
    setSending(true); setCmtError('');
    const { data, error } = await requestsApi.addComment(requestId, commentHtml);
    setSending(false);
    if (error) { setCmtError(error.message); return; }
    if (data) setComments(prev => [...prev, data as Comment]);
    editorRef.current?.clearContent();
    setCommentHtml('');
    setCommentOpen(false);
  };

  const cancelComment = () => {
    setCommentOpen(false);
    editorRef.current?.clearContent();
    setCommentHtml('');
    setCmtError('');
  };

  const toggleGroup = (i: number) =>
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });

  // Loading / error states
  if (loading) return (
    <div className="view view-detail">
      <TopNav /><PortalBanner />
      <div className="detailcol"><LoadingSpinner label="Loading request…" block /></div>
    </div>
  );

  if (!req) return (
    <div className="view view-detail">
      <TopNav /><PortalBanner />
      <div className="detailcol">
        <FormCrumbs trail={[
          { label: 'Provana Customer Portal', to: 'portal' },
          { label: 'BLG - Power BI Requests', to: 'requests' },
          { label: '…' },
        ]} />
        <p style={{ color: 'var(--muted)', marginTop: 24 }}>Request not found or access denied.</p>
      </div>
    </div>
  );

  // Field partitioning by displayLocation
  const canSeeHidden = user?.role && user.role !== 'CLIENT';
  const sortedFields = (template?.fieldSchema ?? [])
    .filter(f => f.type !== 'attachment')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const leftFields   = sortedFields.filter(f => !f.displayLocation || f.displayLocation === 'left');
  const rightFields  = sortedFields.filter(f => f.displayLocation === 'right');
  const hiddenFields = canSeeHidden ? sortedFields.filter(f => f.displayLocation === 'hidden') : [];
  const allLeftFields = [...leftFields, ...hiddenFields];

  const displayData = req.payloadData;

  const requestAttachments = attachments.filter(a => !a.commentId);
  const color = STATUS_COLORS[req.status] ?? 'grey';
  const groups = buildGroups(req.history, comments);
  const ACTIVITY_LIMIT = 3;
  const visibleGroups  = showAllActivity ? groups : groups.slice(-ACTIVITY_LIMIT);
  const hiddenCount    = groups.length - visibleGroups.length;

  return (
    <div className="view view-detail">
      <TopNav />
      <PortalBanner />
      <div className="detailcol detail-wide">

        {/* Breadcrumbs */}
        <FormCrumbs trail={[
          { label: 'Provana Customer Portal', to: 'portal' },
          { label: 'BLG - Power BI Requests', to: 'requests' },
          { label: req.reference },
        ]} />

        {/* Header — full width above two-column area */}
        <div className="detail-header">
          <h1>{req.reference}</h1>
          <p className="detail-subtitle">{req.title}</p>
          <div className="detail-meta">
            <span className={`badge badge-${color}`}>{req.status}</span>
            <span>Submitted {fmtDate(req.createdAt)}</span>
            {req.adoWorkItemId && <span>· Ticket #{req.adoWorkItemId}</span>}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="detail-layout">

          {/* ── Left column ───────────────────────────────────────────── */}
          <div className="detail-main">

            {/* Collapsible reporter / details box */}
            <div className="detail-reporter-box">
              <div className="detail-reporter-row">
                <span className="detail-reporter-name">
                  Raised by <strong>{req.createdBy ?? 'Unknown'}</strong>
                </span>
                <button
                  type="button"
                  className="detail-toggle-btn"
                  onClick={() => setShowDetails(v => !v)}
                >
                  {showDetails ? 'Hide details' : 'Show details'}
                </button>
              </div>

              {showDetails && (
                <div className="detail-fields">
                  {allLeftFields.length === 0 && !req.priority && !req.dueDate ? (
                    <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>No details recorded.</p>
                  ) : (
                    <dl className="payload-grid">
                      {req.priority && (
                        <div className="payload-row">
                          <dt className="payload-label">Priority</dt>
                          <dd className="payload-value">{req.priority}</dd>
                        </div>
                      )}
                      {req.dueDate && (
                        <div className="payload-row">
                          <dt className="payload-label">Due Date</dt>
                          <dd className="payload-value">{fmtDisplayDate(req.dueDate)}</dd>
                        </div>
                      )}
                      {allLeftFields.map(f => {
                        const val = req.payloadData[f.name];
                        if (val === undefined || val === null || val === '') return null;
                        return (
                          <div key={f.name} className="payload-row">
                            <dt className="payload-label">
                              {f.label}
                              {f.displayLocation === 'hidden' && (
                                <span style={{ marginLeft: 5, fontSize: 10, color: '#a30000', fontWeight: 400, textTransform: 'none' }}>
                                  (internal)
                                </span>
                              )}
                            </dt>
                            <dd className="payload-value">
                              {f.type === 'richtext'
                                ? <div dangerouslySetInnerHTML={{ __html: val as string }} />
                                : f.type === 'date'
                                  ? <span>{fmtDisplayDate(val as string)}</span>
                                  : <span>{String(val)}</span>}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}
                </div>
              )}
            </div>

            {/* Attachments */}
            {requestAttachments.length > 0 && (
              <div className="detail-reporter-box">
                <div className="detail-reporter-row" style={{ borderBottom: '1px solid var(--line-2)' }}>
                  <span className="detail-reporter-name">
                    <strong>Attachments</strong>
                    <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>
                      ({requestAttachments.length})
                    </span>
                  </span>
                </div>
                <div className="detail-fields">
                  <ul className="att-list" style={{ margin: 0 }}>
                    {requestAttachments.map(a => {
                      const isImg = a.contentType.startsWith('image/');
                      return (
                        <li key={a.id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span style={{ fontSize: 18 }}>📎</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <a href={a.signedUrl} download={a.fileName} target="_blank" rel="noopener noreferrer">
                                {a.fileName}
                              </a>
                              <div className="att-meta">
                                {(a.size / 1024).toFixed(1)} KB · uploaded by {a.uploadedBy} · {fmtDate(a.uploadedAt)}
                              </div>
                            </div>
                          </div>
                          {isImg && (
                            <img
                              src={a.signedUrl}
                              alt={a.fileName}
                              style={{ maxWidth: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 6, marginTop: 10, display: 'block', border: '1px solid var(--line-2)' }}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}

            {/* Activity feed */}
            <div style={{ marginBottom: 24 }}>
              <h2 className="detail-section-title">Activity</h2>
              <div className="activity-feed">
                {groups.length === 0 && (
                  <p style={{ color: 'var(--muted)', fontSize: 14 }}>No activity yet.</p>
                )}
                {hiddenCount > 0 && (
                  <button className="show-more-btn" onClick={() => setShowAllActivity(true)}>
                    Show {hiddenCount} more
                  </button>
                )}
                {visibleGroups.map((group) => {
                  const gi = groups.indexOf(group);
                  if (group.type === 'history') {
                    const { items } = group;
                    const isExpanded = expandedGroups.has(gi);
                    const visible = isExpanded ? items : [items[0]!];
                    const collapsedCount = items.length - 1;
                    return (
                      <div key={gi}>
                        {visible.map((h, hi) => (
                          <div key={hi} className="activity-auto">
                            <span className="activity-auto-icon">⚙</span>
                            <span>
                              <strong>Automatic response</strong>
                              {' · '}{fmtCommentDate(h.changedAt)}
                              {' · '}Status changed to <strong>{h.toStatus}</strong>
                              {h.fromStatus && <span style={{ color: 'var(--muted)' }}> (from {h.fromStatus})</span>}
                              {h.actor && <span> · {h.actor}</span>}
                            </span>
                          </div>
                        ))}
                        {collapsedCount > 0 && (
                          <button className="show-more-btn" onClick={() => toggleGroup(gi)}>
                            {isExpanded ? 'Show less' : `Show ${collapsedCount} more`}
                          </button>
                        )}
                      </div>
                    );
                  }
                  const c = group.entry;
                  return (
                    <div key={gi} className="activity-user">
                      <div className="activity-avatar">{initials(c.author ?? 'P')}</div>
                      <div className="activity-user-body">
                        <div className="activity-user-header">
                          <span className="activity-user-name">{c.author ?? 'Provana Team'}</span>
                          {c.source === 'TICKET' && (
                            <span className="badge badge-blue" style={{ fontSize: 10 }}>BI Team</span>
                          )}
                          <span className="activity-user-date">{fmtCommentDate(c.createdAt)}</span>
                        </div>
                        <CommentBody body={c.body} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Comment box */}
            <div>
              <h2 className="detail-section-title">Add a comment</h2>
              {!commentOpen ? (
                <div
                  className="cmt-trigger"
                  onClick={() => setCommentOpen(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setCommentOpen(true)}
                >
                  Add a comment…
                </div>
              ) : (
                <form onSubmit={handleComment}>
                  <div className="cmt-open-wrap">
                    <CommentEditor
                      ref={editorRef}
                      requestId={requestId}
                      onChange={setCommentHtml}
                    />
                  </div>
                  {cmtError && <div className="submit-error" style={{ marginTop: 8 }}>{cmtError}</div>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <button
                      type="submit"
                      className="btn-send"
                      disabled={sending || !commentHtml || editorRef.current?.isEmpty() !== false}
                    >
                      {sending ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" className="btn-cancel" onClick={cancelComment}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* ── Right aside panel ──────────────────────────────────────── */}
          <div className="detail-aside">
            <div className="aside-card">

              {/* Status */}
              <div className="aside-section">
                <div className="aside-label">Status</div>
                <span className={`badge badge-${color}`} style={{ fontSize: 11.5, padding: '5px 10px', letterSpacing: '.5px' }}>
                  {req.status}
                </span>
              </div>

              {/* Notifications */}
              <div className="aside-section">
                <button
                  type="button"
                  className={`notif-btn${notifOn ? ' is-on' : ''}`}
                  onClick={() => setNotifOn(v => !v)}
                >
                  {notifOn ? '🔔' : '🔕'}&nbsp; Notifications {notifOn ? 'on' : 'off'}
                </button>
              </div>

              {/* Request type */}
              <div className="aside-section">
                <div className="aside-label">Request type</div>
                <div className="aside-value">
                  📋&nbsp;{TYPE_LABEL[req.requestType] ?? req.requestType}
                </div>
              </div>

              {/* Right-panel fields from template */}
              {rightFields.map(f => {
                const val = req.payloadData[f.name];
                if (val === undefined || val === null || val === '') return null;
                return (
                  <div key={f.name} className="aside-section">
                    <div className="aside-label">{f.label}</div>
                    <div className="aside-value">
                      {f.type === 'richtext'
                        ? <div dangerouslySetInnerHTML={{ __html: val as string }} />
                        : f.type === 'date'
                          ? fmtDisplayDate(val as string)
                          : String(val)}
                    </div>
                  </div>
                );
              })}

              {/* Shared with */}
              <div className="aside-section">
                <div className="aside-label">Shared with</div>
                <div className="aside-shared-item">
                  <div className="aside-avatar">{initials(req.createdBy ?? 'U')}</div>
                  <span style={{ fontSize: 13, color: 'var(--ink)' }}>{req.createdBy ?? 'Unknown'}</span>
                </div>
                {req.organizationName && (
                  <div className="aside-shared-item">
                    <div className="aside-avatar aside-org-avatar">{initials(req.organizationName)}</div>
                    <span style={{ fontSize: 13, color: 'var(--ink)' }}>{req.organizationName}</span>
                  </div>
                )}
                <button type="button" className="aside-share-btn">+ Share</button>
              </div>
            </div>
          </div>
        </div>

        <footer className="powered">Powered by <span className="pw-mark" /> Provana Service Management</footer>
      </div>
    </div>
  );
}
