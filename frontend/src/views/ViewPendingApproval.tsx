import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { auth } from '../auth';
import ProvanaLogo from '../components/brand/ProvanaLogo';

export default function ViewPendingApproval() {
  const { logout, setUser } = useApp();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [message,  setMessage]  = useState('');

  const handleRefresh = async () => {
    setChecking(true);
    setMessage('');
    const session = await auth.getSession();
    setChecking(false);
    if (!session) { await logout(); navigate('/login'); return; }
    if (session.role !== null) {
      setUser(session);
      if (session.projects.length !== 1) { navigate('/pick'); return; }
      const p    = session.projects[0];
      const role = session.role;
      if (role === 'CLIENT') navigate(`/portal/${p.slug}`);
      else if (role === 'AGENT') navigate(`/portal/${p.slug}/requests`);
      else navigate('/');
    } else {
      setMessage('Still pending — check back later.');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
          <ProvanaLogo height={34} />
        </div>

        <div style={{ fontSize: 40, margin: '20px 0 12px' }}>⏳</div>

        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--purple)', margin: '0 0 10px' }}>
          Account pending approval
        </h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 24px' }}>
          An administrator will assign your role and projects shortly.<br />
          You will receive access once your account is reviewed.
        </p>

        {message && (
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>{message}</p>
        )}

        <button className="btn-send" onClick={handleRefresh} disabled={checking}
          style={{ width: '100%', height: 44, borderRadius: 6, fontSize: 15, marginBottom: 12 }}>
          {checking ? 'Checking…' : 'Check again'}
        </button>

        <button onClick={async () => { await logout(); navigate('/login'); }}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
    </div>
  );
}
