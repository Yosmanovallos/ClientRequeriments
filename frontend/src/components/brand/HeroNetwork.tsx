import React, { useMemo } from 'react';

/**
 * Animated SVG node-network for the portal hero — teal→magenta gradient nodes connected by
 * thin lines, evoking the Provana dot-spiral logo. Pure inline SVG, no asset dependency.
 * Pseudo-random layout uses a seeded LCG so the layout is deterministic across renders.
 */
export default function HeroNetwork() {
  const { nodes, links } = useMemo(() => {
    let s = 7;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const W = 520, H = 380, N = 42;

    const ns = Array.from({ length: N }, (_, i) => {
      const t   = i / (N - 1);
      const ang = t * Math.PI * 3.4 + rnd() * 1.1;
      const rad = 60 + t * 150 + rnd() * 40;
      return {
        x:   W / 2 + Math.cos(ang) * rad * 0.95 + (rnd() - 0.5) * 50,
        y:   H / 2 + Math.sin(ang) * rad * 0.7  + (rnd() - 0.5) * 50,
        r:   2 + rnd() * 4.5,
        hue: t,
      };
    });

    const ls: [number, number, number][] = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const d = Math.hypot(ns[i]!.x - ns[j]!.x, ns[i]!.y - ns[j]!.y);
        if (d < 70 && rnd() > 0.45) ls.push([i, j, d]);
      }
    }
    return { nodes: ns, links: ls };
  }, []);

  // teal → magenta interpolation
  const col = (t: number) => {
    const a = [52, 214, 165], b = [236, 72, 153];
    return `rgb(${a.map((v, k) => Math.round(v + (b[k]! - v) * t)).join(',')})`;
  };

  return (
    <svg viewBox="0 0 520 380" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
      <defs>
        <filter id="hero-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {links.map(([i, j], k) => (
        <line key={k}
          x1={nodes[i]!.x} y1={nodes[i]!.y}
          x2={nodes[j]!.x} y2={nodes[j]!.y}
          stroke={col((nodes[i]!.hue + nodes[j]!.hue) / 2)}
          strokeWidth="0.8" opacity={0.28}
        />
      ))}
      {nodes.map((n, k) => (
        <circle key={k} cx={n.x} cy={n.y} r={n.r} fill={col(n.hue)} opacity={0.92}
          filter={n.r > 4 ? 'url(#hero-glow)' : undefined}>
          <animate
            attributeName="opacity"
            values={`${0.55};0.95;${0.55}`}
            dur={`${3 + (k % 5)}s`}
            repeatCount="indefinite"
            begin={`${(k % 7) * 0.3}s`}
          />
        </circle>
      ))}
    </svg>
  );
}
