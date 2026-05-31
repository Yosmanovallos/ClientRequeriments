import React, { useEffect, useState, useCallback } from 'react';
import { projectsApi, type AdminProject } from '../../api/admin';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { CPSection } from './ViewControlPanel';

interface Props {
  onNavigate: (s: CPSection, projectId?: string) => void;
}

interface CreateModalProps {
  onSave:  () => void;
  onClose: () => void;
}

function autoSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function CreateModal({ onSave, onClose }: CreateModalProps) {
  const [name,   setName]   = useState('');
  const [slug,   setSlug]   = useState('');
  const [desc,   setDesc]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) { setError('Name and slug are required.'); return; }
    setSaving(true);
    setError('');
    const { error: err } = await projectsApi.create({ name: name.trim(), slug: slug.trim(), description: desc.trim() || undefined });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3 className="modal-title">New Project</h3>
        <p className="modal-sub">Create a new project for this client.</p>

        {error && <div className="login-error" style={{ marginBottom: 14 }}>{error}</div>}

        <div className="field" style={{ marginBottom: 14 }}>
          <label className="field-label">Name <span className="req-star">*</span></label>
          <input className="txt" value={name}
            onChange={e => { setName(e.target.value); setSlug(autoSlug(e.target.value)); }} />
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          <label className="field-label">Slug <span className="req-star">*</span></label>
          <input className="txt" value={slug} onChange={e => setSlug(e.target.value)} placeholder="lowercase-dashes-only" />
        </div>
        <div className="field" style={{ marginBottom: 4 }}>
          <label className="field-label">Description</label>
          <textarea className="txt txt-area" value={desc} onChange={e => setDesc(e.target.value)}
            style={{ width: '100%', minHeight: 80 }} />
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-send" onClick={handleSave} disabled={saving || !name || !slug}>
            {saving ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ViewCPProjects({ onNavigate }: Props) {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    projectsApi.list().then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setProjects(data?.data ?? []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error)   return <p style={{ color: 'var(--ink-2)' }}>{error}</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 className="account-title" style={{ margin: 0 }}>Projects</h2>
        <button className="btn-send" style={{ height: 36, padding: '0 16px', fontSize: 13 }}
          onClick={() => setCreating(true)}>
          + New Project
        </button>
      </div>

      <div className="users-table-wrap">
        <table className="cp-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Members</th>
              <th>Forms</th>
              <th>Requests</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '28px 0' }}>
                  No projects yet.
                </td>
              </tr>
            )}
            {projects.map(p => (
              <tr key={p.id}>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.slug}</div>
                </td>
                <td style={{ fontSize: 13 }}>{p.memberCount}</td>
                <td style={{ fontSize: 13 }}>{p.formCount}</td>
                <td style={{ fontSize: 13 }}>{p.requestCount}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="topnav-action" style={{ fontSize: 12, padding: '4px 10px', marginRight: 6 }}
                    onClick={() => onNavigate('project-members', p.id)}>
                    Members
                  </button>
                  <button className="topnav-action" style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => onNavigate('forms', p.id)}>
                    Forms
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && <CreateModal onSave={load} onClose={() => setCreating(false)} />}
    </div>
  );
}
