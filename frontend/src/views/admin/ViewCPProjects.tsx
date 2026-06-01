import React, { useEffect, useState, useCallback, useRef } from 'react';
import { projectsApi, type AdminProject } from '../../api/admin';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { CPSection } from './ViewControlPanel';

interface Props {
  onNavigate: (s: CPSection, projectId?: string) => void;
}

function autoSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Shared image picker ───────────────────────────────────────────────────────
function ImagePicker({
  value, onChange,
}: { value: string | null; onChange: (v: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 500 * 1024) {
      alert('Image must be under 500 KB. Tip: use a PNG/JPG at 200×200 px.');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => onChange(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div
        style={{
          border: '2px dashed var(--line-2)', borderRadius: 8, padding: '16px 12px',
          textAlign: 'center', cursor: 'pointer', background: '#fafafa',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--purple)'; }}
        onDragLeave={e => { e.currentTarget.style.borderColor = ''; }}
        onDrop={e => {
          e.preventDefault();
          e.currentTarget.style.borderColor = '';
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
      >
        {value ? (
          <img src={value} alt="Project logo" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 4 }} />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: 4, background: '#e8e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b778c" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
        )}
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {value ? 'Click or drag to replace' : 'Click or drag to upload logo'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>PNG, JPG, SVG, WebP · max 500 KB · recommended 200×200 px</span>
        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      </div>
      {value && (
        <button type="button" onClick={() => onChange(null)}
          style={{ marginTop: 6, fontSize: 12, color: '#a30000', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
          Remove logo
        </button>
      )}
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────
function CreateModal({ onSave, onClose }: { onSave: () => void; onClose: () => void }) {
  const [name,    setName]    = useState('');
  const [slug,    setSlug]    = useState('');
  const [desc,    setDesc]    = useState('');
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) { setError('Name and slug are required.'); return; }
    setSaving(true); setError('');
    const { error: err } = await projectsApi.create({
      name: name.trim(), slug: slug.trim(),
      description: desc.trim() || undefined, iconUrl,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave(); onClose();
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
        <div className="field" style={{ marginBottom: 14 }}>
          <label className="field-label">Description</label>
          <textarea className="txt txt-area" value={desc} onChange={e => setDesc(e.target.value)}
            style={{ width: '100%', minHeight: 80 }} />
        </div>
        <div className="field" style={{ marginBottom: 4 }}>
          <label className="field-label">Project Logo</label>
          <ImagePicker value={iconUrl} onChange={setIconUrl} />
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

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({ project, onSave, onClose }: { project: AdminProject; onSave: () => void; onClose: () => void }) {
  const [name,    setName]    = useState(project.name);
  const [desc,    setDesc]    = useState(project.description ?? '');
  const [iconUrl, setIconUrl] = useState<string | null>(project.iconUrl);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    const { error: err } = await projectsApi.update(project.id, {
      name: name.trim(),
      description: desc.trim() || null,
      iconUrl,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave(); onClose();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3 className="modal-title">Edit Project</h3>
        <p className="modal-sub" style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{project.slug}</p>
        {error && <div className="login-error" style={{ marginBottom: 14 }}>{error}</div>}

        <div className="field" style={{ marginBottom: 14 }}>
          <label className="field-label">Name <span className="req-star">*</span></label>
          <input className="txt" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          <label className="field-label">Description</label>
          <textarea className="txt txt-area" value={desc} onChange={e => setDesc(e.target.value)}
            style={{ width: '100%', minHeight: 80 }} />
        </div>
        <div className="field" style={{ marginBottom: 4 }}>
          <label className="field-label">Project Logo</label>
          <ImagePicker value={iconUrl} onChange={setIconUrl} />
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-send" onClick={handleSave} disabled={saving || !name}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Project list ──────────────────────────────────────────────────────────────
export default function ViewCPProjects({ onNavigate }: Props) {
  const [projects,  setProjects]  = useState<AdminProject[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [creating,  setCreating]  = useState(false);
  const [editing,   setEditing]   = useState<AdminProject | null>(null);

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {p.iconUrl ? (
                      <img src={p.iconUrl} alt={p.name} style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: 4, background: '#e8e8f0', flexShrink: 0 }} />
                    )}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.slug}</div>
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: 13 }}>{p.memberCount}</td>
                <td style={{ fontSize: 13 }}>{p.formCount}</td>
                <td style={{ fontSize: 13 }}>{p.requestCount}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="topnav-action" style={{ fontSize: 12, padding: '4px 10px', marginRight: 6 }}
                    onClick={() => setEditing(p)}>
                    Edit
                  </button>
                  <button className="topnav-action" style={{ fontSize: 12, padding: '4px 10px', marginRight: 6 }}
                    onClick={() => onNavigate('project-members', p.id)}>
                    Members
                  </button>
                  <button className="topnav-action" style={{ fontSize: 12, padding: '4px 10px', marginRight: 6 }}
                    onClick={() => onNavigate('project-orgs', p.id)}>
                    Orgs
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
      {editing  && <EditModal project={editing} onSave={load} onClose={() => setEditing(null)} />}
    </div>
  );
}
