import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { requestsApi } from '../api/requests';
import { attachmentsApi } from '../api/attachments';
import AttachmentsPicker from '../components/AttachmentsPicker';
import TopNav from '../components/layout/TopNav';
import PortalBanner from '../components/layout/PortalBanner';
import FormCrumbs from '../components/layout/FormCrumbs';
import Monogram from '../components/brand/Monogram';
import { IconLaptop } from '../components/Icons';

/** New Report form — wired to POST /api/requests, then POST /api/requests/:id/attachments per file */
export default function ViewForm() {
  const { go } = useApp();
  const [reportName, setReportName] = useState('');
  const [filevine,   setFilevine]   = useState('');
  const [impact,     setImpact]     = useState('');
  const [priority,   setPriority]   = useState('Medium');
  const [due,        setDue]        = useState('');
  const [overallGoal,setOverallGoal]= useState('');
  const [audience,   setAudience]   = useState('');
  const [notes,      setNotes]      = useState('');
  const [envs,       setEnvs]       = useState({ QA: false, Production: false, 'No Preference': false });
  const [files,      setFiles]      = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg,  setSubmitMsg]  = useState('');

  const toggleEnv = (k: string) => setEnvs(s => ({ ...s, [k]: !s[k as keyof typeof s] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setSubmitMsg('');
    const { data, error } = await requestsApi.create({
      requestType: 'new_report',
      title:       reportName || 'New Report',
      priority,
      dueDate:     due || null,
      payload: {
        filevineId: filevine,
        impactsExistingAutomation: impact,
        overallGoal, audience,
        environments: Object.keys(envs).filter(k => envs[k as keyof typeof envs]),
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
          { label: 'New Report' },
        ]} />
        <div className="req-head">
          <Monogram size={40} />
          <h1>BLG - Power BI Requests</h1>
        </div>
        <p className="req-sub">Welcome! You can raise a BI request for Bell Legal using the options provided.</p>
        <p className="whats">What can we help you with?</p>
        <div className="accordion">
          <span className="acc-icon"><IconLaptop size={24} /></span>
          <span className="acc-text">
            <strong>New Report</strong>
            <span>Request development of completely new reports.</span>
          </span>
        </div>

        <form className="reqform" onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Report Name <span style={{ color: '#de350b' }}>*</span></label>
            <input className="txt" value={reportName} onChange={e => setReportName(e.target.value)} required />
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
                  <input type="radio" name="impact" checked={impact === o} onChange={() => setImpact(o)} />
                  {o}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Overall Report Goal <span style={{ color: '#de350b' }}>*</span></label>
            <textarea className="txt txt-area" value={overallGoal} onChange={e => setOverallGoal(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Report Audience <span style={{ color: '#de350b' }}>*</span></label>
            <textarea className="txt txt-area" value={audience} onChange={e => setAudience(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Environment Selection <span style={{ color: '#de350b' }}>*</span></label>
            {(['QA', 'Production', 'No Preference'] as const).map(o => (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={envs[o]} onChange={() => toggleEnv(o)} />
                {o}
              </label>
            ))}
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
