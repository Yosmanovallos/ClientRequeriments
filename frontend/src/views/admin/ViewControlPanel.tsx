import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import TopNav from '../../components/layout/TopNav';

export type CPSection = 'overview' | 'users' | 'projects' | 'forms' | 'form-builder' | 'project-members';

// Lazy-loaded at module level so React doesn't remount on every render
const ViewCPOverview       = React.lazy(() => import('./ViewCPOverview'));
const ViewCPUsers          = React.lazy(() => import('./ViewCPUsers'));
const ViewCPProjects       = React.lazy(() => import('./ViewCPProjects'));
const ViewCPProjectMembers = React.lazy(() => import('./ViewCPProjectMembers'));
const ViewCPForms          = React.lazy(() => import('./ViewCPForms'));
const ViewCPFormBuilder    = React.lazy(() => import('./ViewCPFormBuilder'));

const SUPER_ADMIN_NAV: { id: CPSection; label: string }[] = [
  { id: 'overview',  label: 'Overview' },
  { id: 'users',     label: 'Users' },
  { id: 'projects',  label: 'Projects' },
  { id: 'forms',     label: 'Forms' },
];

const ADMIN_NAV: { id: CPSection; label: string }[] = [
  { id: 'forms', label: 'Forms' },
];

interface Props {
  initialSection?: CPSection;
}

export default function ViewControlPanel({ initialSection }: Props) {
  const { go, user } = useApp();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdmin      = isSuperAdmin || user?.role === 'ADMIN';
  if (!isAdmin) { go('portal'); return null; }

  const defaultSection: CPSection = isSuperAdmin ? (initialSection ?? 'overview') : 'forms';
  const [section,           setSection]           = useState<CPSection>(defaultSection);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);

  const nav = isSuperAdmin ? SUPER_ADMIN_NAV : ADMIN_NAV;

  const handleNavigate = (s: CPSection, projectId?: string) => {
    if (projectId !== undefined) setSelectedProjectId(projectId);
    setSection(s);
  };

  const mainNavSection = nav.find(n => n.id === section)?.id ?? null;

  return (
    <div className="view">
      <TopNav />
      <div className="cp-layout">
        <nav className="cp-sidebar">
          <div className="cp-sidebar-header">
            <span className="cp-sidebar-title">{isSuperAdmin ? 'Control Panel' : 'Configure Forms'}</span>
            <button className="cp-back" onClick={() => go('portal')}>← Portal</button>
          </div>
          {nav.map(n => (
            <button
              key={n.id}
              className={`cp-nav-item${mainNavSection === n.id ? ' is-active' : ''}`}
              onClick={() => handleNavigate(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <main className="cp-content">
          <React.Suspense fallback={<div className="cp-loading">Loading…</div>}>
            {section === 'overview' && (
              <ViewCPOverview onNavigate={handleNavigate} />
            )}
            {section === 'users' && (
              <ViewCPUsers />
            )}
            {section === 'projects' && (
              <ViewCPProjects onNavigate={handleNavigate} />
            )}
            {section === 'project-members' && (
              <ViewCPProjectMembers
                projectId={selectedProjectId ?? ''}
                onBack={() => handleNavigate('projects')}
              />
            )}
            {section === 'forms' && (
              <ViewCPForms projectId={selectedProjectId} onNavigate={handleNavigate} />
            )}
            {section === 'form-builder' && (
              <ViewCPFormBuilder onNavigate={handleNavigate} />
            )}
          </React.Suspense>
        </main>
      </div>
    </div>
  );
}
