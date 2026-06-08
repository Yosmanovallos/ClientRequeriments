import React from 'react';
import { Link } from 'react-router-dom';

export interface CrumbItem {
  label: string;
  to?:   string;   // URL path when set, crumb is clickable
}

export default function FormCrumbs({ trail }: { trail: CrumbItem[] }) {
  return (
    <nav className="formcrumbs">
      {trail.map((c, i) => (
        <span key={i} className="fc-item">
          {c.to
            ? <Link to={c.to}>{c.label}</Link>
            : <span className="fc-current">{c.label}</span>}
          {i < trail.length - 1 && <span className="fc-sep">/</span>}
        </span>
      ))}
    </nav>
  );
}
