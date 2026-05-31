import React from 'react';

interface Props { height?: number; }

/** Provana wordmark — served from /assets/provana-logo.png (copied into public/). */
export default function ProvanaLogo({ height = 30 }: Props) {
  return (
    <img
      src="/assets/provana-logo.png"
      alt="Provana"
      style={{ height, width: 'auto', display: 'block' }}
      // Fallback if the asset isn't deployed: show purple "Provana" text
      onError={(e) => {
        const img = e.currentTarget;
        const fallback = document.createElement('span');
        fallback.textContent = 'Provana';
        fallback.style.cssText = `font-size:${height * 0.7}px;font-weight:800;color:var(--purple);letter-spacing:-.5px`;
        img.replaceWith(fallback);
      }}
    />
  );
}
