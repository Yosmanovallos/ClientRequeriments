import React, { useEffect, useState, useCallback } from 'react';
import { projectsApi, usersApi, type ProjectMember, type PortalUser } from '../../api/admin';
import LoadingSpinner from '../../components/LoadingSpinner';

interface Props {
  projectId: string;
  onBack:    () => void;
}

export default function ViewCPProjectMembers({ projectId, onBack }: Props) {
  const [members,     setMembers]     = useState<ProjectMember[]>([]);
  const [allUsers,    setAllUsers]    = useState<PortalUser[]>([]);
  const [projectName, setProjectName] = useState('Project');
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [addId,       setAddId]       = useState('');
  const [adding,      setAdding]      = useState(false);
  const [addError,    setAddError]    = useState('');

  const load = useCallback(() => {
    Promise.all([
      projectsApi.list(),
      projectsApi.members(projectId),
      usersApi.list(),
    ]).then(([projs, mems, users]) => {
      const proj = projs.data?.data.find(p => p.id === projectId);
      if (proj) setProjectName(proj.name);
      setMembers(mems.data?.data ?? []);
      setAllUsers(users.data?.data ?? []);
    }).catch(() => setError('Failed to load members.'))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!addId) return;
    setAdding(true);
    setAddError('');
    const { error: err } = await projectsApi.addMember(projectId, addId);
    setAdding(false);
    if (err) { setAddError(err.message); return; }
    setAddId('');
    load();
  };

  const handleRemove = async (userId: string) => {
    await projectsApi.removeMember(projectId, userId);
    load();
  };

  if (loading) return <LoadingSpinner />;
  if (error)   return <p style={{ color: 'var(--ink-2)' }}>{error}</p>;

  const userMap    = Object.fromEntries(allUsers.map(u => [u.id, u]));
  const memberUserIds = new Set(members.map(m => m.userId));
  const nonMembers = allUsers.filter(u => !memberUserIds.has(u.id) && u.role !== null);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className="cp-back" onClick={onBack}>← Back to Projects</button>
        <h2 className="account-title" style={{ margin: 0 }}>{projectName} — Members</h2>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, margin: 0, minWidth: 220 }}>
          <label className="field-label">Add a user</label>
          <select className="txt" value={addId} onChange={e => setAddId(e.target.value)} style={{ height: 42 }}>
            <option value="">— select user —</option>
            {nonMembers.map(u => (
              <option key={u.id} value={u.id}>
                {u.displayName ?? u.email} ({u.role})
              </option>
            ))}
          </select>
        </div>
        <button className="btn-send" style={{ height: 42, padding: '0 18px', whiteSpace: 'nowrap', flexShrink: 0 }}
          onClick={handleAdd} disabled={adding || !addId}>
          {adding ? 'Adding…' : 'Add'}
        </button>
      </div>
      {addError && <div className="login-error" style={{ marginBottom: 14 }}>{addError}</div>}

      <div className="users-table-wrap" style={{ marginTop: 16 }}>
        <table className="cp-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={3} style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '28px 0' }}>
                  No members yet. Add a user above.
                </td>
              </tr>
            )}
            {members.map(m => {
              const u = userMap[m.userId];
              return (
                <tr key={m.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u?.displayName ?? u?.email ?? '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{u?.email ?? m.userId}</div>
                  </td>
                  <td>
                    {u?.role && <span className="badge badge-grey">{u.role.replace('_', ' ')}</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="topnav-action"
                      style={{ fontSize: 12, padding: '4px 10px', color: '#a30000', borderColor: '#ffd9d9' }}
                      onClick={() => handleRemove(m.userId)}>
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
