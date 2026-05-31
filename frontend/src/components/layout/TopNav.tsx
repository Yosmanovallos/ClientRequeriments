import React, { useState, useRef, useEffect } from 'react';
import { useApp, type View } from '../../context/AppContext';
import ProvanaLogo from '../brand/ProvanaLogo';
import Avatar from '../brand/Avatar';
import { IconSearch } from '../Icons';

export default function TopNav() {
  const { go, user, logout } = useApp();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdmin      = user?.role === 'ADMIN' || isSuperAdmin;
  const isAgent      = user?.role === 'AGENT';
  const isClient     = user?.role === 'CLIENT';

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const nav = (v: View) => { setOpen(false); go(v); };

  const initials = (user?.displayName ?? user?.email ?? 'YO')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '').join('') || 'U';

  return (
    <header className="topnav">
      <button className="logo-btn" onClick={() => go('portal')} title="Provana Customer Portal">
        <ProvanaLogo height={30} />
      </button>

      <div style={{ flex: 1 }} />

      {/* Primary actions — all roles can create requests */}
      <button className="topnav-action" onClick={() => go('requests')}>+ Create Request</button>

      {/* CLIENT sees their own requests; AGENT/ADMIN see all project requests */}
      {isClient && (
        <button className="topnav-action" onClick={() => go('myrequests')}>My Requests</button>
      )}
      {(isAgent || isAdmin) && (
        <button className="topnav-action" onClick={() => go('myrequests')}>All Project Requests</button>
      )}

      <button className="nav-search-btn" title="Search"><IconSearch size={20} /></button>

      <div className="avatar-wrap" ref={wrapRef}>
        <button className="avatar-btn" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <Avatar initials={initials} title={user?.displayName ?? 'Account'} />
        </button>
        {open && (
          <div className="profile-menu" role="menu">
            <div className="pm-head">
              <Avatar size={40} initials={initials} />
              <div className="pm-id">
                <strong>{user?.displayName ?? 'Demo User'}</strong>
                <span>{user?.email ?? 'demo@provana.com'}</span>
                {user?.role && (
                  <span style={{ fontSize: 11, color: 'var(--purple)', fontWeight: 600, marginTop: 2 }}>
                    {user.role.replace('_', ' ')}
                  </span>
                )}
              </div>
            </div>
            <div className="pm-div" />
            {isClient && (
              <button className="pm-item" onClick={() => nav('myrequests')}>My Requests</button>
            )}
            {(isAgent || isAdmin) && (
              <button className="pm-item" onClick={() => nav('myrequests')}>All Project Requests</button>
            )}
            <button className="pm-item" onClick={() => nav('profile')}>My Profile</button>
            {isAdmin && (
              <button className="pm-item" onClick={() => nav('admin')}>
                {isSuperAdmin ? '⚙ Control Panel' : '⚙ Configure Forms'}
              </button>
            )}
            <button className="pm-item" onClick={() => nav('portal')}>Home</button>
            <div className="pm-div" />
            <button className="pm-item" onClick={async () => { setOpen(false); await logout(); }}>Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}
