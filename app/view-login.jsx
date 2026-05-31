// View: Login — email/password or demo bypass
function ViewLogin({ onLogin }) {
  const [email, setEmail]       = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading]   = React.useState(false);
  const [error, setError]       = React.useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!window.SUPABASE_CONFIGURED) {
      onLogin({ email: 'demo@provana.com', id: 'demo' });
      return;
    }
    setLoading(true); setError('');
    const { data, error: err } = await window.sbAuth.signIn(email, password);
    setLoading(false);
    if (err) setError(err.message);
    else onLogin(data.user);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
          <ProvanaLogo height={34} />
        </div>
        <h2 style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, color: 'var(--purple)', margin: '18px 0 22px' }}>
          Sign in to Help Center
        </h2>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {window.SUPABASE_CONFIGURED ? (
            <>
              <div className="field">
                <label className="field-label">Email <span className="req-star">*</span></label>
                <input className="txt" type="email" autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label className="field-label">Password <span className="req-star">*</span></label>
                <input className="txt" type="password" autoComplete="current-password"
                  value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
            </>
          ) : (
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 20px', textAlign: 'center', lineHeight: 1.6 }}>
              Running in <strong>demo mode</strong> — Supabase is not configured.<br />
              Click Sign in to explore with mock data.
            </p>
          )}

          <button type="submit" className="btn-send"
            style={{ width: '100%', height: 44, borderRadius: 6, fontSize: 15, marginTop: 4 }}
            disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--muted)', marginTop: 20 }}>
          Access is invite-only. Contact your Provana administrator.
        </p>
      </div>
    </div>
  );
}

Object.assign(window, { ViewLogin });
