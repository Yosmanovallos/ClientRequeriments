// VIEW 3 — Request Form Detail ("New Report")
const { useState, useRef } = React;

const Req = () => <span className="req-star">*</span>;

function Field({ label, required, sub, children }) {
  return (
    <div className="field">
      <label className="field-label">{label}{required && <Req />}</label>
      {children}
      {sub && <p className="field-sub">{sub}</p>}
    </div>
  );
}

// Rich text toolbar — `set` is the toolbar layout variant
function RTE({ variant = "full", placeholder }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const exec = (cmd) => (e) => { e.preventDefault(); try { document.execCommand(cmd); } catch (_) {} ref.current && ref.current.focus(); };
  const Sep = () => <span className="rte-sep" />;
  const Btn = ({ Icon, label, cmd, wide }) => (
    <button type="button" className="rte-btn" title={label} onMouseDown={cmd ? exec(cmd) : (e) => e.preventDefault()}>
      <Icon size={17} />{wide && <IconChevD size={12} className="rte-caret" />}
    </button>
  );

  const styleDropdown = (
    <button type="button" className="rte-style" onMouseDown={(e) => e.preventDefault()}>
      Normal text <IconChevD size={13} />
    </button>
  );

  return (
    <div className={"rte" + (focused ? " is-focused" : "")}>
      <div className="rte-toolbar">
        {styleDropdown}
        <Sep />
        <Btn Icon={IconBold} label="Bold" cmd="bold" />
        <Btn Icon={IconItalic} label="Italic" cmd="italic" />
        {variant === "full" && <Btn Icon={IconDots} label="More" />}
        {variant === "alt" && <Btn Icon={IconAlign} label="Alignment" wide />}
        <Sep />
        <Btn Icon={IconColorA} label="Text color" wide />
        <Sep />
        <Btn Icon={IconBullet} label="Bullet list" cmd="insertUnorderedList" />
        <Btn Icon={IconNumList} label="Numbered list" cmd="insertOrderedList" />
        <Sep />
        <Btn Icon={IconLink} label="Link" />
        {variant === "full" && <Btn Icon={IconAt} label="Mention" />}
        {variant === "full" && <Btn Icon={IconEmoji} label="Emoji" />}
        {variant === "full" && <Btn Icon={IconTable} label="Table" />}
        <Btn Icon={IconCodeBlock} label="Code snippet" />
        <Btn Icon={IconInfo} label="Info panel" />
        <Btn Icon={IconQuote} label="Quote" />
        {variant === "alt" && <Btn Icon={IconDivider} label="Divider" />}
        {variant === "alt" && <Btn Icon={IconClearFmt} label="Clear formatting" />}
        {variant === "full" && <><Sep /><Btn Icon={IconPlus} label="Insert" wide /></>}
        {variant === "full" && <span style={{ marginLeft: "auto" }}><Btn Icon={IconChevD} label="Expand" /></span>}
      </div>
      <div className="rte-area" contentEditable suppressContentEditableWarning ref={ref}
        data-ph={placeholder || ""}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
    </div>
  );
}

function SelectBox({ value, placeholder, open, onClick, lock }) {
  return (
    <button type="button" className={"selectbox" + (value ? "" : " is-ph")} onClick={onClick}>
      <span className="selectbox-val">
        {lock && <IconLock size={14} style={{ marginRight: 6, opacity: .7 }} />}
        {value || placeholder}
      </span>
      <IconChevD size={16} className="selectbox-caret" />
    </button>
  );
}

function ViewForm({ go }) {
  const [behalf, setBehalf] = useState("Yosman Ovallos (yosman.ovallos@provana.com)");
  const [reportName, setReportName] = useState("");
  const [filevine, setFilevine] = useState("");
  const [impact, setImpact] = useState("");
  const [envs, setEnvs] = useState({ QA: false, Production: false, "No Preference": false });
  const [priority, setPriority] = useState("Medium");
  const [openPriority, setOpenPriority] = useState(false);
  const [pages, setPages] = useState("");
  const [openPages, setOpenPages] = useState(false);
  const [due, setDue] = useState("");
  const [accordion, setAccordion] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const fileInput = useRef(null);

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
          { label: "New Report" },
        ]} />
        <div className="req-head">
          <Monogram size={40} />
          <h1>BLG - Power BI Requests</h1>
        </div>
        <p className="req-sub">Welcome! You can raise a BI request for Bell Legal using the options provided.</p>

        <p className="whats">What can we help you with?</p>
        {/* accordion header */}
        <button type="button" className="accordion" onClick={() => setAccordion((a) => !a)}>
          <span className="acc-icon"><IconLaptop size={24} /></span>
          <span className="acc-text">
            <strong>New Report</strong>
            <span>Request development of completely new reports.</span>
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

            <Field label="Report Name" required sub="Specify the desired name for the new report.">
              <input className="txt" value={reportName} onChange={(e) => setReportName(e.target.value)} />
            </Field>

            <Field label="Related Filevine ID" sub="Specify the Filevine project(s) that has the fields populated to appear in this report. (Used for QA purposes.)">
              <input className="txt" value={filevine} onChange={(e) => setFilevine(e.target.value)} />
            </Field>

            <Field label="Impacts Existing Automation" required sub="Please describe below in detail how this change will impact the existing automation.">
              <div className="radios">
                {["Yes", "No", "Unsure", "N/A"].map((o) => (
                  <label key={o} className="radio">
                    <input type="radio" name="impact" checked={impact === o} onChange={() => setImpact(o)} />
                    <span className="dot" /><span>{o}</span>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Overall Report Goal" required sub="Describe the primary objective or questions the entire report aims to address, please offer as much details and context as you can.">
              <RTE variant="full" />
            </Field>

            <Field label="Report Audience" required sub="List the names or department of the intended audience for this report.">
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
                <SelectBox value={priority} onClick={() => { setOpenPriority((o) => !o); setOpenPages(false); }} />
                {openPriority && (
                  <ul className="menu">
                    {["Highest", "High", "Medium", "Low", "Lowest"].map((o) => (
                      <li key={o} className={o === priority ? "sel" : ""} onClick={() => { setPriority(o); setOpenPriority(false); }}>{o}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Field>

            <Field label="Share with" required>
              <div className="sharewith">
                <span className="tag"><IconLock size={12} /> Share with Bell Legal Group <IconChevD size={13} style={{ marginLeft: 4, opacity: .6 }} /></span>
              </div>
            </Field>

            <Field label="Number of Pages" sub="Indicate the total number of pages envisioned for the report.">
              <div className="select-wrap">
                <SelectBox value={pages} placeholder="Select..." onClick={() => { setOpenPages((o) => !o); setOpenPriority(false); }} />
                {openPages && (
                  <ul className="menu">
                    {["1", "2", "3", "4", "5", "6+"].map((o) => (
                      <li key={o} className={o === pages ? "sel" : ""} onClick={() => { setPages(o); setOpenPages(false); }}>{o}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Field>

            <Field label="Requested Due Date" sub="Set a tentative due date. Final timing will be confirmed after review and planning">
              <div className="datewrap">
                <input className="txt date" type="text" placeholder="e.g. 5/28/2026" value={due}
                  onFocus={(e) => (e.target.type = "date")} onBlur={(e) => { if (!e.target.value) e.target.type = "text"; }}
                  onChange={(e) => setDue(e.target.value)} />
                <span className="date-ic"><IconCal size={17} /></span>
              </div>
            </Field>

            <Field label="Additional Notes" sub="Provide any other relevant information or special instructions, images or links from recordings.">
              <RTE variant="alt" />
            </Field>

            <Field label="Attachment" sub="Provide the documentation necessary to develop.">
              <div className={"dropzone" + (dragging ? " is-drag" : "")}
                onClick={() => fileInput.current && fileInput.current.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}>
                <IconUploadCloud size={22} />
                <span>Drop files to attach or <span className="link">browse</span></span>
                <input ref={fileInput} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
              </div>
              {files.length > 0 && (
                <ul className="filelist">
                  {files.map((f, i) => <li key={i}>{f} <button type="button" onClick={() => setFiles((s) => s.filter((_, k) => k !== i))}><IconX size={13} /></button></li>)}
                </ul>
              )}
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

Object.assign(window, { ViewForm });
