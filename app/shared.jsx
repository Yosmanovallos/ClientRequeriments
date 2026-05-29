// Provana Help Center — shared brand components
const { useMemo } = React;

const ProvanaLogo = ({ height = 30 }) => (
  <img src="assets/provana-logo.png" alt="Provana" style={{ height, width: "auto", display: "block" }} />
);

// Dark navy circle badge with a gold serif "B" — the BLG monogram
const Monogram = ({ size = 46 }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%", flex: "none",
    background: "radial-gradient(120% 120% at 30% 25%, #1c3a5e 0%, #102a44 60%, #0a1c30 100%)",
    border: "1.5px solid #c9a24b",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "inset 0 1px 2px rgba(255,255,255,.18)",
  }}>
    <span style={{
      fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700,
      fontSize: size * 0.5, color: "#d8b65e", lineHeight: 1, marginTop: -1,
    }}>B</span>
  </div>
);

const Avatar = ({ initials = "YO", size = 34 }) => (
  <div title="Yosman Ovallos" style={{
    width: size, height: size, borderRadius: "50%", flex: "none", cursor: "pointer",
    background: "linear-gradient(135deg, #34d6a5 0%, #2bb5c0 100%)",
    color: "#0b2e2a", fontWeight: 700, fontSize: 12.5, letterSpacing: ".3px",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 0 0 2px #fff, 0 1px 3px rgba(0,0,0,.25)",
  }}>{initials}</div>
);

// Abstract node-network graphic in brand teal→magenta, echoing the Provana dot spiral
function HeroNetwork() {
  const { nodes, links } = useMemo(() => {
    let s = 7;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const W = 520, H = 380, N = 42;
    const nodes = Array.from({ length: N }, (_, i) => {
      const t = i / (N - 1);
      // bias toward a loose spiral / clustered cloud
      const ang = t * Math.PI * 3.4 + rnd() * 1.1;
      const rad = 60 + t * 150 + rnd() * 40;
      return {
        x: W / 2 + Math.cos(ang) * rad * 0.95 + (rnd() - 0.5) * 50,
        y: H / 2 + Math.sin(ang) * rad * 0.7 + (rnd() - 0.5) * 50,
        r: 2 + rnd() * 4.5, hue: t,
      };
    });
    const links = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (d < 70 && rnd() > 0.45) links.push([i, j, d]);
      }
    }
    return { nodes, links };
  }, []);
  // teal -> magenta interpolation
  const col = (t) => {
    const a = [52, 214, 165], b = [236, 72, 153];
    return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(",")})`;
  };
  return (
    <svg viewBox="0 0 520 380" style={{ width: "100%", height: "100%", overflow: "visible" }}>
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {links.map(([i, j], k) => (
        <line key={k} x1={nodes[i].x} y1={nodes[i].y} x2={nodes[j].x} y2={nodes[j].y}
          stroke={col((nodes[i].hue + nodes[j].hue) / 2)} strokeWidth="0.8" opacity={0.28} />
      ))}
      {nodes.map((n, k) => (
        <circle key={k} cx={n.x} cy={n.y} r={n.r} fill={col(n.hue)} opacity={0.92}
          filter={n.r > 4 ? "url(#glow)" : undefined}>
          <animate attributeName="opacity" values={`${0.55};0.95;${0.55}`} dur={`${3 + (k % 5)}s`} repeatCount="indefinite" begin={`${(k % 7) * 0.3}s`} />
        </circle>
      ))}
    </svg>
  );
}

Object.assign(window, { ProvanaLogo, Monogram, Avatar, HeroNetwork });
