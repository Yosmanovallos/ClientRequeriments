import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formTemplatesApi, type FormTemplate } from '../api/formTemplates';
import LoadingSpinner from '../components/LoadingSpinner';
import TopNav from '../components/layout/TopNav';
import PortalBanner from '../components/layout/PortalBanner';
import FormCrumbs from '../components/layout/FormCrumbs';
import Monogram from '../components/brand/Monogram';

export default function ViewFormsList() {
  const { go, activeProject, setSelectedTemplate } = useApp();
  const [forms,   setForms]   = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeProject) return;
    formTemplatesApi.listByProject(activeProject.id).then(({ data }) => {
      setForms(data?.data ?? []);
      setLoading(false);
    });
  }, [activeProject?.id]);

  const handleSelect = (template: FormTemplate) => {
    setSelectedTemplate(template);
    go('dynamic-form');
  };

  return (
    <div className="view view-requests">
      <TopNav />
      <PortalBanner />
      <div className="reqcol">
        <FormCrumbs trail={[
          { label: 'Provana Customer Portal', to: 'portal' },
          { label: activeProject?.name ?? 'Project' },
        ]} />

        <div className="req-head">
          <Monogram size={40} />
          <h1>{activeProject?.name ?? 'Project'}</h1>
        </div>
        <p className="req-sub">Welcome! Select a request type below to get started.</p>
        <p className="whats">What can we help you with?</p>

        {loading ? (
          <LoadingSpinner label="Loading forms…" />
        ) : forms.length === 0 ? (
          <p style={{ color: '#666', marginTop: 16 }}>No forms are enabled for this project.</p>
        ) : (
          <ul className="reqlist">
            {forms.map(f => (
              <li key={f.id}>
                <button type="button" className="reqitem is-live" onClick={() => handleSelect(f)}>
                  <span className="reqitem-text">
                    <strong>{f.name}</strong>
                    {f.description && <span>{f.description}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <footer className="powered">Powered by <span className="pw-mark" /> Provana Service Management</footer>
      </div>
    </div>
  );
}
