import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { requestsApi, type RequestSummary } from '../api/requests';
import { fmtDate, fmtDueDate, STATUS_COLORS, TYPE_LABEL } from '../lib/utils';
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
  const { slug } = useParams<{ slug?: string }>();
  const { user } = useApp();
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();

  const project   = slug ? (user?.projects.find(p => p.slug === slug) ?? null) : null;
  const isClient  = user?.role === 'CLIENT';
  const pageTitle = isClient ? 'My Requests' : 'All Project Requests';

  const [rows,    setRows]    = useState<RequestSummary[]>([]);
  const [query,   setQuery]   = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const filters: { projectId?: string; status?: string } = {};
    if (project) filters.projectId = project.id;
    const statusParam = searchParams.get('status');
    if (statusParam) filters.status = statusParam;

    requestsApi.list(filters).then(({ data }) => {
      setRows((data as { data: RequestSummary[] } | null)?.data ?? []);
      setLoading(false);
    });
  }, [project?.id, searchParams.get('status')]);

  const filtered = rows.filter(r =>
    r.title.toLowerCase().includes(query.toLowerCase()) ||
    r.reference.toLowerCase().includes(query.toLowerCase())
  );

  const cols = ['Type', 'Reference', 'Summary', 'Status', 'Request type', 'Organization', 'Reporter', 'Created', 'Updated', 'Due', 'Priority'];

  // Navigate to detail: prefer project-scoped URL, fall back to /requests/:reference
  const openDetail = (r: RequestSummary) => {
    if (slug) {
      navigate(`/portal/${slug}/requests/${r.reference}`);
    } else {
      // Global list — find the project slug from user's projects
      const proj = user?.projects.find(p => p.id === r.projectId);
      if (proj) navigate(`/portal/${proj.slug}/requests/${r.reference}`);
      else navigate(`/requests/${r.reference}`);
    }
  };

  const crumbTrail = slug && project
    ? [{ label: 'Provana Customer Portal', to: '/' }, { label: project.name, to: `/portal/${slug}` }]
    : [{ label: 'Provana Customer Portal', to: '/' }];

  return (
    <div className="view view-reqlist">
      <TopNav />
      <PortalBanner />
      <div className="listcol">
        <FormCrumbs trail={crumbTrail} />

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
                      const Icon  = TYPE_ICON[r.requestType] ?? IconLaptop;
                      const color = STATUS_COLORS[r.status] ?? 'grey';
                      return (
                        <tr key={r.id} onClick={() => openDetail(r)}>
                          <td className="t-icon"><span><Icon size={22} /></span></td>
                          <td className="t-ref">{r.reference}</td>
                          <td className="t-sum">{r.title}</td>
                          <td><span className={`badge badge-${color}`}>{r.status}</span></td>
                          <td className="t-proj">{TYPE_LABEL[r.requestType] ?? r.requestType}</td>
                          <td className="t-proj">{r.organizationName ?? '—'}</td>
                          <td className="t-proj">{r.createdBy ?? '—'}</td>
                          <td className="t-date">{fmtDate(r.createdAt)}</td>
                          <td className="t-date">{fmtDate(r.updatedAt)}</td>
                          <td className="t-date">{fmtDueDate(r.dueDate)}</td>
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
