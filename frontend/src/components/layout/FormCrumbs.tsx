import React from 'react';
import { useApp, type View } from '../../context/AppContext';

export interface CrumbItem {
  label: string;
  to?:   View;     // when set, the crumb is clickable
}

/**
 * Inline breadcrumb trail shown inside form columns (above the form heading).
 * Each clickable crumb navigates via the app router; the last item is the current page.
 */
export default function FormCrumbs({ trail }: { trail: CrumbItem[] }) {
  const { go } = useApp();
  return (
    <nav className="formcrumbs">
      {trail.map((c, i) => (
        <span key={i} className="fc-item">
          {c.to
            ? <a onClick={() => go(c.to!)}>{c.label}</a>
            : <span className="fc-current">{c.label}</span>}
          {i < trail.length - 1 && <span className="fc-sep">/</span>}
        </span>
      ))}
    </nav>
  );
}
