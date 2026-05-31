import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { auth } from '../auth';
import ProvanaLogo from '../components/brand/ProvanaLogo';

function Card({ title, sub, error, children }: { title: string; sub?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
          <ProvanaLogo height={34} />
        </div>
        <h2 style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, color: 'var(--purple)', margin: '16px 0 4px' }}>
          {title}
        </h2>
        {sub && <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', margin: '0 0 18px' }}>{sub}</p>}
        {!sub && <div style={{ marginBottom: 18 }} />}
        {error && <div className="login-error">{error}</div>}
        {children}
      </div>
    </div>
  );
}

type AuthMode = 'login' | 'register' | 'registered' | 'forgot' | 'forgot-sent' | 'reset' | 'reset-done';

function validateEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function validatePassword(v: string): string | null {
  if (v.length < 8)       return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(v))  return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(v))  return 'Password must contain at least one number';
  return null;
}

export default function ViewLogin() {
  const { go, setUser } = useApp();

  const [mode,        setMode]        = useState<AuthMode>('login');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [displayName, setDisplayName] = useState('');
  const [resetToken,  setResetToken]  = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  // Detect ?reset_token= in URL → jump to reset form
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('reset_token');
    if (token) {
      setResetToken(token);
      setMode('reset');
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
  }, []);

  const resetForm = () => { setEmail(''); setPassword(''); setConfirm(''); setDisplayName(''); setError(''); };
  const switchTo  = (m: AuthMode) => { resetForm(); setMode(m); };

  // ── Login ──────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) { setError('Enter a valid email address'); return; }
    if (!password)             { setError('Password is required'); return; }
    setLoading(true); setError('');
    const { session, error: err } = await auth.signIn(email, password);
    setLoading(false);
    if (err) { setError(err); return; }
    if (session) { setUser(session); go('portal'); }
  };

  // ── Register ───────────────────────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim())   { setError('Full name is required'); return; }
    if (!validateEmail(email)) { setError('Enter a valid email address'); return; }
    const pwErr = validatePassword(password);
    if (pwErr)                 { setError(pwErr); return; }
    setLoading(true); setError('');
    const { error: err } = await auth.register(email, password, displayName.trim());
    setLoading(false);
    if (err) { setError(err); return; }
    setMode('registered');
  };

  // ── Forgot password ────────────────────────────────────────────────────────
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) { setError('Enter a valid email address'); return; }
    setLoading(true); setError('');
    const { error: err } = await auth.forgotPassword(email);
    setLoading(false);
    if (err) { setError(err); return; }
    setMode('forgot-sent');
  };

  // ── Reset password ─────────────────────────────────────────────────────────
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const pwErr = validatePassword(password);
    if (pwErr)                { setError(pwErr); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    const { error: err } = await auth.resetPassword(resetToken, password);
    setLoading(false);
    if (err) { setError(err); return; }
    setMode('reset-done');
  };

  // ── registered ────────────────────────────────────────────────────────────
  if (mode === 'registered') return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <ProvanaLogo height={34} />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--purple)', margin: '18px 0 10px' }}>Request received</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
          Your account is pending admin approval.<br />
          You'll be able to sign in once a Provana administrator activates it.
        </p>
        <button className="btn-send" style={{ width: '100%', height: 42 }} onClick={() => switchTo('login')}>
          Back to sign in
        </button>
      </div>
    </div>
  );

  // ── forgot-sent ───────────────────────────────────────────────────────────
  if (mode === 'forgot-sent') return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <ProvanaLogo height={34} />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--purple)', margin: '18px 0 10px' }}>Check your inbox</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
          If <strong>{email}</strong> is registered we've sent a reset link. It expires in 1 hour.
        </p>
        <button className="btn-send" style={{ width: '100%', height: 42 }} onClick={() => switchTo('login')}>
          Back to sign in
        </button>
      </div>
    </div>
  );

  // ── reset-done ────────────────────────────────────────────────────────────
  if (mode === 'reset-done') return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <ProvanaLogo height={34} />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--purple)', margin: '18px 0 10px' }}>Password updated</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
          Your password has been changed. You can now sign in with your new password.
        </p>
        <button className="btn-send" style={{ width: '100%', height: 42 }} onClick={() => switchTo('login')}>
          Sign in
        </button>
      </div>
    </div>
  );

  // ── register ──────────────────────────────────────────────────────────────
  if (mode === 'register' && auth.isLocal) return (
    <Card title="Create account" error={error}>
      <form onSubmit={handleRegister} noValidate>
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
          <input className="txt" type="password" autoComplete="new-password"
            placeholder="Min. 8 chars, 1 uppercase, 1 number"
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
        <button type="button" onClick={() => switchTo('login')}
          style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: 12.5, padding: 0 }}>
          Sign in
        </button>
      </p>
    </Card>
  );

  // ── forgot ────────────────────────────────────────────────────────────────
  if (mode === 'forgot') return (
    <Card title="Reset password" sub="Enter your email and we'll send a reset link." error={error}>
      <form onSubmit={handleForgot} noValidate>
        <div className="field">
          <label className="field-label">Email <span className="req-star">*</span></label>
          <input className="txt" type="email" autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <button type="submit" className="btn-send"
          style={{ width: '100%', height: 44, borderRadius: 6, fontSize: 15, marginTop: 4 }}
          disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--muted)', marginTop: 16 }}>
        <button type="button" onClick={() => switchTo('login')}
          style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: 12.5, padding: 0 }}>
          Back to sign in
        </button>
      </p>
    </Card>
  );

  // ── reset (arrived via email link) ────────────────────────────────────────
  if (mode === 'reset') return (
    <Card title="Set new password" sub="Choose a strong password for your account." error={error}>
      <form onSubmit={handleReset} noValidate>
        <div className="field">
          <label className="field-label">New password <span className="req-star">*</span></label>
          <input className="txt" type="password" autoComplete="new-password"
            placeholder="Min. 8 chars, 1 uppercase, 1 number"
            value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <div className="field">
          <label className="field-label">Confirm password <span className="req-star">*</span></label>
          <input className="txt" type="password" autoComplete="new-password"
            value={confirm} onChange={e => setConfirm(e.target.value)} required />
        </div>
        <button type="submit" className="btn-send"
          style={{ width: '100%', height: 44, borderRadius: 6, fontSize: 15, marginTop: 4 }}
          disabled={loading}>
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </Card>
  );

  // ── login (default) ───────────────────────────────────────────────────────
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
        <form onSubmit={handleLogin} noValidate>
          <div className="field">
            <label className="field-label">Email <span className="req-star">*</span></label>
            <input className="txt" type="email" autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="field" style={{ marginBottom: 6 }}>
            <label className="field-label">Password <span className="req-star">*</span></label>
            <input className="txt" type="password" autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {auth.isLocal && (
            <div style={{ textAlign: 'right', marginBottom: 14 }}>
              <button type="button" onClick={() => switchTo('forgot')}
                style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: 12.5, padding: 0 }}>
                Forgot password?
              </button>
            </div>
          )}
          <button type="submit" className="btn-send"
            style={{ width: '100%', height: 44, borderRadius: 6, fontSize: 15 }}
            disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {auth.isLocal ? (
          <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--muted)', marginTop: 16 }}>
            Don't have an account?{' '}
            <button type="button" onClick={() => switchTo('register')}
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
