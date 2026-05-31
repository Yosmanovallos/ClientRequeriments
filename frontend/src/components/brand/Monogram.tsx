import React from 'react';

interface Props { size?: number; }

/** Bell Legal Group monogram — navy circle with gold serif "B". Used as the BI Requests icon. */
export default function Monogram({ size = 46 }: Props) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flex: 'none',
      background: 'radial-gradient(120% 120% at 30% 25%, #1c3a5e 0%, #102a44 60%, #0a1c30 100%)',
      border: '1.5px solid #c9a24b',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: 'inset 0 1px 2px rgba(255,255,255,.18)',
    }}>
      <span style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontWeight: 700,
        fontSize: size * 0.5,
        color: '#d8b65e',
        lineHeight: 1,
        marginTop: -1,
      }}>B</span>
    </div>
  );
}
