import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { projectsApi, type AdminProject } from '../../api/admin';
import { formTemplatesApi, type FormTemplate, type ProjectFormConfigEntry } from '../../api/formTemplates';
import { api } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { CPSection } from './ViewControlPanel';

interface Props {
  projectId?: string;
  onNavigate: (s: CPSection, projectId?: string, editTemplate?: FormTemplate) => void;
}

export default function ViewCPForms({ projectId: initialProjectId, onNavigate }: Props) {
  const { user } = useApp();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [projects,       setProjects]       = useState<AdminProject[]>([]);
  const [projConfigs,    setProjConfigs]    = useState<ProjectFormConfigEntry[]>([]);
  const [allTemplates,   setAllTemplates]   = useState<FormTemplate[]>([]);
  const [selectedProjId, setSelectedProjId] = useState<string>(initialProjectId ?? '');
  const [enabledIds,     setEnabledIds]     = useState<Set<string>>(new Set());
  const [loading,        setLoading]        = useState(true);
  const [loadingForms,   setLoadingForms]   = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [saveMsg,        setSaveMsg]        = useState('');
  const [error,          setError]          = useState<string | null>(null);
  const [deletingId,     setDeletingId]     = useState<string | null>(null);
  const [publishingId,   setPublishingId]   = useState<string | null>(null);

  // Load projects once
  useEffect(() => {
    projectsApi.list()
      .then(p => setProjects(p.data?.data ?? []))
      .catch(() => setError('Failed to load projects.'))
      .finally(() => setLoading(false));
  }, []);

  // Load all templates once so we can show unconnected templates
  useEffect(() => {
    formTemplatesApi.listAll().then(({ data }) => setAllTemplates(data?.data ?? []));
  }, []);

  // Load project configs whenever the selected project changes
  useEffect(() => {
    if (!selectedProjId) { setProjConfigs([]); setEnabledIds(new Set()); return; }
    setLoadingForms(true);
    formTemplatesApi.listProjectConfigs(selectedProjId)
      .then(({ data }) => {
        const configs = data?.data ?? [];
        setProjConfigs(configs);
        setEnabledIds(new Set(configs.filter(c => c.isEnabled).map(c => c.templateId)));
      })
      .finally(() => setLoadingForms(false));
  }, [selectedProjId]);

  // Display exactly what this project has configured — nothing more, nothing less
  const displayTemplates: FormTemplate[] = projConfigs.map(c => c.template);

  // Templates that exist but aren't yet connected to this project
  const connectedIds = new Set(projConfigs.map(c => c.templateId));
  const availableTemplates = allTemplates.filter(t => !connectedIds.has(t.id));

  const toggleTemplate = (id: string) =>
    setEnabledIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const addTemplate = (t: FormTemplate) => {
    setProjConfigs(prev => [
      ...prev,
      { id: '', projectId: selectedProjId, templateId: t.id, isEnabled: true, sortOrder: prev.length, template: t },
    ]);
    setEnabledIds(prev => new Set([...prev, t.id]));
  };

  const addAllStandardTemplates = () => {
    const toAdd = availableTemplates.filter(t => t.isStandard);
    if (toAdd.length === 0) return;
    setProjConfigs(prev => {
      const next = [...prev];
      toAdd.forEach((t, i) => next.push({ id: '', projectId: selectedProjId, templateId: t.id, isEnabled: true, sortOrder: prev.length + i, template: t }));
      return next;
    });
    setEnabledIds(prev => new Set([...prev, ...toAdd.map(t => t.id)]));
  };

  const handleSave = async () => {
    if (!selectedProjId) return;
    setSaving(true);
    setSaveMsg('');
    const configs = displayTemplates.map((t, i) => ({
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

  const refreshConfigs = async () => {
    const { data } = await formTemplatesApi.listProjectConfigs(selectedProjId);
    const configs = data?.data ?? [];
    setProjConfigs(configs);
    setEnabledIds(new Set(configs.filter(c => c.isEnabled).map(c => c.templateId)));
  };

  const handleTogglePublish = async (t: FormTemplate) => {
    setPublishingId(t.id);
    const newStatus = t.status === 'published' ? 'draft' : 'published';
    try {
      const { error: err } = await formTemplatesApi.update(t.id, { status: newStatus });
      if (err) { setSaveMsg('Error: ' + err.message); return; }
      setAllTemplates(prev => prev.map(x => x.id === t.id ? { ...x, status: newStatus } : x));
      setProjConfigs(prev => prev.map(c => c.templateId === t.id ? { ...c, template: { ...c.template, status: newStatus } } : c));
    } finally {
      setPublishingId(null);
    }
  };

  const handleDelete = async (t: FormTemplate) => {
    if (!window.confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    setDeletingId(t.id);
    try {
      const { error: err } = await formTemplatesApi.removeFromProject(selectedProjId, t.id);
      if (err) { setSaveMsg('Error deleting: ' + err.message); return; }
      await refreshConfigs();
    } catch (e) {
      setSaveMsg('Error deleting: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error)   return <p style={{ color: 'var(--ink-2)' }}>{error}</p>;

  const assignedIds     = user?.projectIds ?? [];
  const visibleProjects = isSuperAdmin
    ? projects
    : projects.filter(p => assignedIds.includes(p.id));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 className="account-title" style={{ margin: 0 }}>Forms</h2>
        <button
          className="btn-send"
          style={{ height: 36, padding: '0 16px', fontSize: 13 }}
          onClick={() => onNavigate('form-builder', selectedProjId || undefined)}
          disabled={!selectedProjId}
          title={selectedProjId ? undefined : 'Select a project first'}
        >
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
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'center' }}>Enabled</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayTemplates.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '28px 0' }}>
                        No templates yet. Click &quot;+ New Template&quot; to create one.
                      </td>
                    </tr>
                  )}
                  {displayTemplates.map(t => (
                    <tr key={t.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                        {t.description && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.description}</div>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{t.slug}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {t.isStandard ? 'Standard' : 'Custom'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleTogglePublish(t)}
                          disabled={publishingId === t.id}
                          style={{
                            fontSize: 11, padding: '2px 10px', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600,
                            background: t.status === 'published' ? '#d4edda' : '#fff3cd',
                            color: t.status === 'published' ? '#155724' : '#856404',
                          }}
                        >
                          {publishingId === t.id ? '…' : t.status === 'published' ? 'Published' : 'Draft'}
                        </button>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={enabledIds.has(t.id)}
                          onChange={() => toggleTemplate(t.id)} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="topnav-action"
                            style={{ fontSize: 12, padding: '2px 10px' }}
                            onClick={() => onNavigate('form-builder', selectedProjId, t)}
                          >
                            Edit
                          </button>
                          <button
                            style={{ fontSize: 12, padding: '2px 10px', border: 'none', borderRadius: 4, background: '#ffeaea', color: '#a30000', cursor: 'pointer', fontWeight: 600 }}
                            disabled={deletingId === t.id}
                            onClick={() => handleDelete(t)}
                          >
                            {deletingId === t.id ? '…' : 'Delete'}
                          </button>
                        </div>
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

          {availableTemplates.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink-2)' }}>
                  Available templates ({availableTemplates.length})
                </h3>
                {availableTemplates.some(t => t.isStandard) && (
                  <button
                    className="topnav-action"
                    style={{ fontSize: 12, padding: '4px 12px' }}
                    onClick={addAllStandardTemplates}
                  >
                    + Add all standard templates
                  </button>
                )}
              </div>
              <div className="users-table-wrap">
                <table className="cp-table">
                  <thead>
                    <tr>
                      <th>Template</th>
                      <th>Slug</th>
                      <th>Type</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableTemplates.map(t => (
                      <tr key={t.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                          {t.description && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.description}</div>}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{t.slug}</td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{t.isStandard ? 'Standard' : 'Custom'}</td>
                        <td>
                          <button
                            className="topnav-action"
                            style={{ fontSize: 12, padding: '2px 10px' }}
                            onClick={() => addTemplate(t)}
                          >
                            + Add
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
