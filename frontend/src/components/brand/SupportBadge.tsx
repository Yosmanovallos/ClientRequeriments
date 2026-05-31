import React from 'react';
import { IconChats } from '../Icons';

interface Props { size?: number; }

/** Purple gradient circle with a chat icon — used for the Provana Customer Support portal card. */
export default function SupportBadge({ size = 46 }: Props) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flex: 'none',
      background: 'linear-gradient(135deg, #4A2E80 0%, #6d3fb0 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: 'inset 0 1px 2px rgba(255,255,255,.2)',
    }}>
      <span style={{ color: '#fff', display: 'flex' }}>
        <IconChats size={size * 0.5} />
      </span>
    </div>
  );
}
