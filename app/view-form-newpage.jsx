// VIEW — New Page (within an existing report)
function ViewFormNewPage({ go }) {
  const [behalf, setBehalf] = React.useState("Yosman Ovallos (yosman.ovallos@provana.com)");
  const [existingReport, setExistingReport] = React.useState("");
  const [pageName, setPageName] = React.useState("");
  const [filevine, setFilevine] = React.useState("");
  const [impact, setImpact] = React.useState("");
  const [visuals, setVisuals] = React.useState("");
  const [openVisuals, setOpenVisuals] = React.useState(false);
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

  const VISUALS = [
    "Bar / Column Chart", "Line Chart", "Pie Chart", "Donut Chart",
    "Table", "Matrix", "Card", "KPI", "Scatter Chart",
    "Map", "Treemap", "Funnel Chart", "Waterfall Chart", "Gauge", "Other",
  ];

  const closeAll = () => { setOpenVisuals(false); setOpenPriority(false); };

  return (
    <div className="view view-form">
      <TopNav go={go} />
      <PortalBanner />
      <div className="formcol">
        <FormCrumbs go={go} trail={[
          { label: "Provana Customer Portal", to: "portal" },
          { label: "BLG - Power BI Requests", to: "requests" },
          { label: "New Page (within an existing report)" },
        ]} />
        <div className="req-head">
          <Monogram size={40} />
          <h1>BLG - Power BI Requests</h1>
        </div>
        <p className="req-sub">Welcome! You can raise a BI request for Bell Legal using the options provided.</p>

        <p className="whats">What can we help you with?</p>
        <button type="button" className="accordion" onClick={() => setAccordion((a) => !a)}>
          <span className="acc-icon"><IconBook size={24} /></span>
          <span className="acc-text">
            <strong>New Page (within an existing report)</strong>
            <span>Add pages to existing reports.</span>
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

            <Field label="Existing Report Name" required sub="Specify the name of the existing report to which this new page will be added.">
              <input className="txt" value={existingReport} onChange={(e) => setExistingReport(e.target.value)} />
            </Field>

            <Field label="Page Name" required sub="Specify the desired name for this report page.">
              <input className="txt" value={pageName} onChange={(e) => setPageName(e.target.value)} />
            </Field>

            <Field label="Related Filevine ID" sub="Specify the filevine project(s) that has the fields populated to appear in this report. (Used for QA purposes.)">
              <input className="txt" value={filevine} onChange={(e) => setFilevine(e.target.value)} />
            </Field>

            <Field label="Impacts Existing Automation" required sub="Please describe below in detail how this change will impact the existing automation.">
              <div className="radios">
                {["Yes", "No", "Unsure", "N/A"].map((o) => (
                  <label key={o} className="radio">
                    <input type="radio" name="impact-np" checked={impact === o} onChange={() => setImpact(o)} />
                    <span className="dot" /><span>{o}</span>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Page Goal" required sub="Describe the primary objective or question this new page aims to address, please offer as much details and context as you can.">
              <RTE variant="full" />
            </Field>

            <Field label="Report Audience" required sub="List the names or department of the intended audience for this report.">
              <RTE variant="full" />
            </Field>

            <Field label="Fields and Sections (Filevine or Other Sources)" required sub="List the specific fields and their corresponding sections from Filevine or any other data sources to be included on this page. Please describe any new calculated fields or required metrics.">
              <RTE variant="full" />
            </Field>

            <Field label="Visuals Requested" required sub="Indicate the types of visualizations preferred for data representation on this page.">
              <div className="select-wrap">
                <SelectBox value={visuals} placeholder="Select..." onClick={() => { setOpenVisuals((o) => !o); setOpenPriority(false); }} />
                {openVisuals && (
                  <ul className="menu">
                    {VISUALS.map((o) => (
                      <li key={o} className={o === visuals ? "sel" : ""} onClick={() => { setVisuals(o); setOpenVisuals(false); }}>{o}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Field>

            <Field label="Requested Visuals Details" sub="Provide a detailed description of the selected visualizations, the data to be displayed, and any specific formatting or interaction requirements.">
              <RTE variant="alt" />
            </Field>

            <Field label="Filters" required sub="Filters work in the background to control what data is shown in the visuals. (E.g. only show results from specific Filevine phases.)">
              <RTE variant="full" />
            </Field>

            <Field label="Slicers" required sub="Slicers are fields on the report page that allow users to interactively filter data, such as a dropdown, list, or card. (E.g., the user can select a 'Project ID' from the list to view the associated data.)">
              <RTE variant="full" />
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
                <SelectBox value={priority} onClick={() => { setOpenPriority((o) => !o); setOpenVisuals(false); }} />
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

            <Field label="Attach any relevant files" sub="Provide the documentation necessary to develop.">
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

Object.assign(window, { ViewFormNewPage });
