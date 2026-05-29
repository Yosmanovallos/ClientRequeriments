// VIEW 5 — Profile  &  VIEW 6 — Requests list
const { useState: useAS } = React;

function BigAvatar({ initials = "YO", size = 120 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flex: "none",
      background: "linear-gradient(135deg, #34d6a5 0%, #2bb5c0 100%)",
      color: "#0b2e2a", fontWeight: 700, fontSize: size * 0.3, letterSpacing: "1px",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 6px 20px rgba(43,181,192,.3)",
    }}>{initials}</div>
  );
}

function ViewProfile({ go }) {
  return (
    <div className="view view-profile">
      <TopNav go={go} />
      <PortalBanner />
      <div className="accountcol">
        <FormCrumbs go={go} trail={[{ label: "Provana Customer Portal", to: "portal" }]} />
        <h1 className="account-title">Profile</h1>
        <div className="profile-grid">
          <div className="profile-left"><BigAvatar /></div>
          <div className="profile-right">
            <section className="acc-section">
              <h2>Personal details</h2>
              <div className="acc-row"><span className="acc-label">Name</span><span className="acc-val">Yosman Ovallos</span></div>
              <div className="acc-row"><span className="acc-label">Email</span><span className="acc-val">yosman.ovallos@provana.com</span></div>
              <a className="acc-link">Manage your account</a>
            </section>
            <section className="acc-section">
              <h2>Language and time zone</h2>
              <div className="acc-row"><span className="acc-label">Language</span><span className="acc-val">English (United States)</span></div>
              <div className="acc-row"><span className="acc-label">Time zone</span><span className="acc-val">(GMT-05:00) Chicago</span></div>
              <a className="acc-link">Edit account preferences</a>
            </section>
          </div>
        </div>
        <footer className="powered">Powered by <span className="pw-mark" /> Provana Service Management</footer>
      </div>
    </div>
  );
}

// ---- View 6 data ----
const STATUS = {
  "IN REVIEW": "blue", "CUSTOMER FEEDBACK": "blue", "IN DEVELOPMENT": "blue",
  "APPROVED": "green", "UAT": "green",
};
const REQ_ROWS = [
  { Icon: IconWrench, ref: "CBLPBR-627", sum: "2 claims marked as BLG only but aren't BLG only (CLJ Dual Rep Report - DW; Internal Dual Rep page)", status: "IN REVIEW", req: "Gabby Gast", created: "Today", updated: "Today", due: "Today", pri: "High" },
  { Icon: IconCloudUp, ref: "CBLPBR-628", sum: "Update frequency criteria on both pages to repeat > 21 days", status: "IN REVIEW", req: "Cacia Stavros", created: "Today", updated: "Today", due: "31/May/26", pri: "High" },
  { Icon: IconBook, ref: "CBLPBR-626", sum: "BC Missing: Check File/Outreach (Repeats > 21 days)", status: "APPROVED", req: "Cacia Stavros", created: "Today", updated: "Today", due: "31/May/26", pri: "High" },
  { Icon: IconBook, ref: "CBLPBR-562", sum: "Process DC in Claimant CC", status: "CUSTOMER FEEDBACK", req: "Gabby Gast", created: "09/Apr/26", updated: "Today", due: "13/Apr/26", pri: "High" },
  { Icon: IconBook, ref: "CBLPBR-625", sum: "CLJ Task Productivity", status: "IN DEVELOPMENT", req: "Gabby Gast", created: "Today", updated: "Today", due: "Yesterday", pri: "Highest" },
  { Icon: IconBook, ref: "CBLPBR-622", sum: "DON Confirmed Dual Reps", status: "IN DEVELOPMENT", req: "Gabby Gast", created: "Yesterday", updated: "Today", due: "Yesterday", pri: "Highest" },
  { Icon: IconCloudUp, ref: "CBLPBR-624", sum: "Add total counters in the tables of the CLJ Task Productivity Analytics (Data Integrity Review - DW)", status: "UAT", req: "Gabby Gast", created: "Yesterday", updated: "Yesterday", due: "Yesterday", pri: "High" },
  { Icon: IconWrench, ref: "CBLPBR-610", sum: "Diseases in visual are duplicated - # of Offers by Disease in CLJ Executive Council - DW's EO", status: "CUSTOMER FEEDBACK", req: "Gabby Gast", created: "14/May/26", updated: "Yesterday", due: "13/May/26", pri: "Highest" },
];

function Priority({ level }) {
  const chev = (
    <svg viewBox="0 0 16 16" width="12" height="12" style={{ display: "block" }}>
      <path d="M3 10l5-5 5 5" fill="none" stroke="#cd1317" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  return (
    <span className="priority">
      <span className="pri-chevs" style={{ marginRight: -4 }}>
        {chev}{level === "Highest" && <span style={{ marginTop: -7 }}>{chev}</span>}
      </span>
      <span style={{ marginLeft: 6 }}>{level}</span>
    </span>
  );
}

function FilterPill({ label, active, hasCaret = true }) {
  return (
    <button className={"filter-pill" + (active ? " is-active" : "")}>
      {label}{hasCaret && <IconChevD size={14} />}
    </button>
  );
}

function ViewRequestsList({ go }) {
  const [query, setQuery] = useAS("");
  const rows = REQ_ROWS.filter((r) => r.sum.toLowerCase().includes(query.toLowerCase()) || r.ref.toLowerCase().includes(query.toLowerCase()));
  const cols = ["Type", "Reference", "Summary", "Status", "Service project", "Requester", "Created date", "Updated date", "Due date", "Priority"];
  return (
    <div className="view view-reqlist">
      <TopNav go={go} />
      <PortalBanner />
      <div className="listcol">
        <FormCrumbs go={go} trail={[{ label: "Provana Customer Portal", to: "portal" }]} />
        <div className="list-head">
          <h1 className="account-title" style={{ margin: 0 }}>Requests</h1>
          <button className="btn-outline">Edit list view</button>
        </div>

        <div className="filterbar">
          <label className="filter-search">
            <IconSearch size={16} />
            <input placeholder="Request contains..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <FilterPill label="Status: Open requests" active />
          <FilterPill label="All" />
          <FilterPill label="Request type" />
        </div>

        <div className="table-scroll">
          <table className="reqtable">
            <thead>
              <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ref}>
                  <td className="t-icon"><span><r.Icon size={22} /></span></td>
                  <td className="t-ref">{r.ref}</td>
                  <td className="t-sum">{r.sum}</td>
                  <td><span className={"badge badge-" + STATUS[r.status]}>{r.status}</span></td>
                  <td className="t-proj">BLG - Power BI Requests</td>
                  <td className="t-req">{r.req}</td>
                  <td className="t-date">{r.created}</td>
                  <td className="t-date">{r.updated}</td>
                  <td className="t-date">{r.due}</td>
                  <td><Priority level={r.pri} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={cols.length} className="t-empty">No requests match your search.</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="powered">Powered by <span className="pw-mark" /> Provana Service Management</footer>
      </div>
    </div>
  );
}

Object.assign(window, { ViewProfile, ViewRequestsList });
