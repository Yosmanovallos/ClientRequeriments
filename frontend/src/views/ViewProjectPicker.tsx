import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import TopNav from '../components/layout/TopNav';
import Breadcrumbs from '../components/layout/Breadcrumbs';
import HeroNetwork from '../components/brand/HeroNetwork';
import Monogram from '../components/brand/Monogram';

export default function ViewProjectPicker() {
  const { user, setActiveProject, go } = useApp();
  const projects = user?.projects ?? [];
  const isAdmin  = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const roleHome = (): import('../context/AppContext').View => {
    const role = user?.role ?? '';
    if (role === 'CLIENT') return 'requests';
    if (role === 'AGENT')  return 'myrequests';
    return 'portal';
  };

  useEffect(() => {
    // Auto-select if only one project; admins with no projects skip straight to portal
    if (projects.length === 1) {
      setActiveProject(projects[0]);
      go(roleHome());
    } else if (projects.length === 0 && isAdmin) {
      go('portal');
    }
  }, []);

  const pick = (idx: number) => {
    setActiveProject(projects[idx]);
    go(roleHome());
  };

  return (
    <div className="view view-portal">
      <Breadcrumbs />
      <TopNav />

      <section className="hero">
        <div className="hero-network"><HeroNetwork /></div>
        <div className="hero-inner">
          <h1>Select a Project</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', marginTop: 8, fontSize: 15 }}>
            Choose the project you want to work in.
          </p>
        </div>
      </section>

      <main className="portal-body">
        <h2 className="section-title">Your Projects</h2>

        {projects.length === 0 ? (
          <div>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
              {isAdmin
                ? 'No projects are assigned to your account yet. You can manage projects from the Control Panel.'
                : 'You have no projects assigned yet. Contact your administrator.'}
            </p>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn-send" style={{ height: 40, padding: '0 20px' }}
                  onClick={() => go('admin')}>
                  Go to Control Panel
                </button>
                <button className="btn-cancel" onClick={() => go('portal')}>
                  Go to Portal
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="portals-grid">
              {projects.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className="portal-card is-live"
                  onClick={() => pick(i)}
                >
                  <div className="portal-icon"><Monogram /></div>
                  <div className="portal-text">
                    <h3>{p.name}</h3>
                    <p style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11 }}>
                      {p.slug}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            {isAdmin && (
              <div style={{ marginTop: 28 }}>
                <button className="btn-cancel" style={{ fontSize: 13 }} onClick={() => go('admin')}>
                  Skip — go to Control Panel →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
