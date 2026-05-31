import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { requestsApi } from '../api/requests';
import { attachmentsApi } from '../api/attachments';
import type { FormTemplate } from '../api/formTemplates';
import DynamicField from '../components/DynamicField';
import TopNav from '../components/layout/TopNav';
import PortalBanner from '../components/layout/PortalBanner';
import FormCrumbs from '../components/layout/FormCrumbs';
import Monogram from '../components/brand/Monogram';

interface Props {
  template: FormTemplate;
}

export default function ViewDynamicForm({ template }: Props) {
  const { go, activeProject, user } = useApp();

  // Text/richtext/select/radio/checkbox/date values keyed by field name
  const [values,       setValues]       = useState<Record<string, string>>({});
  // Pending file arrays keyed by attachment field name
  const [pendingFiles, setPendingFiles] = useState<Record<string, File[]>>({});

  const [submitting,   setSubmitting]   = useState(false);
  const [submitMsg,    setSubmitMsg]    = useState('');

  const fields = [...template.fieldSchema].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleChange = (name: string, value: string) =>
    setValues(prev => ({ ...prev, [name]: value }));

  const handleFilesChange = (name: string, files: File[]) =>
    setPendingFiles(prev => ({ ...prev, [name]: files }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;

    // Validate required rich-text fields (they may only contain empty <p></p>)
    for (const f of fields) {
      if (f.required && f.type === 'richtext') {
        const html = values[f.name] ?? '';
        const stripped = html.replace(/<[^>]*>/g, '').trim();
        if (!stripped) {
          setSubmitMsg(`Error: "${f.label}" is required.`);
          return;
        }
      }
      if (f.required && f.type === 'radio' && !values[f.name]) {
        setSubmitMsg(`Error: "${f.label}" is required.`);
        return;
      }
      if (f.required && f.type === 'checkbox' && !values[f.name]) {
        setSubmitMsg(`Error: Please select at least one option for "${f.label}".`);
        return;
      }
    }

    setSubmitting(true);
    setSubmitMsg('Submitting…');

    const priority  = values['priority']  ?? 'Medium';
    const dueDate   = values['dueDate']   ?? null;

    const requestType = template.slug.replace(/-/g, '_') as
      'new_report' | 'new_page' | 'new_feature' | 'fix_issue' | 'view_request';

    const firstTextField = fields.find(f => f.type === 'text');
    const title = (firstTextField ? values[firstTextField.name] : '') || template.name;

    // Exclude attachment fields from the payload (uploaded separately)
    const payloadValues = Object.fromEntries(
      Object.entries(values).filter(([k]) => {
        const fd = fields.find(f => f.name === k);
        return fd?.type !== 'attachment';
      }),
    );

    const { data, error } = await requestsApi.create({
      requestType,
      title,
      priority,
      dueDate:   dueDate || null,
      projectId: activeProject.id,
      payload:   { ...payloadValues, templateId: template.id },
    });

    if (error) {
      setSubmitting(false);
      setSubmitMsg('Error: ' + error.message);
      return;
    }

    const created = data as { id: string; reference: string };

    // Upload any pending files
    const allFiles = Object.values(pendingFiles).flat();
    if (allFiles.length > 0) {
      const { succeeded, failed } = await attachmentsApi.uploadAll(
        created.id,
        allFiles,
        status => setSubmitMsg(status),
      );
      if (failed > 0) {
        setSubmitting(false);
        setSubmitMsg(
          `Request ${created.reference} submitted. ${succeeded} file(s) uploaded, ${failed} failed.`,
        );
        setTimeout(() => go('requests'), 3000);
        return;
      }
    }

    setSubmitting(false);
    setSubmitMsg(`Request ${created.reference} submitted successfully!`);
    setTimeout(() => go('requests'), 2000);
  };

  // "Raise this request on behalf of" — read-only current user chip
  const displayName = user?.displayName ?? user?.email ?? 'You';
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? '').join('') || 'Y';

  return (
    <div className="view view-form">
      <TopNav />
      <PortalBanner />
      <div className="formcol">
        <FormCrumbs trail={[
          { label: 'Provana Customer Portal', to: 'portal' },
          { label: activeProject?.name ?? 'Project', to: 'requests' },
          { label: template.name },
        ]} />

        <div className="req-head">
          <Monogram size={40} />
          <h1>{activeProject?.name ?? 'Request'}</h1>
        </div>
        {template.description && (
          <p className="req-sub">{template.description}</p>
        )}

        {/* NOTE box matching the reference design */}
        <div className="note-box">
          <strong>NOTE:</strong> If the requested information for any of the following fields is
          included in an attached spreadsheet or document, please use the available fields in
          this form to specify its exact location within the file (e.g., sheet name, section, or page).
        </div>

        <p className="reqlegend">
          Required fields are marked with an asterisk <span className="req-star">*</span>
        </p>

        {/* "Raise this request on behalf of" chip */}
        <div className="field">
          <label className="field-label">Raise this request on behalf of</label>
          <div className="behalf">
            <div className="behalf-ava" style={{ fontSize: 11, fontWeight: 700 }}>{initials}</div>
            <span className="behalf-name">{displayName}{user?.email ? ` (${user.email})` : ''}</span>
            <span className="behalf-caret">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>
        </div>

        <form className="reqform" onSubmit={handleSubmit}>
          {fields.map(field => (
            <DynamicField
              key={field.name}
              field={field}
              value={values[field.name] ?? ''}
              onChange={handleChange}
              onFilesChange={handleFilesChange}
              pendingFiles={pendingFiles[field.name] ?? []}
            />
          ))}

          <div className="form-actions">
            <button type="submit" className="btn-send" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send'}
            </button>
            <button type="button" className="btn-cancel" onClick={() => go('requests')}>
              Cancel
            </button>
          </div>

          {submitMsg && (
            <div className={submitMsg.startsWith('Error') ? 'submit-error' : 'submit-success'}>
              {submitMsg}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
