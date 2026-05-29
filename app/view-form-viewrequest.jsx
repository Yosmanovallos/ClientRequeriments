// VIEW — View Request
function ViewFormViewRequest({ go }) {
  const [behalf, setBehalf] = React.useState("Yosman Ovallos (yosman.ovallos@provana.com)");
  const [reqType, setReqType] = React.useState("");
  const [openReqType, setOpenReqType] = React.useState(false);
  const [viewName, setViewName] = React.useState("");
  const [filevine, setFilevine] = React.useState("");
  const [impact, setImpact] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [priority, setPriority] = React.useState("Medium");
  const [openPriority, setOpenPriority] = React.useState(false);
  const [due, setDue] = React.useState("");
  const [accordion, setAccordion] = React.useState(true);
  const [dragging, setDragging] = React.useState(false);
  const [files, setFiles] = React.useState([]);
  const fileInput = React.useRef(null);

  const addFiles = (list) => setFiles((f) => [...f, ...Array.from(list).map((x) => x.name)]);

  const REQ_TYPES = ["New View", "Edit Existing View", "Delete View", "Other"];

  return (
    <div className="view view-form">
      <TopNav go={go} />
      <PortalBanner />
      <div className="formcol">
        <FormCrumbs go={go} trail={[
          { label: "Provana Customer Portal", to: "portal" },
          { label: "BLG - Power BI Requests", to: "requests" },
          { label: "View Request" },
        ]} />
        <div className="req-head">
          <Monogram size={40} />
          <h1>BLG - Power BI Requests</h1>
        </div>
        <p className="req-sub">Welcome! You can raise a BI request for Bell Legal using the options provided.</p>

        <p className="whats">What can we help you with?</p>
        <button type="button" className="accordion" onClick={() => setAccordion((a) => !a)}>
          <span className="acc-icon"><IconCode size={24} /></span>
          <span className="acc-text">
            <strong>View Request</strong>
            <span>Request the creation of a new views or edition of existing views for tables in the data warehouse.</span>
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

            <Field label="Type of Request" required sub="Specify the type of request.">
              <div className="select-wrap">
                <SelectBox value={reqType} placeholder="Select..." onClick={() => { setOpenReqType((o) => !o); setOpenPriority(false); }} />
                {openReqType && (
                  <ul className="menu">
                    {REQ_TYPES.map((o) => (
                      <li key={o} className={o === reqType ? "sel" : ""} onClick={() => { setReqType(o); setOpenReqType(false); }}>{o}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Field>

            <Field label="Name of the View" required sub="Indicate the name of the view.">
              <input className="txt" value={viewName} onChange={(e) => setViewName(e.target.value)} />
            </Field>

            <Field label="Related Filevine ID" sub="Specify the Filevine project(s) that has the fields populated to appear in this report. (Used for QA purposes.)">
              <input className="txt" value={filevine} onChange={(e) => setFilevine(e.target.value)} />
            </Field>

            <Field label="Impacts Existing Automation" required sub="Please describe below in detail how this change will impact the existing automation.">
              <div className="radios">
                {["Yes", "No", "Unsure", "N/A"].map((o) => (
                  <label key={o} className="radio">
                    <input type="radio" name="impact-vr" checked={impact === o} onChange={() => setImpact(o)} />
                    <span className="dot" /><span>{o}</span>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Details" required sub="Describe the view or change and its intended functionality clearly and specifically.">
              <textarea className="txt txt-area" value={details} onChange={(e) => setDetails(e.target.value)} />
            </Field>

            <Field label="Goal or Objective of the request" required sub="Explain the reason behind the request—what business question or need it addresses.">
              <RTE variant="full" />
            </Field>

            <Field label="Fields and Sections (Filevine or Other Sources)" required sub="List the specific fields and their corresponding sections from Filevine or any other data sources to be included on this page. Please describe any new calculated fields or required metrics.">
              <RTE variant="full" />
            </Field>

            <Field label="Conditions of Inclusion or Exclusion" required sub="List the specific inclusions and/or exclusions that the view should have.">
              <RTE variant="full" />
            </Field>

            <Field label="Priority" required sub="Highest, High, Medium, Low, Lowest (If the priority is set to Highest, all other tasks will be paused to prioritize this request.)">
              <div className="select-wrap">
                <SelectBox value={priority} onClick={() => { setOpenPriority((o) => !o); setOpenReqType(false); }} />
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

Object.assign(window, { ViewFormViewRequest });
