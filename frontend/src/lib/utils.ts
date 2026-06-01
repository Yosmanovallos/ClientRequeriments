/** Format a comment timestamp as "Aug 31, 2026 at 2:45 PM". */
export function fmtCommentDate(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}

/** Format an ISO date string as a relative human-readable label. */
export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d    = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7)   return days === 1 ? 'Yesterday' : `${days}d ago`;
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' });
}

export const STATUS_COLORS: Record<string, string> = {
  'NEW':               'grey',
  'IN REVIEW':         'blue',
  'APPROVED':          'green',
  'IN DEVELOPMENT':    'blue',
  'UAT':               'green',
  'CUSTOMER FEEDBACK': 'amber',
  'DONE':              'green',
  'CANCELLED':         'red',
  'ON HOLD':           'amber',
};

export const TYPE_LABEL: Record<string, string> = {
  new_report:   'New Report',
  new_page:     'New Page',
  new_feature:  'New Feature',
  fix_issue:    'Fix Issue',
  view_request: 'View Request',
};
