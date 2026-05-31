import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { requestsApi } from '../api/requests';
import { attachmentsApi } from '../api/attachments';
import AttachmentsPicker from '../components/AttachmentsPicker';
import TopNav from '../components/layout/TopNav';
import PortalBanner from '../components/layout/PortalBanner';
import FormCrumbs from '../components/layout/FormCrumbs';
import Monogram from '../components/brand/Monogram';
import { IconCode } from '../components/Icons';

/** View Request (data warehouse view) — POSTs requestType: 'view_request' */
export default function ViewFormViewRequest() {
  const { go } = useApp();
  const [reqType,        setReqType]        = useState('');
  const [viewName,       setViewName]       = useState('');
  const [filevine,       setFilevine]       = useState('');
  const [impact,         setImpact]         = useState('');
  const [details,        setDetails]        = useState('');
  const [goal,           setGoal]           = useState('');
  const [fields,         setFields]         = useState('');
  const [conditions,     setConditions]     = useState('');
  const [priority,       setPriority]       = useState('Medium');
  const [due,            setDue]            = useState('');
  const [notes,          setNotes]          = useState('');
  const [files,          setFiles]          = useState<File[]>([]);
  const [submitting,     setSubmitting]     = useState(false);
  const [submitMsg,      setSubmitMsg]      = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setSubmitMsg('');
    const title = viewName || 'View Request';
    const { data, error } = await requestsApi.create({
      requestType: 'view_request',
      title,
      priority,
      dueDate: due || null,
      payload: {
        typeOfRequest: reqType, viewName,
        filevineId: filevine, impactsExistingAutomation: impact,
        details, goal, fields, conditions,
        notes,
      },
    });
    if (error) { setSubmitting(false); setSubmitMsg('Error: ' + error.message); return; }
    const created = data as { id: string; reference: string };
    const { failed } = await attachmentsApi.uploadAll(created.id, files, setSubmitMsg);
    setSubmitting(false);
    setSubmitMsg(failed > 0
      ? `Request ${created.reference} submitted, but ${failed} attachment(s) failed.`
      : `Request ${created.reference} submitted!`);
    setTimeout(() => go('myrequests'), 1800);
  };

  return (
    <div className="view view-form">
      <TopNav />
      <PortalBanner />
      <div className="formcol">
        <FormCrumbs trail={[
          { label: 'Provana Customer Portal',     to: 'portal' },
          { label: 'BLG - Power BI Requests',     to: 'requests' },
          { label: "View Request" },
        ]} />
        <div className="req-head">
          <Monogram size={40} />
          <h1>BLG - Power BI Requests</h1>
        </div>
        <p className="req-sub">Welcome! You can raise a BI request for Bell Legal using the options provided.</p>
        <p className="whats">What can we help you with?</p>
        <div className="accordion">
          <span className="acc-icon"><IconCode size={24} /></span>
          <span className="acc-text">
            <strong>View Request</strong>
            <span>Request the creation of new views or edition of existing views for tables in the data warehouse.</span>
          </span>
        </div>

        <form className="reqform" onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Type of Request <span style={{ color: '#de350b' }}>*</span></label>
            <select className="txt" value={reqType} onChange={e => setReqType(e.target.value)} required style={{ height: 42 }}>
              <option value="">Select…</option>
              {['New View', 'Edit Existing View', 'Delete View', 'Other'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Name of the View <span style={{ color: '#de350b' }}>*</span></label>
            <input className="txt" value={viewName} onChange={e => setViewName(e.target.value)} required />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Related Filevine ID</label>
            <input className="txt" value={filevine} onChange={e => setFilevine(e.target.value)} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Impacts Existing Automation <span style={{ color: '#de350b' }}>*</span></label>
            <div style={{ display: 'flex', gap: 20, marginTop: 8, flexWrap: 'wrap' }}>
              {['Yes', 'No', 'Unsure', 'N/A'].map(o => (
                <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 14 }}>
                  <input type="radio" name="impact-vr" checked={impact === o} onChange={() => setImpact(o)} />
                  {o}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Details <span style={{ color: '#de350b' }}>*</span></label>
            <textarea className="txt txt-area" value={details} onChange={e => setDetails(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Goal or Objective of the Request <span style={{ color: '#de350b' }}>*</span></label>
            <textarea className="txt txt-area" value={goal} onChange={e => setGoal(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Fields and Sections <span style={{ color: '#de350b' }}>*</span></label>
            <textarea className="txt txt-area" value={fields} onChange={e => setFields(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Conditions of Inclusion / Exclusion <span style={{ color: '#de350b' }}>*</span></label>
            <textarea className="txt txt-area" value={conditions} onChange={e => setConditions(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Priority <span style={{ color: '#de350b' }}>*</span></label>
            <select className="txt" value={priority} onChange={e => setPriority(e.target.value)} style={{ height: 42 }}>
              {['Highest', 'High', 'Medium', 'Low', 'Lowest'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Requested Due Date</label>
            <input className="txt" type="date" value={due} onChange={e => setDue(e.target.value)} style={{ maxWidth: 240 }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Additional Notes</label>
            <textarea className="txt txt-area" value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%' }} />
          </div>

          <AttachmentsPicker files={files} onChange={setFiles} />

          <div className="form-actions">
            <button type="submit" className="btn-send" disabled={submitting}>{submitting ? 'Sending…' : 'Send'}</button>
            <button type="button" className="btn-cancel" onClick={() => go('requests')}>Cancel</button>
          </div>
          {submitMsg && <div className={submitMsg.startsWith('Error') ? 'submit-error' : 'submit-success'}>{submitMsg}</div>}
        </form>
      </div>
    </div>
  );
}
