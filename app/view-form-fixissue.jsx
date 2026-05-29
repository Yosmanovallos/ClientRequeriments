// VIEW — Fix Issue on a Report/Page
function ViewFormFixIssue({ go }) {
  const [behalf, setBehalf] = React.useState("Yosman Ovallos (yosman.ovallos@provana.com)");
  const [summary, setSummary] = React.useState("");
  const [existingReport, setExistingReport] = React.useState("");
  const [existingPage, setExistingPage] = React.useState("");
  const [filevine, setFilevine] = React.useState("");
  const [impact, setImpact] = React.useState("");
  const [issueDetails, setIssueDetails] = React.useState("");
  const [envs, setEnvs] = React.useState({ QA: false, Production: false, "No Preference": false });
  const [priority, setPriority] = React.useState("Medium");
  const [openPriority, setOpenPriority] = React.useState(false);
  const [due, setDue] = React.useState("");
  const [accordion, setAccordion] = React.useState(true);
  const [dragging, setDragging] = React.useState(false);
  const [files, setFiles] = React.useState([]);
  const fileInput = React.useRef(null);

  const toggleEnv = (k) => setEnvs((s) => ({ ...s, [k]: !s[k] }));
  const addFiles = (list) => setFiles((f) => [...f, ...Array.from(list).map((x) => x.name)]);

  return (
    <div className="view view-form">
      <TopNav go={go} />
      <PortalBanner />
      <div className="formcol">
        <FormCrumbs go={go} trail={[
          { label: "Provana Customer Portal", to: "portal" },
          { label: "BLG - Power BI Requests", to: "requests" },
          { label: "Fix Issue on a Report/Page" },
        ]} />
        <div className="req-head">
          <Monogram size={40} />
          <h1>BLG - Power BI Requests</h1>
        </div>
        <p className="req-sub">Welcome! You can raise a BI request for Bell Legal using the options provided.</p>

        <p className="whats">What can we help you with?</p>
        <button type="button" className="accordion" onClick={() => setAccordion((a) => !a)}>
          <span className="acc-icon"><IconWrench size={24} /></span>
          <span className="acc-text">
            <strong>Fix Issue on a Report/Page</strong>
            <span>Request bug fixes if you identified issues with existing reports.</span>
          </span>
          {accordion ? <IconChevU size={18} className="acc-caret" /> : <IconChevD size={18} className="acc-caret" />}
        </button>

        {accordion && (
          <form className="reqform" onSubmit={(e) => { e.preventDefault(); go("requests"); }}>
            <div className="note-box">
              <strong>NOTE:</strong> If the requested information for any of the following fields is included in an attached spreadsheet or document, please use the available fields in this form to specify its exact location within the file (e.g., sheet name, section, or page).
            </div>
            <p className="reqlegend">Required fields are marked with an asterisk <Req /></p>

            <Field label="Raise this request on behalf of" required>
              <div className="behalf">
                <span className="behalf-ava"><IconUser size={15} /></span>
                <span className="behalf-name">{behalf}</span>
                <button type="button" className="behalf-x" title="Clear" onClick={() => setBehalf("")}><IconX size={14} /></button>
                <IconChevD size={16} className="behalf-caret" />
              </div>
            </Field>

            <Field label="Request Summary" required sub="Provide a brief and concise overview of the request or issue.">
              <input className="txt" value={summary} onChange={(e) => setSummary(e.target.value)} />
            </Field>

            <Field label="Existing Report Name" required sub="Indicate the name of the existing report where the change or fix will be implemented.">
              <input className="txt" value={existingReport} onChange={(e) => setExistingReport(e.target.value)} />
            </Field>

            <Field label="Existing Page Name" required sub="Indicate the name of the existing page where the change or fix will be implemented.">
              <input className="txt" value={existingPage} onChange={(e) => setExistingPage(e.target.value)} />
            </Field>

            <Field label="Related Filevine ID" sub="Specify the Filevine project(s) that has the fields populated to appear in this report. (Used for QA purposes.)">
              <input className="txt" value={filevine} onChange={(e) => setFilevine(e.target.value)} />
            </Field>

            <Field label="Impacts Existing Automation" required sub="Please describe below in detail how this change will impact the existing automation.">
              <div className="radios">
                {["Yes", "No", "Unsure", "N/A"].map((o) => (
                  <label key={o} className="radio">
                    <input type="radio" name="impact-fi" checked={impact === o} onChange={() => setImpact(o)} />
                    <span className="dot" /><span>{o}</span>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Issue Details" required sub="Describe the situation, specify features to fix if applicable (page, slice or other).">
              <textarea className="txt txt-area" value={issueDetails} onChange={(e) => setIssueDetails(e.target.value)} />
            </Field>

            <Field label="Environment Selection" required sub="Select the environment where the report should be deployed.">
              <div className="checks">
                {["QA", "Production", "No Preference"].map((o) => (
                  <label key={o} className="check">
                    <input type="checkbox" checked={envs[o]} onChange={() => toggleEnv(o)} />
                    <span className="box"><svg viewBox="0 0 16 16" width="12" height="12"><path d="m3 8 3.5 3.5L13 4.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                    <span>{o}</span>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Priority" required sub="Highest, High, Medium, Low, Lowest (If the priority is set to Highest, all other tasks will be paused to prioritize this request.)">
              <div className="select-wrap">
                <SelectBox value={priority} onClick={() => setOpenPriority((o) => !o)} />
                {openPriority && (
                  <ul className="menu">
                    {["Highest", "High", "Medium", "Low", "Lowest"].map((o) => (
                      <li key={o} className={o === priority ? "sel" : ""} onClick={() => { setPriority(o); setOpenPriority(false); }}>{o}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Field>

            <Field label="Requested Due Date" required sub="Set a tentative due date. Final timing will be confirmed after review and planning.">
              <div className="datewrap">
                <input className="txt date" type="text" placeholder="e.g. 28/May/26" value={due}
                  onFocus={(e) => (e.target.type = "date")} onBlur={(e) => { if (!e.target.value) e.target.type = "text"; }}
                  onChange={(e) => setDue(e.target.value)} />
                <span className="date-ic"><IconCal size={17} /></span>
              </div>
            </Field>

            <Field label="Additional Notes" sub="Provide any other relevant information or special instructions, images or links from recordings.">
              <RTE variant="alt" />
            </Field>

            <Field label="Attachment" sub="Provide the documentation necessary to develop.">
              <div className={"dropzone dropzone-col" + (dragging ? " is-drag" : "")}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}>
                <span>Drag and drop files, paste screenshots, or browse</span>
                <button type="button" className="btn-browse" onClick={() => fileInput.current && fileInput.current.click()}>Browse</button>
                <input ref={fileInput} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
              </div>
              {files.length > 0 && (
                <ul className="filelist">
                  {files.map((f, i) => <li key={i}>{f} <button type="button" onClick={() => setFiles((s) => s.filter((_, k) => k !== i))}><IconX size={13} /></button></li>)}
                </ul>
              )}
            </Field>

            <Field label="Share with" required>
              <div className="sharewith">
                <span className="tag"><IconLock size={12} /> Share with Bell Legal Group <IconChevD size={13} style={{ marginLeft: 4, opacity: .6 }} /></span>
              </div>
            </Field>

            <div className="form-actions">
              <button type="submit" className="btn-send">Send</button>
              <button type="button" className="btn-cancel" onClick={() => go("requests")}>Cancel</button>
            </div>
          </form>
        )}
        <footer className="powered">Powered by <span className="pw-mark" /> Provana Service Management</footer>
      </div>
    </div>
  );
}

Object.assign(window, { ViewFormFixIssue });
