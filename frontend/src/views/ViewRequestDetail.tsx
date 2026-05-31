import React, { useEffect, useState } from 'react';
import { requestsApi, type RequestDetail, type Comment } from '../api/requests';
import { attachmentsApi, type AttachmentView } from '../api/attachments';
import { fmtDate, STATUS_COLORS } from '../lib/utils';
import TopNav from '../components/layout/TopNav';
import PortalBanner from '../components/layout/PortalBanner';
import FormCrumbs from '../components/layout/FormCrumbs';
import LoadingSpinner from '../components/LoadingSpinner';

interface Props { requestId: string; }

export default function ViewRequestDetail({ requestId }: Props) {
  const [req,         setReq]         = useState<RequestDetail | null>(null);
  const [comments,    setComments]    = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<AttachmentView[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [comment,     setComment]     = useState('');
  const [sending,     setSending]     = useState(false);
  const [cmtError,    setCmtError]    = useState('');

  useEffect(() => {
    if (!requestId) { setLoading(false); return; }
    Promise.all([
      requestsApi.getDetail(requestId),
      requestsApi.listComments(requestId),
      attachmentsApi.list(requestId),
    ]).then(([{ data: r }, { data: c }, { data: a }]) => {
      setReq(r);
      setComments((c as { data: Comment[] } | null)?.data ?? []);
      setAttachments(a);
      setLoading(false);
    });
  }, [requestId]);

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || !req) return;
    setSending(true); setCmtError('');
    const { data, error } = await requestsApi.addComment(requestId, comment);
    setSending(false);
    if (error) { setCmtError(error.message); return; }
    if (data) setComments(prev => [...prev, data as Comment]);
    setComment('');
  };

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

        <section className="detail-section">
          <h2 className="detail-section-title">
            Attachments {attachments.length > 0 && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>({attachments.length})</span>}
          </h2>
          {attachments.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 14 }}>No attachments.</p>
            : <ul className="att-list">
                {attachments.map((a) => (
                  <li key={a.id}>
                    <span style={{ fontSize: 20 }}>📎</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={a.signedUrl} target="_blank" rel="noopener noreferrer">{a.fileName}</a>
                      <div className="att-meta">
                        {(a.size / 1024).toFixed(1)} KB · {a.contentType} · uploaded by {a.uploadedBy} · {fmtDate(a.uploadedAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
          }
        </section>

        <section className="detail-section">
          <h2 className="detail-section-title">Comments</h2>
          {comments.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 14 }}>No comments yet.</p>
            : <div className="comment-list">
                {comments.map((c, i) => (
                  <div key={i} className="comment">
                    <div className="comment-header">
                      <strong>{c.author ?? 'Provana Team'}</strong>
                      {c.source === 'TICKET' && (
                        <span className="badge badge-blue" style={{ fontSize: 10 }}>BI Team</span>
                      )}
                      <span className="comment-date">{fmtDate(c.createdAt)}</span>
                    </div>
                    <div className="comment-body">{c.body}</div>
                  </div>
                ))}
              </div>
          }
          <form onSubmit={handleComment} style={{ marginTop: 20 }}>
            <div className="field">
              <label className="field-label">Add a comment</label>
              <textarea className="txt txt-area" value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Write a comment…"
                style={{ minHeight: 88 }} />
            </div>
            {cmtError && <div className="submit-error">{cmtError}</div>}
            <button type="submit" className="btn-send" disabled={sending || !comment.trim()}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        </section>

        <footer className="powered">Powered by <span className="pw-mark" /> Provana Service Management</footer>
      </div>
    </div>
  );
}
