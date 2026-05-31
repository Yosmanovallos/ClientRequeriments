import React from 'react';

interface Props {
  initials?: string;
  size?: number;
  title?: string;
}

/** User avatar — teal-cyan gradient circle with white border, monogram inside. */
export default function Avatar({ initials = 'YO', size = 34, title = 'Account' }: Props) {
  return (
    <div
      title={title}
      style={{
        width: size, height: size, borderRadius: '50%', flex: 'none', cursor: 'pointer',
        background: 'linear-gradient(135deg, #34d6a5 0%, #2bb5c0 100%)',
        color: '#0b2e2a', fontWeight: 700, fontSize: 12.5, letterSpacing: '.3px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 0 2px #fff, 0 1px 3px rgba(0,0,0,.25)',
      }}
    >
      {initials}
    </div>
  );
}

/** Big version for the profile page. */
export function BigAvatar({ initials = 'YO', size = 120 }: Props) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flex: 'none',
      background: 'linear-gradient(135deg, #34d6a5 0%, #2bb5c0 100%)',
      color: '#0b2e2a', fontWeight: 700, fontSize: size * 0.3, letterSpacing: '1px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 6px 20px rgba(43,181,192,.3)',
    }}>{initials}</div>
  );
}
