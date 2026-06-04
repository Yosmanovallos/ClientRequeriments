import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { requestsApi } from '../api/requests';
import { attachmentsApi } from '../api/attachments';
import { orgsApi, type Organization } from '../api/admin';
import type { FormTemplate } from '../api/formTemplates';
import { evaluateConditions } from '../lib/conditionEngine';
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

  // Organization picker
  const [orgs,           setOrgs]           = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState<string>('');

  useEffect(() => {
    if (!activeProject) return;
    orgsApi.list(activeProject.id).then(({ data }) => {
      const list = data?.data ?? [];
      setOrgs(list);
      if (list.length === 1) setOrganizationId(list[0].id);
    });
  }, [activeProject?.id]);

  const fields = useMemo(
    () => [...template.fieldSchema].sort((a, b) => a.sortOrder - b.sortOrder),
    [template.fieldSchema],
  );

  // Evaluate conditions on every form value change — drives visibility + required state
  const fieldStates = useMemo(
    () => evaluateConditions(fields, values),
    [fields, values],
  );

  const handleChange = (name: string, value: string) =>
    setValues(prev => ({ ...prev, [name]: value }));

  const handleFilesChange = (name: string, files: File[]) =>
    setPendingFiles(prev => ({ ...prev, [name]: files }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;

    // Validate visible required fields (hidden fields are skipped)
    for (const f of fields) {
      const state = fieldStates.get(f.name) ?? { visible: true, required: f.required };
      if (!state.visible) continue;

      if (state.required && f.type === 'richtext') {
        const html = values[f.name] ?? '';
        const stripped = html.replace(/<[^>]*>/g, '').trim();
        if (!stripped) {
          setSubmitMsg(`Error: "${f.label}" is required.`);
          return;
        }
      }
      if (state.required && f.type === 'radio' && !values[f.name]) {
        setSubmitMsg(`Error: "${f.label}" is required.`);
        return;
      }
      if (state.required && f.type === 'checkbox' && !values[f.name]) {
        setSubmitMsg(`Error: Please select at least one option for "${f.label}".`);
        return;
      }
    }

    setSubmitting(true);
    setSubmitMsg('Submitting…');

    const priority  = values['priority']  ?? 'Medium';
    const dueDate   = values['dueDate']   ?? null;

    const requestType = template.slug;

    const firstTextField = fields.find(f => f.type === 'text');
    const title = (firstTextField ? values[firstTextField.name] : '') || template.name;

    // Only include visible non-attachment fields in the payload
    const payloadValues = Object.fromEntries(
      Object.entries(values).filter(([k]) => {
        const fd = fields.find(f => f.name === k);
        const state = fieldStates.get(k);
        return fd?.type !== 'attachment' && (state?.visible ?? true);
      }),
    );

    const { data, error } = await requestsApi.create({
      requestType,
      title,
      priority,
      dueDate:        dueDate || null,
      projectId:      activeProject.id,
      organizationId: organizationId || null,
      templateId:     template.id,
      payload:        payloadValues,
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

        {/* Organization picker */}
        <div className="field">
          <label className="field-label">Share with organization</label>
          <select
            className="txt"
            value={organizationId}
            onChange={e => setOrganizationId(e.target.value)}
            style={{ height: 42 }}
          >
            <option value="">— visible only to me —</option>
            {orgs.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <span className="field-sub">
            Members of the selected organization will also be able to see this request.
          </span>
        </div>

        <form className="reqform" onSubmit={handleSubmit}>
          {fields.map(field => {
            const state = fieldStates.get(field.name) ?? { visible: true, required: field.required };
            if (!state.visible) return null;
            return (
              <DynamicField
                key={field.name}
                field={{ ...field, required: state.required }}
                value={values[field.name] ?? ''}
                onChange={handleChange}
                onFilesChange={handleFilesChange}
                pendingFiles={pendingFiles[field.name] ?? []}
              />
            );
          })}

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
