// VIEW 1 — Main Help Center Portal
const PORTALS = [
  { id: "blg-pbi", title: "BLG - Power BI Requests", body: "Welcome! You can raise a BI request for Bell Legal using the options provided.", kind: "mono", clickable: true },
  { id: "blg-neo", title: "BLG-Neodeluxe requests", body: "Welcome! You can submit a request to the Neodeluxe team using the options provided.", kind: "mono" },
  { id: "support", title: "Provana Customer Support", body: "Welcome! You can raise a request for Provana Customer Support using the options provided.", kind: "support" },
];

function Breadcrumbs() {
  return (
    <div className="crumbstrip">
      <span className="crumb-apps"><IconGrid size={18} /></span>
      <span className="crumb-div" />
      <span className="crumb"><IconFolder size={16} /> jira</span>
      <IconChevR size={13} className="crumb-sep" />
      <span className="crumb"><IconFolder size={16} /> Documentation</span>
      <IconChevR size={13} className="crumb-sep" />
      <span className="crumb"><IconFolder size={16} /> Quality Assurance</span>
    </div>
  );
}

function TopNav({ go, dark }) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef(null);
  React.useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const nav = (v) => { setOpen(false); go && go(v); };
  return (
    <header className={"topnav" + (dark ? " topnav-dark" : "")}>
      <button className="logo-btn" onClick={() => go && go("portal")} title="Provana Customer Portal">
        <ProvanaLogo height={30} />
      </button>
      <div style={{ flex: 1 }} />
      <button className="nav-search-btn" title="Search"><IconSearch size={20} /></button>
      <div className="avatar-wrap" ref={wrapRef}>
        <button className="avatar-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Avatar />
        </button>
        {open && (
          <div className="profile-menu" role="menu">
            <div className="pm-head">
              <Avatar size={40} />
              <div className="pm-id">
                <strong>Yosman Ovallos</strong>
                <span>yosman.ovallos@provana.com</span>
              </div>
            </div>
            <div className="pm-div" />
            <button className="pm-item" onClick={() => nav("myrequests")}>Requests</button>
            <button className="pm-item" onClick={() => nav("profile")}>Profile</button>
            <div className="pm-div" />
            <button className="pm-item" onClick={() => nav("portal")}>Log out</button>
          </div>
        )}
      </div>
    </header>
  );
}

function SupportBadge({ size = 46 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flex: "none",
      background: "linear-gradient(135deg, #4A2E80 0%, #6d3fb0 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "inset 0 1px 2px rgba(255,255,255,.2)",
    }}>
      <span style={{ color: "#fff", display: "flex" }}><IconChats size={size * 0.5} /></span>
    </div>
  );
}

function PortalCard({ p, onOpen }) {
  return (
    <button className={"portal-card" + (p.clickable ? " is-live" : "")}
      onClick={() => p.clickable && onOpen()}>
      <div className="portal-icon">{p.kind === "support" ? <SupportBadge /> : <Monogram />}</div>
      <div className="portal-text">
        <h3>{p.title}</h3>
        <p>{p.body}</p>
      </div>
    </button>
  );
}

function ViewPortal({ go }) {
  return (
    <div className="view view-portal">
      <Breadcrumbs />
      <TopNav go={go} />
      <section className="hero">
        <div className="hero-network"><HeroNetwork /></div>
        <div className="hero-inner">
          <h1>Welcome to the Help Center!</h1>
          <label className="hero-search">
            <IconSearch size={22} />
            <input placeholder="Search for information" />
          </label>
        </div>
      </section>

      <main className="portal-body">
        <h2 className="section-title">Portals</h2>
        <div className="portals-grid">
          {PORTALS.map((p) => (
            <PortalCard key={p.id} p={p} onOpen={() => go("requests")} />
          ))}
        </div>

        <h2 className="section-title" style={{ marginTop: 44 }}>Recently used request forms</h2>
        <button className="recent-row" onClick={() => go("requests")}>
          <span className="recent-icon"><IconChats size={26} /></span>
          <span className="recent-text">
            <strong>Other Requests/Questions in BLG - Power BI Requests</strong>
            <span>Use this section to request clarifications and other types of requests not covered by the available categories.</span>
          </span>
        </button>
      </main>
    </div>
  );
}

Object.assign(window, { ViewPortal });
