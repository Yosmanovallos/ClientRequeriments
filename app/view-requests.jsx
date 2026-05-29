// VIEW 2 — Request Type Selection Portal
const REQUEST_TYPES = [
  { id: "new-report",   Icon: IconLaptop,   title: "New Report",                              desc: "Request development of completely new reports.",                                                                   route: "form" },
  { id: "new-page",     Icon: IconBook,     title: "New Page (within an existing report)",    desc: "Add pages to existing reports.",                                                                                   route: "newpage" },
  { id: "new-feature",  Icon: IconCloudUp,  title: "New feature on a Page/Report",            desc: "Request improvements and new features to a particular page in an existing report.",                               route: "newfeature" },
  { id: "fix-issue",    Icon: IconWrench,   title: "Fix Issue on a Report/Page",              desc: "Request bug fixes if you identified issues with existing reports.",                                                route: "fixissue" },
  { id: "view-request", Icon: IconCode,     title: "View Request",                            desc: "Request the creation of a new views or edition of existing views for tables in the data warehouse.",              route: "viewrequest" },
  { id: "data-eng",     Icon: IconDatabase, title: "Data Engineering Request",                desc: "Request development, maintenance or research tasks for data engineering." },
  { id: "other",        Icon: IconChats,    title: "Other Requests/Questions",                desc: "Use this section to request clarifications and other types of requests not covered by the available categories." },
];

function PortalBanner() {
  return (
    <div className="pbanner">
      <div className="pbanner-network"><HeroNetwork /></div>
    </div>
  );
}

function FormCrumbs({ trail, go }) {
  return (
    <nav className="formcrumbs">
      {trail.map((c, i) => (
        <span key={i} className="fc-item">
          {c.to
            ? <a onClick={() => go(c.to)}>{c.label}</a>
            : <span className="fc-current">{c.label}</span>}
          {i < trail.length - 1 && <span className="fc-sep">/</span>}
        </span>
      ))}
    </nav>
  );
}

function ViewRequests({ go }) {
  return (
    <div className="view view-requests">
      <TopNav go={go} />
      <PortalBanner />
      <div className="reqcol">
        <FormCrumbs go={go} trail={[
          { label: "Provana Customer Portal", to: "portal" },
          { label: "BLG - Power BI Requests" },
        ]} />
        <div className="req-head">
          <Monogram size={40} />
          <h1>BLG - Power BI Requests</h1>
        </div>
        <p className="req-sub">Welcome! You can raise a BI request for Bell Legal using the options provided.</p>

        <h2 className="whats">What can we help you with?</h2>
        <ul className="reqlist">
          {REQUEST_TYPES.map((r) => (
            <li key={r.id}>
              <button className={"reqitem" + (r.route ? " is-live" : "")}
                onClick={() => r.route && go(r.route)}>
                <span className="reqitem-icon"><r.Icon size={26} /></span>
                <span className="reqitem-text">
                  <strong>{r.title}</strong>
                  <span>{r.desc}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <footer className="powered">Powered by <span className="pw-mark" /> Provana Service Management</footer>
      </div>
    </div>
  );
}

Object.assign(window, { ViewRequests, FormCrumbs });
