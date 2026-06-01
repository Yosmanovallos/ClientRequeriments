import React, { useEffect, useState, useCallback } from 'react';
import { usersApi, projectsApi, type PortalUser, type AdminProject } from '../../api/admin';
import { useApp } from '../../context/AppContext';
import LoadingSpinner from '../../components/LoadingSpinner';

const ROLES = ['CLIENT', 'AGENT', 'ADMIN', 'SUPER_ADMIN'] as const;

function roleBadge(role: string): string {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return 'badge-blue';
  if (role === 'AGENT') return 'badge-green';
  return 'badge-grey';
}

interface SetupModalProps {
  user:          PortalUser;
  projects:      AdminProject[];
  isSuperAdmin:  boolean;
  currentUserId: string;
  onSave:        () => void;
  onClose:       () => void;
}

function SetupModal({ user, projects, isSuperAdmin, currentUserId, onSave, onClose }: SetupModalProps) {
  const [role,            setRole]            = useState<string>(user.role ?? 'CLIENT');
  const [selected,        setSelected]        = useState<Set<string>>(new Set(user.projectIds));
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState('');
  const [confirmDeactive, setConfirmDeactive] = useState(false);

  const toggle = (id: string) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const [r1, r2] = await Promise.all([
      usersApi.updateRole(user.id, role),
      usersApi.updateProjects(user.id, [...selected]),
    ]);
    setSaving(false);
    if (r1.error || r2.error) { setError(r1.error?.message ?? r2.error?.message ?? 'Save failed'); return; }
    onSave();
    onClose();
  };

  const handleToggleActive = async () => {
    setSaving(true);
    setError('');
    const res = await usersApi.setActive(user.id, !user.isActive);
    setSaving(false);
    if (res.error) { setError(res.error.message ?? 'Failed to update status'); return; }
    onSave();
    onClose();
  };

  const canDeactivate = isSuperAdmin && user.id !== currentUserId;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3 className="modal-title">{user.role ? 'Edit user' : 'Set up user'}</h3>
        <p className="modal-sub">{user.displayName ?? user.email} · {user.email}</p>

        {error && <div className="login-error" style={{ marginBottom: 14 }}>{error}</div>}

        <div className="field" style={{ marginBottom: 16 }}>
          <label className="field-label">Role <span className="req-star">*</span></label>
          <select className="txt" value={role} onChange={e => setRole(e.target.value)} style={{ height: 42 }}>
            {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
          </select>
        </div>

        <div className="field" style={{ marginBottom: 4 }}>
          <label className="field-label">Projects</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
            {projects.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted)' }}>No projects available.</span>}
            {projects.map(p => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: 'var(--ink)' }}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                {p.name}
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.slug}</span>
              </label>
            ))}
          </div>
        </div>

        {canDeactivate && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            {!confirmDeactive ? (
              <button
                className="btn-cancel"
                style={{ color: user.isActive ? 'var(--error, #d32f2f)' : 'var(--purple)', borderColor: user.isActive ? 'var(--error, #d32f2f)' : 'var(--purple)', width: '100%' }}
                onClick={() => setConfirmDeactive(true)}
                disabled={saving}
              >
                {user.isActive ? 'Deactivate account' : 'Reactivate account'}
              </button>
            ) : (
              <div style={{ background: '#fff3f3', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 14px' }}>
                <p style={{ fontSize: 13, color: 'var(--ink)', margin: '0 0 12px' }}>
                  {user.isActive
                    ? 'Deactivate this account? The user will be blocked from signing in.'
                    : 'Reactivate this account? The user will be able to sign in again.'}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-cancel" style={{ flex: 1 }} onClick={() => setConfirmDeactive(false)} disabled={saving}>
                    Cancel
                  </button>
                  <button
                    className="btn-send"
                    style={{ flex: 1, background: user.isActive ? 'var(--error, #d32f2f)' : undefined }}
                    onClick={handleToggleActive}
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : user.isActive ? 'Yes, deactivate' : 'Yes, reactivate'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-send" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : user.role ? 'Save' : 'Activate user'}
          </button>
        </div>
      </div>
    </div>
  );
}

type Filter = 'all' | 'pending' | 'active';

export default function ViewCPUsers() {
  const { user: currentUser } = useApp();
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const [users,    setUsers]    = useState<PortalUser[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [modal,    setModal]    = useState<PortalUser | null>(null);
  const [filter,   setFilter]   = useState<Filter>('all');

  const load = useCallback(() => {
    Promise.all([usersApi.list(), projectsApi.list()])
      .then(([u, p]) => {
        setUsers(u.data?.data ?? []);
        setProjects(p.data?.data ?? []);
      })
      .catch(() => setError('Failed to load users.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error)   return <p style={{ color: 'var(--ink-2)' }}>{error}</p>;

  const pending = users.filter(u => u.role === null);
  const visible =
    filter === 'pending' ? users.filter(u => u.role === null) :
    filter === 'active'  ? users.filter(u => u.role !== null && u.isActive) :
    users;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 className="account-title" style={{ margin: 0 }}>Users</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['all', 'pending', 'active'] as Filter[]).map(f => (
            <button key={f}
              className="topnav-action"
              style={filter === f ? { background: '#ede8f8', borderColor: 'var(--purple)', color: 'var(--purple)', fontWeight: 700 } : {}}
              onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'pending' && pending.length > 0 && (
                <span className="badge badge-amber" style={{ marginLeft: 6 }}>{pending.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {pending.length > 0 && filter !== 'pending' && (
        <div className="note-box" style={{ background: '#fff8e1', borderColor: '#f59f00', borderLeftColor: '#f59f00', marginBottom: 20 }}>
          <strong>⚠ {pending.length} user{pending.length > 1 ? 's' : ''} pending approval.</strong>{' '}
          <button className="btn-cancel" style={{ color: 'var(--purple)', fontWeight: 600 }}
            onClick={() => setFilter('pending')}>
            View pending →
          </button>
        </div>
      )}

      <div className="users-table-wrap">
        <table className="cp-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Projects</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '28px 0' }}>
                  No users found.
                </td>
              </tr>
            )}
            {visible.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{u.displayName ?? '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{u.email}</div>
                </td>
                <td>
                  {u.role
                    ? <span className={`badge ${roleBadge(u.role)}`}>{u.role.replace('_', ' ')}</span>
                    : <span className="badge badge-amber">PENDING</span>}
                </td>
                <td>
                  <span className={`badge ${u.isActive ? 'badge-green' : 'badge-grey'}`}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                  {u.projectIds.length === 0 ? '—' : `${u.projectIds.length} project${u.projectIds.length > 1 ? 's' : ''}`}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="topnav-action" style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => setModal(u)}>
                    {u.role === null ? 'Set up' : 'Edit'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <SetupModal
          user={modal}
          projects={projects}
          isSuperAdmin={isSuperAdmin}
          currentUserId={currentUser?.userId ?? ''}
          onSave={load}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
