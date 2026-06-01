import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { auth } from '../auth';
import ProvanaLogo from '../components/brand/ProvanaLogo';

export default function ViewDeactivated() {
  const { logout, setUser, go } = useApp();
  const [checking, setChecking] = useState(false);
  const [message,  setMessage]  = useState('');

  const handleRefresh = async () => {
    setChecking(true);
    setMessage('');
    const session = await auth.getSession();
    setChecking(false);
    if (!session) { await logout(); return; }
    if (session.isActive) {
      setUser(session);
      if (session.role === null) { go('pending'); return; }
      if (session.projects.length !== 1) { go('project-picker'); return; }
      const role = session.role;
      go(role === 'CLIENT' ? 'requests' : role === 'AGENT' ? 'myrequests' : 'portal');
    } else {
      setMessage('Account is still deactivated.');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
          <ProvanaLogo height={34} />
        </div>
        <div style={{ fontSize: 40, margin: '20px 0 12px' }}>🚫</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--purple)', margin: '0 0 10px' }}>
          Account deactivated
        </h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 24px' }}>
          Your account has been deactivated by an administrator.<br />
          Please contact support if you believe this is a mistake.
        </p>
        {message && <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>{message}</p>}
        <button
          className="btn-send"
          onClick={handleRefresh}
          disabled={checking}
          style={{ width: '100%', height: 44, borderRadius: 6, fontSize: 15, marginBottom: 12 }}
        >
          {checking ? 'Checking…' : 'Check again'}
        </button>
        <button
          onClick={logout}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
