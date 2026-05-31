import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { projectsApi, type AdminProject } from '../../api/admin';
import { formTemplatesApi, type FormTemplate } from '../../api/formTemplates';
import { api } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { CPSection } from './ViewControlPanel';

interface Props {
  projectId?: string;
  onNavigate: (s: CPSection, projectId?: string) => void;
}

export default function ViewCPForms({ projectId: initialProjectId, onNavigate }: Props) {
  const { user } = useApp();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [projects,       setProjects]       = useState<AdminProject[]>([]);
  const [allTemplates,   setAllTemplates]   = useState<FormTemplate[]>([]);
  const [selectedProjId, setSelectedProjId] = useState<string>(initialProjectId ?? '');
  const [enabledIds,     setEnabledIds]     = useState<Set<string>>(new Set());
  const [loading,        setLoading]        = useState(true);
  const [loadingForms,   setLoadingForms]   = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [saveMsg,        setSaveMsg]        = useState('');
  const [error,          setError]          = useState<string | null>(null);

  useEffect(() => {
    Promise.all([projectsApi.list(), formTemplatesApi.listAll()])
      .then(([p, t]) => {
        setProjects(p.data?.data ?? []);
        setAllTemplates(t.data?.data ?? []);
      })
      .catch(() => setError('Failed to load data.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedProjId) { setEnabledIds(new Set()); return; }
    setLoadingForms(true);
    formTemplatesApi.listByProject(selectedProjId)
      .then(({ data }) => setEnabledIds(new Set((data?.data ?? []).map(t => t.id))))
      .finally(() => setLoadingForms(false));
  }, [selectedProjId]);

  const toggleTemplate = (id: string) =>
    setEnabledIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleSave = async () => {
    if (!selectedProjId) return;
    setSaving(true);
    setSaveMsg('');
    const configs = allTemplates.map((t, i) => ({
      templateId: t.id,
      isEnabled:  enabledIds.has(t.id),
      sortOrder:  i,
    }));
    const { error: err } = await api.put<void>(`/projects/${selectedProjId}/forms`, { configs });
    setSaving(false);
    if (err) { setSaveMsg('Error: ' + err.message); return; }
    setSaveMsg('Saved!');
    setTimeout(() => setSaveMsg(''), 2500);
  };

  if (loading) return <LoadingSpinner />;
  if (error)   return <p style={{ color: 'var(--ink-2)' }}>{error}</p>;

  // SUPER_ADMIN sees all projects; ADMIN only sees their explicitly assigned projects
  const assignedIds    = user?.projectIds ?? [];
  const visibleProjects = isSuperAdmin
    ? projects
    : projects.filter(p => assignedIds.includes(p.id));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 className="account-title" style={{ margin: 0 }}>Forms</h2>
        <button className="btn-send" style={{ height: 36, padding: '0 16px', fontSize: 13 }}
          onClick={() => onNavigate('form-builder')}>
          + New Template
        </button>
      </div>

      <div className="field" style={{ marginBottom: 20, maxWidth: 360 }}>
        <label className="field-label">Project</label>
        <select className="txt" value={selectedProjId}
          onChange={e => setSelectedProjId(e.target.value)} style={{ height: 42 }}>
          <option value="">— select project —</option>
          {visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProjId && (
        <>
          {loadingForms ? <LoadingSpinner label="Loading forms…" /> : (
            <div className="users-table-wrap">
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Slug</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'center' }}>Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {allTemplates.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '28px 0' }}>
                        No templates available.
                      </td>
                    </tr>
                  )}
                  {allTemplates.map(t => (
                    <tr key={t.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                        {t.description && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.description}</div>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{t.slug}</td>
                      <td>
                        <span className={`badge ${t.isStandard ? 'badge-blue' : 'badge-grey'}`}>
                          {t.isStandard ? 'Standard' : 'Custom'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={enabledIds.has(t.id)}
                          onChange={() => toggleTemplate(t.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="btn-send" style={{ height: 38, padding: '0 20px' }}
              onClick={handleSave} disabled={saving || loadingForms}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {saveMsg && (
              <span style={{ fontSize: 14, color: saveMsg.startsWith('Error') ? '#a30000' : '#006644', fontWeight: 500 }}>
                {saveMsg}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
