import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useMatch } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import ProvanaLogo from '../brand/ProvanaLogo';
import Avatar from '../brand/Avatar';
import { IconSearch } from '../Icons';

export default function TopNav() {
  const { user, logout } = useApp();
  const navigate = useNavigate();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdmin      = user?.role === 'ADMIN' || isSuperAdmin;
  const isAgent      = user?.role === 'AGENT';
  const isClient     = user?.role === 'CLIENT';

  // Detect the current project slug if we're inside a /portal/:slug/* route
  const portalMatch = useMatch('/portal/:slug/*');
  const currentSlug = portalMatch?.params.slug;

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const nav = (path: string) => { setOpen(false); navigate(path); };

  // Always goes to the global requests list — backend scopes results by role.
  // Project-scoped request lists are accessed by navigating into a project, not via TopNav.
  const requestsPath = () => '/requests';

  const initials = (user?.displayName ?? user?.email ?? 'YO')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '').join('') || 'U';

  return (
    <header className="topnav">
      <button className="logo-btn" onClick={() => navigate('/')} title="Provana Customer Portal">
        <ProvanaLogo height={30} />
      </button>

      <div style={{ flex: 1 }} />

      {isClient && (
        <button className="topnav-action" onClick={() => navigate(requestsPath())}>My Requests</button>
      )}
      {(isAgent || isAdmin) && (
        <button className="topnav-action" onClick={() => navigate(requestsPath())}>All Project Requests</button>
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
              <button className="pm-item" onClick={() => nav(requestsPath())}>My Requests</button>
            )}
            {(isAgent || isAdmin) && (
              <button className="pm-item" onClick={() => nav(requestsPath())}>All Project Requests</button>
            )}
            <button className="pm-item" onClick={() => nav('/profile')}>My Profile</button>
            {isAdmin && (
              <button className="pm-item" onClick={() => nav('/admin')}>
                {isSuperAdmin ? '⚙ Control Panel' : '⚙ Configure Forms'}
              </button>
            )}
            <button className="pm-item" onClick={() => nav('/')}>Home</button>
            <div className="pm-div" />
            <button className="pm-item" onClick={async () => { setOpen(false); await logout(); navigate('/login'); }}>Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}
