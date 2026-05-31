import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { requestsApi } from '../api/requests';
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
  const { go, activeProject } = useApp();
  const [values,     setValues]     = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg,  setSubmitMsg]  = useState('');

  const fields = [...template.fieldSchema].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleChange = (name: string, value: string) =>
    setValues(prev => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setSubmitting(true);
    setSubmitMsg('');

    // Extract priority and dueDate if present; pass all values as payload
    const priority = values['priority'] ?? 'Medium';
    const dueDate  = values['dueDate']  ?? null;

    // Map hyphenated slug → underscored requestType for the existing backend enum
    const requestType = template.slug.replace(/-/g, '_') as
      'new_report' | 'new_page' | 'new_feature' | 'fix_issue' | 'view_request';

    // Title = value of first text field (by sortOrder)
    const firstTextField = fields.find(f => f.type === 'text');
    const title = (firstTextField ? values[firstTextField.name] : '') || template.name;

    const { data, error } = await requestsApi.create({
      requestType,
      title,
      priority,
      dueDate:   dueDate || null,
      projectId: activeProject.id,
      payload:   { ...values, templateId: template.id },
    });

    setSubmitting(false);
    if (error) {
      setSubmitMsg('Error: ' + error.message);
      return;
    }
    const created = data as { reference: string };
    setSubmitMsg(`Request ${created.reference} submitted successfully!`);
    setTimeout(() => go('requests'), 2000);
  };

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

        <form className="reqform" onSubmit={handleSubmit}>
          {fields.map(field => (
            <DynamicField
              key={field.name}
              field={field}
              value={values[field.name] ?? ''}
              onChange={handleChange}
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
