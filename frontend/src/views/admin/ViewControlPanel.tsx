import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams, NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { formTemplatesApi, type FormTemplate } from '../../api/formTemplates';
import TopNav from '../../components/layout/TopNav';

export type CPSection = 'overview' | 'users' | 'projects' | 'forms' | 'form-builder' | 'project-members' | 'project-orgs';

// Lazy-loaded sub-panels
const ViewCPOverview       = React.lazy(() => import('./ViewCPOverview'));
const ViewCPUsers          = React.lazy(() => import('./ViewCPUsers'));
const ViewCPProjects       = React.lazy(() => import('./ViewCPProjects'));
const ViewCPProjectMembers = React.lazy(() => import('./ViewCPProjectMembers'));
const ViewCPOrganizations  = React.lazy(() => import('./ViewCPOrganizations'));
const ViewCPForms          = React.lazy(() => import('./ViewCPForms'));
const ViewCPFormBuilder    = React.lazy(() => import('./ViewCPFormBuilder'));

// Thin wrapper — reads :projectId from URL, passes to ViewCPProjectMembers
function ProjectMembersRoute({ onNavigate }: { onNavigate: (s: CPSection) => void }) {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  return (
    <ViewCPProjectMembers
      projectId={projectId}
      onBack={() => navigate('/admin/projects')}
    />
  );
}

// Thin wrapper — fetches template by :templateId, passes to ViewCPFormBuilder
function FormBuilderRoute({ onNavigate }: { onNavigate: (s: CPSection, projectId?: string) => void }) {
  const { templateId }  = useParams<{ templateId?: string }>();
  const location        = useLocation();
  const projectId       = (location.state as Record<string, string> | null)?.projectId;
  const [template, setTemplate] = useState<FormTemplate | undefined>(undefined);
  const [loading,  setLoading]  = useState(!!templateId);

  useEffect(() => {
    if (!templateId) return;
    formTemplatesApi.getById(templateId).then(({ data }) => {
      setTemplate(data ?? undefined);
      setLoading(false);
    });
  }, [templateId]);

  if (loading) return <div className="cp-loading">Loading form…</div>;

  return (
    <ViewCPFormBuilder
      projectId={projectId}
      editTemplate={template}
      onNavigate={onNavigate}
    />
  );
}

const SUPER_ADMIN_NAV = [
  { path: 'overview',       label: 'Overview' },
  { path: 'users',          label: 'Users' },
  { path: 'projects',       label: 'Projects' },
  { path: 'organizations',  label: 'Organizations' },
  { path: 'forms',          label: 'Forms' },
] as const;

const ADMIN_NAV = [
  { path: 'forms', label: 'Forms' },
] as const;

export default function ViewControlPanel() {
  const { user } = useApp();
  const navigate  = useNavigate();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdmin      = isSuperAdmin || user?.role === 'ADMIN';
  if (!isAdmin) { navigate('/', { replace: true }); return null; }

  const navItems = isSuperAdmin ? SUPER_ADMIN_NAV : ADMIN_NAV;
  const defaultSection = isSuperAdmin ? 'overview' : 'forms';

  // Translate old CPSection enum to URL navigate — keeps sub-panel onNavigate props working
  const handleNavigate = (s: CPSection, projectId?: string, editTemplate?: FormTemplate) => {
    switch (s) {
      case 'overview':        navigate('/admin/overview'); break;
      case 'users':           navigate('/admin/users'); break;
      case 'projects':        navigate('/admin/projects'); break;
      case 'project-members': navigate(`/admin/projects/${projectId}/members`); break;
      case 'project-orgs':    navigate('/admin/organizations'); break;
      case 'forms':           navigate('/admin/forms'); break;
      case 'form-builder':
        if (editTemplate) navigate(`/admin/forms/${editTemplate.id}`, { state: { projectId } });
        else navigate('/admin/forms/new', { state: { projectId } });
        break;
    }
  };

  return (
    <div className="view">
      <TopNav />
      <div className="cp-layout">

        {/* Sidebar */}
        <nav className="cp-sidebar">
          <div className="cp-sidebar-header">
            <span className="cp-sidebar-title">{isSuperAdmin ? 'Control Panel' : 'Configure Forms'}</span>
            <button className="cp-back" onClick={() => navigate('/')}>← Portal</button>
          </div>
          {navItems.map(n => (
            <NavLink
              key={n.path}
              to={`/admin/${n.path}`}
              end={false}
              className={({ isActive }) => `cp-nav-item${isActive ? ' is-active' : ''}`}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* Content — nested routes */}
        <main className="cp-content">
          <React.Suspense fallback={<div className="cp-loading">Loading…</div>}>
            <Routes>
              {/* Default redirect */}
              <Route index element={<Navigate to={defaultSection} replace />} />

              <Route path="overview" element={<ViewCPOverview onNavigate={handleNavigate} />} />
              <Route path="users"    element={<ViewCPUsers />} />
              <Route path="projects" element={<ViewCPProjects onNavigate={handleNavigate} />} />
              <Route path="projects/:projectId/members" element={<ProjectMembersRoute onNavigate={handleNavigate} />} />
              <Route path="organizations" element={<ViewCPOrganizations />} />
              <Route path="forms"    element={<ViewCPForms onNavigate={handleNavigate} />} />
              <Route path="forms/new"            element={<FormBuilderRoute onNavigate={handleNavigate} />} />
              <Route path="forms/:templateId"    element={<FormBuilderRoute onNavigate={handleNavigate} />} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to={defaultSection} replace />} />
            </Routes>
          </React.Suspense>
        </main>

      </div>
    </div>
  );
}
