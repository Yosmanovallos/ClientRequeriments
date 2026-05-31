// View: Request Detail — status, history, comments, Realtime updates
function ViewRequestDetail({ go, requestId }) {
  const [req,      setReq]      = React.useState(null);
  const [history,  setHistory]  = React.useState([]);
  const [comments, setComments] = React.useState([]);
  const [loading,  setLoading]  = React.useState(true);
  const [comment,  setComment]  = React.useState('');
  const [sending,  setSending]  = React.useState(false);
  const [cmtError, setCmtError] = React.useState('');

  React.useEffect(() => {
    if (!requestId) { setLoading(false); return; }
    let channel;
    (async () => {
      const [{ data: r }, { data: h }, { data: c }] = await Promise.all([
        db.getDetail(requestId),
        db.getHistory(requestId),
        db.getComments(requestId),
      ]);
      setReq(r); setHistory(h || []); setComments(c || []);
      setLoading(false);
      if (r) {
        channel = realtime.subscribeToRequest(
          requestId,
          p => setReq(prev => prev ? { ...prev, status: p.new.status, updated_at: p.new.updated_at } : prev),
          p => { if (p.new.visibility === 'public') setComments(prev => [...prev, p.new]); }
        );
      }
    })();
    return () => realtime.unsubscribe(channel);
  }, [requestId]);

  const handleComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSending(true); setCmtError('');
    const { error } = await db.addComment(requestId, comment);
    setSending(false);
    if (error) setCmtError(error.message);
    else setComment('');
  };

  const crumbs = [
    { label: 'Provana Customer Portal', to: 'portal' },
    { label: 'BLG - Power BI Requests', to: 'requests' },
    { label: req ? req.reference : '…' },
  ];

  if (loading) return (
    <div className="view"><TopNav go={go} /><PortalBanner />
      <div className="detailcol" style={{ paddingTop: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
    </div>
  );

  if (!req) return (
    <div className="view"><TopNav go={go} /><PortalBanner />
      <div className="detailcol">
        <FormCrumbs go={go} trail={crumbs} />
        <p style={{ color: 'var(--muted)', marginTop: 24 }}>Request not found or access denied.</p>
      </div>
    </div>
  );

  return (
    <div className="view view-detail">
      <TopNav go={go} />
      <PortalBanner />
      <div className="detailcol">
        <FormCrumbs go={go} trail={crumbs} />

        <div style={{ marginBottom: 28 }}>
          <h1 className="account-title" style={{ marginBottom: 6 }}>{req.reference}</h1>
          <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', margin: '0 0 14px' }}>{req.title}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusBadge status={req.status} />
            <Priority level={req.priority} />
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Submitted {fmtDate(req.created_at)}</span>
            {req.ado_work_item_id && (
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>· ADO #{req.ado_work_item_id}</span>
            )}
          </div>
        </div>

        <section className="detail-section">
          <h2 className="detail-section-title">Status History</h2>
          {history.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 14 }}>No history recorded yet.</p>
            : <ol className="timeline">
                {history.map((h, i) => (
                  <li key={i} className="timeline-item">
                    <span className="tl-dot" />
                    <div className="tl-body">
                      <strong>{h.to_status}</strong>
                      {h.from_status && <span className="tl-from"> ← {h.from_status}</span>}
                      <div className="tl-meta">
                        {fmtDate(h.changed_at)} · {h.source}{h.actor ? ' · ' + h.actor : ''}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
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
                      <strong>{c.author || 'Provana Team'}</strong>
                      {c.source === 'ADO' && (
                        <span className="badge badge-blue" style={{ fontSize: 10, marginLeft: 6 }}>BI Team</span>
                      )}
                      <span className="comment-date">{fmtDate(c.created_at)}</span>
                    </div>
                    <div className="comment-body" dangerouslySetInnerHTML={{ __html: c.body }} />
                  </div>
                ))}
              </div>
          }
          <form onSubmit={handleComment} style={{ marginTop: 20 }}>
            <div className="field">
              <label className="field-label">Add a comment</label>
              <textarea className="txt txt-area" value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder={window.supabaseClient ? 'Write a comment…' : 'Connect Supabase to enable comments'}
                disabled={!window.supabaseClient}
                style={{ minHeight: 88 }} />
            </div>
            {cmtError && <div className="submit-error">{cmtError}</div>}
            <button type="submit" className="btn-send"
              disabled={sending || !comment.trim() || !window.supabaseClient}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        </section>

        <footer className="powered">Powered by <span className="pw-mark" /> Provana Service Management</footer>
      </div>
    </div>
  );
}

Object.assign(window, { ViewRequestDetail });
