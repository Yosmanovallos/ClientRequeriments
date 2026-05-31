import React from 'react';
import { useApp } from '../context/AppContext';
import TopNav from '../components/layout/TopNav';
import PortalBanner from '../components/layout/PortalBanner';
import FormCrumbs from '../components/layout/FormCrumbs';
import { BigAvatar } from '../components/brand/Avatar';

export default function ViewProfile() {
  const { user } = useApp();
  const initials = (user?.displayName ?? user?.email ?? 'YO')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '').join('') || 'U';

  return (
    <div className="view view-profile">
      <TopNav />
      <PortalBanner />
      <div className="accountcol">
        <FormCrumbs trail={[{ label: 'Provana Customer Portal', to: 'portal' }]} />
        <h1 className="account-title">Profile</h1>
        <div className="profile-grid">
          <div className="profile-left">
            <BigAvatar initials={initials} />
          </div>
          <div className="profile-right">
            <section className="acc-section">
              <h2>Personal details</h2>
              <div className="acc-row">
                <span className="acc-label">Name</span>
                <span className="acc-val">{user?.displayName ?? '—'}</span>
              </div>
              <div className="acc-row">
                <span className="acc-label">Email</span>
                <span className="acc-val">{user?.email ?? '—'}</span>
              </div>
              <a className="acc-link">Manage your account</a>
            </section>
            <section className="acc-section">
              <h2>Language and time zone</h2>
              <div className="acc-row">
                <span className="acc-label">Language</span>
                <span className="acc-val">English (United States)</span>
              </div>
              <div className="acc-row">
                <span className="acc-label">Time zone</span>
                <span className="acc-val">(GMT-05:00) Chicago</span>
              </div>
              <a className="acc-link">Edit account preferences</a>
            </section>
          </div>
        </div>
        <footer className="powered">Powered by <span className="pw-mark" /> Provana Service Management</footer>
      </div>
    </div>
  );
}
