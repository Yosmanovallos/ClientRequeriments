import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { requestsApi, type RequestSummary } from '../api/requests';
import { fmtDate, STATUS_COLORS, TYPE_LABEL } from '../lib/utils';
import TopNav from '../components/layout/TopNav';
import PortalBanner from '../components/layout/PortalBanner';
import FormCrumbs from '../components/layout/FormCrumbs';
import { IconSearch, IconBook, IconCloudUp, IconWrench, IconLaptop, IconCode } from '../components/Icons';
import LoadingSpinner from '../components/LoadingSpinner';

const TYPE_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  new_report:   IconLaptop,
  new_page:     IconBook,
  new_feature:  IconCloudUp,
  fix_issue:    IconWrench,
  view_request: IconCode,
};

export default function ViewMyRequests() {
  const { go, user, activeProject } = useApp();
  const [rows,    setRows]    = useState<RequestSummary[]>([]);
  const [query,   setQuery]   = useState('');
  const [loading, setLoading] = useState(true);

  const isClient = user?.role === 'CLIENT';
  const pageTitle = isClient ? 'My Requests' : 'All Project Requests';

  useEffect(() => {
    // Build filters based on role:
    // CLIENT    → backend automatically scopes to createdBy=me; send projectId if selected
    // AGENT     → all requests in the active project only (strict project scope enforced by backend)
    // ADMIN     → all requests in their tenant; filter by project if one is active
    // SUPER_ADMIN → all requests; filter by project if one is active
    const filters: { projectId?: string } = {};
    if (activeProject) filters.projectId = activeProject.id;

    requestsApi.list(filters).then(({ data }) => {
      setRows((data as { data: RequestSummary[] } | null)?.data ?? []);
      setLoading(false);
    });
  }, [activeProject?.id]);

  const filtered = rows.filter(r =>
    r.title.toLowerCase().includes(query.toLowerCase()) ||
    r.reference.toLowerCase().includes(query.toLowerCase())
  );

  const cols = ['Type', 'Reference', 'Summary', 'Status', 'Service project', 'Organization', 'Created', 'Updated', 'Due', 'Priority'];

  return (
    <div className="view view-reqlist">
      <TopNav />
      <PortalBanner />
      <div className="listcol">
        <FormCrumbs trail={[{ label: 'Provana Customer Portal', to: 'portal' }]} />

        <div className="list-head">
          <h1 className="account-title" style={{ margin: 0 }}>{pageTitle}</h1>
          <button type="button" className="btn-outline">Edit list view</button>
        </div>

        <div className="filterbar">
          <label className="filter-search">
            <IconSearch size={16} />
            <input placeholder="Request contains..." value={query} onChange={e => setQuery(e.target.value)} />
          </label>
          <button type="button" className="filter-pill is-active">Status: Open requests</button>
          <button type="button" className="filter-pill">All</button>
          <button type="button" className="filter-pill">Request type</button>
        </div>

        <div className="table-scroll">
          <table className="reqtable">
            <thead>
              <tr>{cols.map(c => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={cols.length} className="t-empty"><LoadingSpinner label="Loading requests…" /></td></tr>
                : filtered.length === 0
                  ? <tr><td colSpan={cols.length} className="t-empty">No requests match your search.</td></tr>
                  : filtered.map(r => {
                      const Icon = TYPE_ICON[r.requestType] ?? IconLaptop;
                      const color = STATUS_COLORS[r.status] ?? 'grey';
                      return (
                        <tr key={r.id} onClick={() => go('detail', { id: r.id })}>
                          <td className="t-icon"><span><Icon size={22} /></span></td>
                          <td className="t-ref">{r.reference}</td>
                          <td className="t-sum">{r.title}</td>
                          <td><span className={`badge badge-${color}`}>{r.status}</span></td>
                          <td className="t-proj">{TYPE_LABEL[r.requestType] ?? r.requestType}</td>
                          <td className="t-proj">{r.organizationName ?? '—'}</td>
                          <td className="t-date">{fmtDate(r.createdAt)}</td>
                          <td className="t-date">{fmtDate(r.updatedAt)}</td>
                          <td className="t-date">{r.dueDate ? fmtDate(r.dueDate) : '—'}</td>
                          <td>{r.priority}</td>
                        </tr>
                      );
                    })
              }
            </tbody>
          </table>
        </div>

        <footer className="powered">Powered by <span className="pw-mark" /> Provana Service Management</footer>
      </div>
    </div>
  );
}
