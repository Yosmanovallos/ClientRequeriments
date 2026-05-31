import React, { useEffect, useState } from 'react';
import { usersApi, projectsApi } from '../../api/admin';
import { api } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { CPSection } from './ViewControlPanel';

interface Counts {
  users:    number;
  pending:  number;
  projects: number;
  requests: number;
}

interface Props {
  onNavigate?: (section: CPSection, projectId?: string) => void;
}

export default function ViewCPOverview({ onNavigate }: Props) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error,  setError]  = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      usersApi.list(),
      usersApi.pending(),
      projectsApi.list(),
      api.get<{ count: number }>('/requests'),
    ]).then(([users, pending, projects, requests]) => {
      setCounts({
        users:    users.data?.count    ?? 0,
        pending:  pending.data?.count  ?? 0,
        projects: projects.data?.count ?? 0,
        requests: (requests.data as any)?.count ?? 0,
      });
    }).catch(() => setError('Failed to load overview data.'));
  }, []);

  if (error) return <p style={{ color: 'var(--ink-2)' }}>{error}</p>;
  if (!counts) return <LoadingSpinner />;

  return (
    <div>
      <h2 className="account-title" style={{ marginBottom: 24 }}>Overview</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20, marginBottom: 28 }}>
        <StatCard value={counts.users}    label="Total Users" />
        <StatCard
          value={counts.pending}
          label="Pending Approval"
          warn={counts.pending > 0}
          onClick={counts.pending > 0 ? () => onNavigate?.('users') : undefined}
        />
        <StatCard value={counts.projects} label="Projects" />
        <StatCard value={counts.requests} label="Requests" />
      </div>
      {counts.pending > 0 && (
        <div className="note-box" style={{ background: '#fff8e1', borderColor: '#f59f00', borderLeftColor: '#f59f00' }}>
          <strong>⚠ {counts.pending} user{counts.pending > 1 ? 's' : ''} pending approval.</strong>{' '}
          <button className="btn-cancel" style={{ color: 'var(--purple)', fontWeight: 600 }}
            onClick={() => onNavigate?.('users')}>
            View pending users →
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label, warn, onClick }: {
  value: number; label: string; warn?: boolean; onClick?: () => void;
}) {
  const warnStyle = warn ? { border: '1px solid #f59f00', background: '#fffdf0' } : {};
  return (
    <div className="portal-card"
      style={{ cursor: onClick ? 'pointer' : 'default', flexDirection: 'column', gap: 6, ...warnStyle }}
      onClick={onClick}>
      <span style={{ fontSize: 36, fontWeight: 700, color: warn ? '#d97706' : 'var(--purple)', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{label}</span>
      {warn && <span className="badge badge-amber" style={{ alignSelf: 'flex-start' }}>Action needed</span>}
    </div>
  );
}
