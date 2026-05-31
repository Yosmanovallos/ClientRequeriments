/**
 * Provana Help Center — icon set.
 * Stroke-based SVGs that inherit `currentColor`. Each icon takes `size` (px) + standard SVG props.
 * Ported 1:1 from the legacy `app/icons.jsx`.
 */
import React from 'react';

interface IconProps extends React.SVGAttributes<SVGElement> {
  size?: number;
  sw?: number;     // stroke-width override
  fill?: string;   // fill override (default "none")
  vb?: number;     // viewBox override (default 24)
}

function Ic({ children, size = 24, sw = 1.7, fill = 'none', vb = 24, ...p }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} fill={fill}
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...p}>
      {children}
    </svg>
  );
}

// ── Common icons ────────────────────────────────────────────────────────────
export const IconSearch = (p: IconProps) => <Ic {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></Ic>;
export const IconFolder = (p: IconProps) => <Ic {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Ic>;
export const IconGrid   = (p: IconProps) => <Ic sw={0} fill="currentColor" {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Ic>;
export const IconChevR  = (p: IconProps) => <Ic {...p}><path d="m9 6 6 6-6 6" /></Ic>;
export const IconChevD  = (p: IconProps) => <Ic {...p}><path d="m6 9 6 6 6-6" /></Ic>;
export const IconChevU  = (p: IconProps) => <Ic {...p}><path d="m6 15 6-6 6 6" /></Ic>;
export const IconX      = (p: IconProps) => <Ic {...p}><path d="M6 6l12 12M18 6 6 18" /></Ic>;
export const IconCal    = (p: IconProps) => <Ic {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Ic>;
export const IconLock   = (p: IconProps) => <Ic {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Ic>;
export const IconUser   = (p: IconProps) => <Ic {...p}><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></Ic>;

// ── Request-type glyphs ─────────────────────────────────────────────────────
export const IconLaptop   = (p: IconProps) => <Ic {...p}><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2.5 20h19" /></Ic>;
export const IconBook     = (p: IconProps) => <Ic {...p}><path d="M12 6.5C10.5 5.2 8.4 4.7 6 4.7c-1 0-1.7.1-2.3.3v13c.6-.2 1.3-.3 2.3-.3 2.4 0 4.5.5 6 1.8" /><path d="M12 6.5c1.5-1.3 3.6-1.8 6-1.8 1 0 1.7.1 2.3.3v13c-.6-.2-1.3-.3-2.3-.3-2.4 0-4.5.5-6 1.8z" /><path d="M12 6.5V19" /></Ic>;
export const IconCloudUp  = (p: IconProps) => <Ic {...p}><path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 9.5a3.5 3.5 0 0 1 .5 6.96" /><path d="M12 13v6M9.5 15.5 12 13l2.5 2.5" /></Ic>;
export const IconWrench   = (p: IconProps) => <Ic {...p}><path d="M14.7 6.3a3.5 3.5 0 0 0-4.6 4.3L4 16.7 7.3 20l6.1-6.1a3.5 3.5 0 0 0 4.3-4.6l-2.2 2.2-2.2-.5-.5-2.2z" /><path d="m15.5 15.5 3.5 3.5" /></Ic>;
export const IconCode     = (p: IconProps) => <Ic {...p}><path d="m9 8-4 4 4 4M15 8l4 4-4 4" /></Ic>;
export const IconDatabase = (p: IconProps) => <Ic {...p}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6" /><path d="M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" /></Ic>;
export const IconChats    = (p: IconProps) => <Ic {...p}><path d="M4 5.5h11a2 2 0 0 1 2 2V13a2 2 0 0 1-2 2H9l-4 3v-3a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2z" /><path d="M9 9h5M9 12h3" /></Ic>;

// ── Toolbar / misc ──────────────────────────────────────────────────────────
export const IconBold        = (p: IconProps) => <Ic sw={2.2} {...p}><path d="M7 5h6a3.2 3.2 0 0 1 0 6.4H7zM7 11.4h7a3.3 3.3 0 0 1 0 6.6H7z" /></Ic>;
export const IconItalic      = (p: IconProps) => <Ic sw={2}  {...p}><path d="M15 5h-5M14 19H9M14 5 10 19" /></Ic>;
export const IconDots        = (p: IconProps) => <Ic sw={0} fill="currentColor" {...p}><circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" /></Ic>;
export const IconColorA      = (p: IconProps) => <Ic sw={1.8} {...p}><path d="M6 17 10.5 6h1L16 17M7.6 13.5h6.8" /></Ic>;
export const IconBullet      = (p: IconProps) => <Ic {...p}><circle cx="5" cy="7" r="1.2" fill="currentColor" stroke="none" /><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="5" cy="17" r="1.2" fill="currentColor" stroke="none" /><path d="M9 7h11M9 12h11M9 17h11" /></Ic>;
export const IconLink        = (p: IconProps) => <Ic {...p}><path d="M10 13a3.5 3.5 0 0 0 5 0l2.5-2.5a3.54 3.54 0 0 0-5-5L16 7" /><path d="M14 11a3.5 3.5 0 0 0-5 0l-2.5 2.5a3.54 3.54 0 0 0 5 5L8 17" /></Ic>;
export const IconAt          = (p: IconProps) => <Ic {...p}><circle cx="12" cy="12" r="3.5" /><path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8" /></Ic>;
export const IconEmoji       = (p: IconProps) => <Ic {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14a4 4 0 0 0 7 0" /><circle cx="9" cy="10" r="0.6" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="0.6" fill="currentColor" stroke="none" /></Ic>;
export const IconTable       = (p: IconProps) => <Ic {...p}><rect x="4" y="5" width="16" height="14" rx="1.5" /><path d="M4 10h16M4 14.5h16M10 5v14" /></Ic>;
export const IconCodeBlock   = (p: IconProps) => <Ic sw={1.5} {...p}><path d="m8 9-3 3 3 3M16 9l3 3-3 3M13 7l-2 10" /></Ic>;
export const IconQuote       = (p: IconProps) => <Ic sw={0} fill="currentColor" {...p}><path d="M6 16c-1.1 0-2-.9-2-2v-2c0-2.2 1.8-4 4-4v2c-1.1 0-2 .9-2 2h1c1.1 0 2 .9 2 2s-.9 2-2 2zm9 0c-1.1 0-2-.9-2-2v-2c0-2.2 1.8-4 4-4v2c-1.1 0-2 .9-2 2h1c1.1 0 2 .9 2 2s-.9 2-2 2z" /></Ic>;
export const IconInfo        = (p: IconProps) => <Ic {...p}><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" /><circle cx="12" cy="8.2" r="1.1" fill="#fff" stroke="none" /><path d="M12 11v6" stroke="#fff" strokeWidth={2} /></Ic>;
export const IconPlus        = (p: IconProps) => <Ic {...p}><path d="M12 6v12M6 12h12" /></Ic>;
export const IconUploadCloud = (p: IconProps) => <Ic {...p}><path d="M7 17a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a3.5 3.5 0 0 1 .5 6.96" /><path d="M12 21V11M8.5 14 12 10.5 15.5 14" /></Ic>;
export const IconCheck       = (p: IconProps) => <Ic {...p} sw={2.2}><path d="m3 8 3.5 3.5L13 4.5" /></Ic>;
