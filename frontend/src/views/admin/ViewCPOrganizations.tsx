import React, { useEffect, useState, useCallback } from 'react';
import { orgsApi, projectsApi, usersApi, type AdminProject, type Organization, type PortalUser } from '../../api/admin';
import LoadingSpinner from '../../components/LoadingSpinner';

interface Props {
  projectId?: string;
  onBack?:    () => void;
}

// ── Create / Edit modal ───────────────────────────────────────────────────────
function OrgFormModal({
  projectId, org, onSave, onClose,
}: {
  projectId: string;
  org:       Organization | null;
  onSave:    () => void;
  onClose:   () => void;
}) {
  const [name,   setName]   = useState(org?.name ?? '');
  const [desc,   setDesc]   = useState(org?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    const payload = { name: name.trim(), description: desc.trim() || null };
    const { error: err } = org
      ? await orgsApi.update(projectId, org.id, payload)
      : await orgsApi.create(projectId, payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSave(); onClose();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3 className="modal-title">{org ? 'Edit Organization' : 'New Organization'}</h3>
        {error && <div className="login-error" style={{ marginBottom: 14 }}>{error}</div>}

        <div className="field" style={{ marginBottom: 14 }}>
          <label className="field-label">Name <span className="req-star">*</span></label>
          <input className="txt" value={name} onChange={e => setName(e.target.value)} maxLength={128} />
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          <label className="field-label">Description</label>
          <textarea className="txt txt-area" value={desc} onChange={e => setDesc(e.target.value)}
            style={{ width: '100%', minHeight: 80 }} maxLength={2000} />
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-send" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : (org ? 'Save changes' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Members modal ──────────────────────────────────────────────────────────────
function MembersModal({
  projectId, org, onClose,
}: {
  projectId: string;
  org:       Organization;
  onClose:   () => void;
}) {
  const [members,    setMembers]    = useState<{ id: string; userId: string; createdAt: string }[]>([]);
  const [allUsers,   setAllUsers]   = useState<PortalUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [addId,      setAddId]      = useState('');
  const [adding,     setAdding]     = useState(false);
  const [addError,   setAddError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [mRes, uRes] = await Promise.all([
      orgsApi.listMembers(projectId, org.id),
      usersApi.list(),
    ]);
    setMembers(mRes.data?.data ?? []);
    setAllUsers(uRes.data?.data ?? []);
    setLoading(false);
  }, [projectId, org.id]);

  useEffect(() => { load(); }, [load]);

  const memberUserIds = new Set(members.map(m => m.userId));
  const projectMembers = allUsers.filter(u => u.projectIds.includes(projectId));
  const nonMembers = projectMembers.filter(u => !memberUserIds.has(u.id) && u.role !== null);

  const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));

  const handleAdd = async () => {
    if (!addId) return;
    setAdding(true); setAddError('');
    const { error: err } = await orgsApi.addMember(projectId, org.id, addId);
    setAdding(false);
    if (err) { setAddError(err.message); return; }
    setAddId('');
    load();
  };

  const handleRemove = async (userId: string) => {
    await orgsApi.removeMember(projectId, org.id, userId);
    load();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ maxWidth: 520, width: '95%' }}>
        <h3 className="modal-title">{org.name} — Members</h3>
        <p className="modal-sub">Members of this organization can see each other's tickets.</p>

        {loading ? <LoadingSpinner /> : (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, margin: 0, minWidth: 200 }}>
                <label className="field-label">Add a member</label>
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
            {addError && <div className="login-error" style={{ marginBottom: 10 }}>{addError}</div>}

            <div className="users-table-wrap" style={{ marginTop: 12 }}>
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
                      <td colSpan={3} style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>
                        No members yet.
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
          </>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function ViewCPOrganizations({ projectId: initialProjectId, onBack }: Props) {
  const [projects,      setProjects]      = useState<AdminProject[]>([]);
  const [selectedProjId, setSelectedProjId] = useState<string>(initialProjectId ?? '');
  const [orgs,          setOrgs]          = useState<Organization[]>([]);
  const [projectName,   setProjectName]   = useState('Project');
  const [loading,       setLoading]       = useState(false);
  const [projLoading,   setProjLoading]   = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [creating,      setCreating]      = useState(false);
  const [editing,       setEditing]       = useState<Organization | null>(null);
  const [managingOrg,   setManagingOrg]   = useState<Organization | null>(null);
  const [deleteId,      setDeleteId]      = useState<string | null>(null);
  const [deleting,      setDeleting]      = useState(false);

  // Load project list once (needed for picker and project name)
  useEffect(() => {
    projectsApi.list()
      .then(({ data }) => {
        const list = data?.data ?? [];
        setProjects(list);
        if (initialProjectId) {
          const p = list.find(p => p.id === initialProjectId);
          if (p) setProjectName(p.name);
        }
      })
      .finally(() => setProjLoading(false));
  }, [initialProjectId]);

  const loadOrgs = useCallback(async (projId: string) => {
    if (!projId) return;
    setLoading(true); setError(null);
    const { data, error: e } = await orgsApi.list(projId);
    if (e) setError(e.message);
    else setOrgs(data?.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedProjId) loadOrgs(selectedProjId);
    else setOrgs([]);
  }, [selectedProjId, loadOrgs]);

  // When user picks a project from the inline dropdown
  const handleProjectChange = (id: string) => {
    setSelectedProjId(id);
    const p = projects.find(p => p.id === id);
    if (p) setProjectName(p.name);
  };

  const handleDelete = async (orgId: string) => {
    setDeleting(true);
    await orgsApi.delete(selectedProjId, orgId);
    setDeleteId(null);
    setDeleting(false);
    loadOrgs(selectedProjId);
  };

  if (projLoading) return <LoadingSpinner />;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        {onBack && (
          <button className="cp-back" onClick={onBack}>← Back to Projects</button>
        )}
        <h2 className="account-title" style={{ margin: 0 }}>
          {selectedProjId ? `${projectName} — Organizations` : 'Organizations'}
        </h2>
        {selectedProjId && (
          <button className="btn-send" style={{ height: 36, padding: '0 16px', fontSize: 13, marginLeft: 'auto' }}
            onClick={() => setCreating(true)}>
            + New Organization
          </button>
        )}
      </div>

      {/* Inline project picker when accessed from sidebar without a project context */}
      {!initialProjectId && (
        <div className="field" style={{ marginBottom: 20, maxWidth: 340 }}>
          <label className="field-label">Project</label>
          <select className="txt" value={selectedProjId} onChange={e => handleProjectChange(e.target.value)}
            style={{ height: 42 }}>
            <option value="">— select a project —</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {!selectedProjId ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Select a project above to manage its organizations.</p>
      ) : loading ? (
        <LoadingSpinner />
      ) : error ? (
        <p style={{ color: 'var(--ink-2)' }}>{error}</p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, marginTop: -8 }}>
            Organizations group CLIENT users so they can see each other's tickets within this project.
          </p>
          <div className="users-table-wrap">
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Members</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: '28px 0' }}>
                      No organizations yet.
                    </td>
                  </tr>
                )}
                {orgs.map(o => (
                  <tr key={o.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{o.name}</div>
                      {o.description && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{o.description}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>{o.memberCount ?? 0}</td>
                    <td>
                      <span className={`badge ${o.isActive ? 'badge-green' : 'badge-grey'}`}>
                        {o.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="topnav-action" style={{ fontSize: 12, padding: '4px 10px', marginRight: 6 }}
                        onClick={() => setEditing(o)}>
                        Edit
                      </button>
                      <button className="topnav-action" style={{ fontSize: 12, padding: '4px 10px', marginRight: 6 }}
                        onClick={() => setManagingOrg(o)}>
                        Members
                      </button>
                      <button className="topnav-action"
                        style={{ fontSize: 12, padding: '4px 10px', color: '#a30000', borderColor: '#ffd9d9' }}
                        onClick={() => setDeleteId(o.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {creating && selectedProjId && (
        <OrgFormModal projectId={selectedProjId} org={null} onSave={() => loadOrgs(selectedProjId)} onClose={() => setCreating(false)} />
      )}
      {editing && selectedProjId && (
        <OrgFormModal projectId={selectedProjId} org={editing} onSave={() => loadOrgs(selectedProjId)} onClose={() => setEditing(null)} />
      )}
      {managingOrg && selectedProjId && (
        <MembersModal projectId={selectedProjId} org={managingOrg} onClose={() => { setManagingOrg(null); loadOrgs(selectedProjId); }} />
      )}
      {deleteId && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleteId(null); }}>
          <div className="modal-card">
            <h3 className="modal-title">Delete Organization</h3>
            <p style={{ fontSize: 14, marginBottom: 20 }}>
              This will permanently delete the organization and remove all members. Existing tickets tagged to it will retain the reference but the organization will no longer exist.
            </p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setDeleteId(null)} disabled={deleting}>Cancel</button>
              <button className="btn-send" style={{ background: '#a30000' }}
                onClick={() => handleDelete(deleteId)} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
