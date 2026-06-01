import React, { useEffect, useRef, useState } from 'react';
import { requestsApi, type RequestDetail, type Comment } from '../api/requests';
import { attachmentsApi, type AttachmentView } from '../api/attachments';
import { formTemplatesApi, type FormTemplate } from '../api/formTemplates';
import { fmtDate, fmtCommentDate, STATUS_COLORS } from '../lib/utils';
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

export default function ViewRequestDetail({ requestId }: Props) {
  const [req,         setReq]         = useState<RequestDetail | null>(null);
  const [comments,    setComments]    = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<AttachmentView[]>([]);
  const [template,    setTemplate]    = useState<FormTemplate | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [commentHtml, setCommentHtml] = useState('');
  const [sending,     setSending]     = useState(false);
  const [cmtError,    setCmtError]    = useState('');
  const editorRef = useRef<CommentEditorHandle>(null);

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
          .then(({ data }) => {
            setTemplate(data?.data.find(t => t.slug === slug) ?? null);
          })
          .catch(() => {});
      }
    });
  }, [requestId]);

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!req) return;
    const isEmpty = editorRef.current?.isEmpty();
    if (isEmpty) return;
    setSending(true); setCmtError('');
    const { data, error } = await requestsApi.addComment(requestId, commentHtml);
    setSending(false);
    if (error) { setCmtError(error.message); return; }
    if (data) setComments(prev => [...prev, data as Comment]);
    editorRef.current?.clearContent();
    setCommentHtml('');
  };

  // Request-level attachments (commentId = null) shown in the Attachments section
  const requestAttachments = attachments.filter(a => !a.commentId);

  const color = STATUS_COLORS[req?.status ?? ''] ?? 'grey';

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

  const displayData: Record<string, unknown> = {
    ...req.payloadData,
    priority: req.priority || undefined,
    dueDate:  req.dueDate  || undefined,
  };

  return (
    <div className="view view-detail">
      <TopNav />
      <PortalBanner />
      <div className="detailcol">
        <FormCrumbs trail={[
          { label: 'Provana Customer Portal', to: 'portal' },
          { label: 'BLG - Power BI Requests', to: 'requests' },
          { label: req.reference },
        ]} />

        <div style={{ marginBottom: 28 }}>
          <h1 className="account-title" style={{ marginBottom: 6 }}>{req.reference}</h1>
          <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', margin: '0 0 14px' }}>{req.title}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={`badge badge-${color}`}>{req.status}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Submitted {fmtDate(req.createdAt)}</span>
            {req.adoWorkItemId && (
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>· Ticket #{req.adoWorkItemId}</span>
            )}
          </div>
        </div>

        {/* ── Request Details ───────────────────────────────────────────── */}
        {template && (
          <section className="detail-section">
            <h2 className="detail-section-title">Request Details</h2>
            <dl className="payload-grid">
              {template.fieldSchema
                .filter(f => f.type !== 'attachment')
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map(f => {
                  const val = displayData[f.name];
                  if (val === undefined || val === null || val === '') return null;
                  return (
                    <div key={f.name} className="payload-row">
                      <dt className="payload-label">{f.label}</dt>
                      <dd className="payload-value">
                        {f.type === 'richtext'
                          ? <div dangerouslySetInnerHTML={{ __html: val as string }} />
                          : f.type === 'date'
                            ? <span>{fmtDisplayDate(val as string)}</span>
                            : <span>{String(val)}</span>
                        }
                      </dd>
                    </div>
                  );
                })}
            </dl>
          </section>
        )}

        {/* ── Status History ────────────────────────────────────────────── */}
        <section className="detail-section">
          <h2 className="detail-section-title">Status History</h2>
          {req.history.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 14 }}>No history recorded yet.</p>
            : <ol className="timeline">
                {req.history.map((h, i) => (
                  <li key={i} className="timeline-item">
                    <span className="tl-dot" />
                    <div className="tl-body">
                      <strong>{h.toStatus}</strong>
                      {h.fromStatus && <span className="tl-from"> ← {h.fromStatus}</span>}
                      <div className="tl-meta">
                        {fmtDate(h.changedAt)} · {h.source}{h.actor ? ' · ' + h.actor : ''}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
          }
        </section>

        {/* ── Attachments ───────────────────────────────────────────────── */}
        <section className="detail-section">
          <h2 className="detail-section-title">
            Attachments {requestAttachments.length > 0 && (
              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>({requestAttachments.length})</span>
            )}
          </h2>
          {requestAttachments.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 14 }}>No attachments.</p>
            : <ul className="att-list">
                {requestAttachments.map((a) => {
                  const isImage = a.contentType.startsWith('image/');
                  return (
                    <li key={a.id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ fontSize: 20 }}>📎</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <a href={a.signedUrl} download={a.fileName} target="_blank" rel="noopener noreferrer">{a.fileName}</a>
                          <div className="att-meta">
                            {(a.size / 1024).toFixed(1)} KB · {a.contentType} · uploaded by {a.uploadedBy} · {fmtDate(a.uploadedAt)}
                          </div>
                        </div>
                      </div>
                      {isImage && (
                        <img
                          src={a.signedUrl}
                          alt={a.fileName}
                          style={{ maxWidth: '100%', maxHeight: 480, objectFit: 'contain', borderRadius: 6, marginTop: 12, display: 'block', border: '1px solid var(--line-2)' }}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
          }
        </section>

        {/* ── Comments ──────────────────────────────────────────────────── */}
        <section className="detail-section">
          <h2 className="detail-section-title">Comments</h2>
          {comments.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 14 }}>No comments yet.</p>
            : <div className="comment-list">
                {comments.map((c) => (
                  <div key={c.id} className="comment">
                    <div className="comment-header">
                      <strong>{c.author ?? 'Provana Team'}</strong>
                      {c.source === 'TICKET' && (
                        <span className="badge badge-blue" style={{ fontSize: 10 }}>BI Team</span>
                      )}
                      <span className="comment-date">{fmtCommentDate(c.createdAt)}</span>
                    </div>
                    <CommentBody body={c.body} />
                  </div>
                ))}
              </div>
          }
          <form onSubmit={handleComment} style={{ marginTop: 20 }}>
            <div className="field">
              <label className="field-label">Add a comment</label>
              <CommentEditor
                ref={editorRef}
                requestId={requestId}
                onChange={setCommentHtml}
              />
            </div>
            {cmtError && <div className="submit-error">{cmtError}</div>}
            <button
              type="submit"
              className="btn-send"
              style={{ marginTop: 10 }}
              disabled={sending || !commentHtml || editorRef.current?.isEmpty() !== false}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        </section>

        <footer className="powered">Powered by <span className="pw-mark" /> Provana Service Management</footer>
      </div>
    </div>
  );
}
