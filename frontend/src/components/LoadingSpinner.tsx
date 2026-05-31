import React from 'react';

/**
 * Inline loading indicator — purple spinning circle.
 * Bug #5 fix: previously data-fetching views showed blank content while waiting for API.
 */
interface Props {
  label?: string;
  /** When true, fills the parent and centres the spinner. Default: false (inline). */
  block?: boolean;
}

export default function LoadingSpinner({ label = 'Loading…', block = false }: Props) {
  const inner = (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--muted)' }}>
      <span style={{
        display: 'inline-block', width: 18, height: 18,
        border: '2.5px solid var(--line-2)',
        borderTopColor: 'var(--purple)',
        borderRadius: '50%',
        animation: 'lp-spin 0.8s linear infinite',
      }} />
      <span style={{ fontSize: 14 }}>{label}</span>
      <style>{`@keyframes lp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  if (!block) return inner;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
      {inner}
    </div>
  );
}
