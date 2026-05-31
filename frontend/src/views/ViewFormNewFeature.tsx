import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { requestsApi } from '../api/requests';
import { attachmentsApi } from '../api/attachments';
import AttachmentsPicker from '../components/AttachmentsPicker';
import TopNav from '../components/layout/TopNav';
import PortalBanner from '../components/layout/PortalBanner';
import FormCrumbs from '../components/layout/FormCrumbs';
import Monogram from '../components/brand/Monogram';
import { IconCloudUp } from '../components/Icons';

/** New Feature on a Page/Report — POSTs requestType: 'new_feature' */
export default function ViewFormNewFeature() {
  const { go } = useApp();
  const [existingReport, setExistingReport] = useState('');
  const [existingPage,   setExistingPage]   = useState('');
  const [featureDesc,    setFeatureDesc]    = useState('');
  const [filevine,       setFilevine]       = useState('');
  const [impact,         setImpact]         = useState('');
  const [goal,           setGoal]           = useState('');
  const [audience,       setAudience]       = useState('');
  const [fields,         setFields]         = useState('');
  const [priority,       setPriority]       = useState('Medium');
  const [due,            setDue]            = useState('');
  const [notes,          setNotes]          = useState('');
  const [envs,           setEnvs]           = useState({ QA: false, Production: false, 'No Preference': false });
  const [files,          setFiles]          = useState<File[]>([]);
  const [submitting,     setSubmitting]     = useState(false);
  const [submitMsg,      setSubmitMsg]      = useState('');

  const toggleEnv = (k: string) => setEnvs(s => ({ ...s, [k]: !s[k as keyof typeof s] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setSubmitMsg('');
    const title = featureDesc || `Feature on ${existingReport || 'a report'} / ${existingPage || 'a page'}`;
    const { data, error } = await requestsApi.create({
      requestType: 'new_feature',
      title,
      priority,
      dueDate: due || null,
      payload: {
        existingReport, existingPage, featureDescription: featureDesc,
        filevineId: filevine, impactsExistingAutomation: impact,
        goal, audience, fields,
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
          { label: "New feature on a Page/Report" },
        ]} />
        <div className="req-head">
          <Monogram size={40} />
          <h1>BLG - Power BI Requests</h1>
        </div>
        <p className="req-sub">Welcome! You can raise a BI request for Bell Legal using the options provided.</p>
        <p className="whats">What can we help you with?</p>
        <div className="accordion">
          <span className="acc-icon"><IconCloudUp size={24} /></span>
          <span className="acc-text">
            <strong>New feature on a Page/Report</strong>
            <span>Request improvements and new features to a particular page in an existing report.</span>
          </span>
        </div>

        <form className="reqform" onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Existing Report Name <span style={{ color: '#de350b' }}>*</span></label>
            <input className="txt" value={existingReport} onChange={e => setExistingReport(e.target.value)} required />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Existing Page Name <span style={{ color: '#de350b' }}>*</span></label>
            <input className="txt" value={existingPage} onChange={e => setExistingPage(e.target.value)} required />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Feature Description <span style={{ color: '#de350b' }}>*</span></label>
            <input className="txt" value={featureDesc} onChange={e => setFeatureDesc(e.target.value)} required />
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
                  <input type="radio" name="impact-nf" checked={impact === o} onChange={() => setImpact(o)} />
                  {o}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Goal or Objective of the Feature <span style={{ color: '#de350b' }}>*</span></label>
            <textarea className="txt txt-area" value={goal} onChange={e => setGoal(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Report Audience <span style={{ color: '#de350b' }}>*</span></label>
            <textarea className="txt txt-area" value={audience} onChange={e => setAudience(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Fields and Sections</label>
            <textarea className="txt txt-area" value={fields} onChange={e => setFields(e.target.value)} style={{ width: '100%' }} />
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
