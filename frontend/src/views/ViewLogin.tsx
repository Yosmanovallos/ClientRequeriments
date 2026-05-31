import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { auth } from '../auth';
import ProvanaLogo from '../components/brand/ProvanaLogo';

type AuthMode = 'login' | 'register' | 'registered';

export default function ViewLogin() {
  const { go, setUser } = useApp();
  const [mode,        setMode]        = useState<AuthMode>('login');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const routeByRole = (_role: string | null) => go('portal');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    const { session, error: err } = await auth.signIn(email, password);
    setLoading(false);
    if (err) { setError(err); return; }
    if (session) { setUser(session); routeByRole(session.role); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true); setError('');
    const { error: err } = await auth.register(email, password, displayName);
    setLoading(false);
    if (err) { setError(err); return; }
    setMode('registered');
  };

  // ── Post-registration confirmation ─────────────────────────────────────────
  if (mode === 'registered') {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <ProvanaLogo height={34} />
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--purple)', margin: '18px 0 10px' }}>
            Request received
          </h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
            Your account is pending admin approval.<br />
            You'll be able to sign in once a Provana administrator activates it.
          </p>
          <button className="btn-send" style={{ width: '100%', height: 42 }}
            onClick={() => { setMode('login'); setEmail(''); setPassword(''); setDisplayName(''); }}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // ── Register form ──────────────────────────────────────────────────────────
  if (mode === 'register' && auth.isLocal) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            <ProvanaLogo height={34} />
          </div>
          <h2 style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, color: 'var(--purple)', margin: '16px 0 20px' }}>
            Create account
          </h2>

          {error && <div className="login-error">{error}</div>}

          <form onSubmit={handleRegister}>
            <div className="field">
              <label className="field-label">Full name <span className="req-star">*</span></label>
              <input className="txt" type="text" autoComplete="name"
                value={displayName} onChange={e => setDisplayName(e.target.value)} required />
            </div>
            <div className="field">
              <label className="field-label">Email <span className="req-star">*</span></label>
              <input className="txt" type="email" autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label className="field-label">Password <span className="req-star">*</span></label>
              <input className="txt" type="password" autoComplete="new-password" minLength={8}
                placeholder="Min. 8 characters"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn-send"
              style={{ width: '100%', height: 44, borderRadius: 6, fontSize: 15, marginTop: 4 }}
              disabled={loading}>
              {loading ? 'Submitting…' : 'Request access'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--muted)', marginTop: 16 }}>
            Already have an account?{' '}
            <button type="button" onClick={() => { setMode('login'); setError(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: 12.5, padding: 0 }}>
              Sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── Login form (local or Supabase) ─────────────────────────────────────────
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

        <form onSubmit={handleLogin}>
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
          <button type="submit" className="btn-send"
            style={{ width: '100%', height: 44, borderRadius: 6, fontSize: 15, marginTop: 4 }}
            disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {auth.isLocal ? (
          <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--muted)', marginTop: 16 }}>
            Don't have an account?{' '}
            <button type="button" onClick={() => { setMode('register'); setError(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: 12.5, padding: 0 }}>
              Request access
            </button>
          </p>
        ) : (
          <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--muted)', marginTop: 20 }}>
            Access is invite-only. Contact your Provana administrator.
          </p>
        )}

        {auth.isLocal && (
          <div style={{ marginTop: 20, padding: '12px 14px', background: '#f7f4ff', borderRadius: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--purple)' }}>Demo accounts</strong><br />
            super@provana.com · admin@blg.com · agent@blg.com<br />
            client@blg.com · pending@blg.com<br />
            <span style={{ opacity: .7 }}>Password: Demo1234!</span>
          </div>
        )}
      </div>
    </div>
  );
}
