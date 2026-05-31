import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { ProjectSummary } from '../auth';
import TopNav from '../components/layout/TopNav';
import Breadcrumbs from '../components/layout/Breadcrumbs';
import HeroNetwork from '../components/brand/HeroNetwork';
import Monogram from '../components/brand/Monogram';
import SupportBadge from '../components/brand/SupportBadge';

export default function ViewPortal() {
  const { go, user, setActiveProject } = useApp();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdmin      = user?.role === 'ADMIN';
  const projects     = user?.projects ?? [];

  // Returning to the portal resets project context so requests show unfiltered
  useEffect(() => { setActiveProject(null); }, []);

  const openProject = (p: ProjectSummary) => {
    setActiveProject(p);
    go('requests');
  };

  return (
    <div className="view view-portal">
      <Breadcrumbs />
      <TopNav />

      <section className="hero">
        <div className="hero-network"><HeroNetwork /></div>
        <div className="hero-inner">
          <h1>Welcome to the Help Center!</h1>
          <p style={{ color: 'rgba(255,255,255,.75)', fontSize: 15, margin: '8px 0 0' }}>
            {isSuperAdmin
              ? 'Manage users, projects and form templates from the Control Panel.'
              : isAdmin
                ? 'Configure forms and manage your assigned projects.'
                : 'Select a project below to submit or track requests.'}
          </p>
        </div>
      </section>

      <main className="portal-body">
        {/* Admin quick actions */}
        {(isSuperAdmin || isAdmin) && (
          <>
            <h2 className="section-title">Quick actions</h2>
            <div className="portals-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 36 }}>
              <button className="portal-card is-live" onClick={() => go('admin')}>
                <div className="portal-icon"><Monogram /></div>
                <div className="portal-text">
                  <h3>{isSuperAdmin ? 'Control Panel' : 'Configure Forms'}</h3>
                  <p>{isSuperAdmin ? 'Manage users, projects, and form templates.' : 'Enable or disable forms for your assigned projects.'}</p>
                </div>
              </button>
              {isSuperAdmin && (
                <button className="portal-card is-live" onClick={() => go('myrequests')}>
                  <div className="portal-icon"><Monogram /></div>
                  <div className="portal-text">
                    <h3>All Requests</h3>
                    <p>View and manage requests across all projects.</p>
                  </div>
                </button>
              )}
            </div>
          </>
        )}

        {/* Projects grid — all roles */}
        <h2 className="section-title">
          {isSuperAdmin ? 'All Projects' : 'Your Projects'}
        </h2>

        {projects.length === 0 ? (
          <div className="portals-grid">
            <div className="portal-card" style={{ cursor: 'default' }}>
              <div className="portal-icon"><SupportBadge /></div>
              <div className="portal-text">
                <h3>No projects assigned</h3>
                <p>Contact your administrator to be added to a project.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="portals-grid">
            {projects.map(p => (
              <button key={p.id} className="portal-card is-live" onClick={() => openProject(p)}>
                <div className="portal-icon"><Monogram /></div>
                <div className="portal-text">
                  <h3>{p.name}</h3>
                  <p>Submit or track requests for this project.</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
