import React, { useState } from 'react';
import { formTemplatesApi, type FormFieldDef, type FormTemplate } from '../../api/formTemplates';
import { api } from '../../api/client';
import type { CPSection } from './ViewControlPanel';

interface Props {
  projectId?:   string;
  editTemplate?: FormTemplate;
  onNavigate:   (s: CPSection, projectId?: string) => void;
}

const FIELD_TYPES = [
  'text', 'textarea', 'richtext',
  'select', 'radio', 'checkbox',
  'date', 'email', 'number', 'attachment',
] as const;
type FieldType = typeof FIELD_TYPES[number];

interface FieldDraft {
  name:        string;
  label:       string;
  type:        FieldType;
  required:    boolean;
  placeholder: string;
  helpText:    string;
  options:     string; // comma-separated; used for select/radio/checkbox
}

function autoSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function autoId(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function blankField(): FieldDraft {
  return { name: '', label: '', type: 'text', required: false, placeholder: '', helpText: '', options: '' };
}

function templateToFieldDrafts(tpl: FormTemplate): FieldDraft[] {
  return [...tpl.fieldSchema]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(f => ({
      name:        f.name,
      label:       f.label,
      type:        f.type as FieldType,
      required:    f.required,
      placeholder: f.placeholder ?? '',
      helpText:    f.helpText ?? '',
      options:     f.options?.join(', ') ?? '',
    }));
}

function needsOptions(type: FieldType) {
  return type === 'select' || type === 'radio' || type === 'checkbox';
}

export default function ViewCPFormBuilder({ projectId, editTemplate, onNavigate }: Props) {
  const isEditing = !!editTemplate;

  const [name,    setName]    = useState(editTemplate?.name ?? '');
  const [slug,    setSlug]    = useState(editTemplate?.slug ?? '');
  const [desc,    setDesc]    = useState(editTemplate?.description ?? '');
  const [fields,  setFields]  = useState<FieldDraft[]>(
    editTemplate ? templateToFieldDrafts(editTemplate) : [blankField()],
  );
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  const updateField = (i: number, patch: Partial<FieldDraft>) =>
    setFields(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));

  const addField = () => setFields(prev => [...prev, blankField()]);

  const removeField = (i: number) =>
    setFields(prev => prev.filter((_, idx) => idx !== i));

  const buildFieldSchema = (): FormFieldDef[] =>
    fields.map((f, i) => {
      const def: FormFieldDef = {
        name:      f.name.trim(),
        label:     f.label.trim(),
        type:      f.type,
        required:  f.required,
        sortOrder: i,
      };
      if (f.placeholder.trim()) def.placeholder = f.placeholder.trim();
      if (f.helpText.trim())    def.helpText    = f.helpText.trim();
      if (needsOptions(f.type)) {
        def.options = f.options.split(',').map(o => o.trim()).filter(Boolean);
      }
      return def;
    });

  const validate = (): string | null => {
    if (!name.trim() || !slug.trim()) return 'Name and slug are required.';
    for (const f of fields) {
      if (!f.name.trim() || !f.label.trim()) return 'Every field needs a name and label.';
      if (needsOptions(f.type) && !f.options.trim())
        return `"${f.label}" (${f.type}) needs at least one option.`;
    }
    return null;
  };

  const handleSave = async () => {
    setError('');
    const err = validate();
    if (err) { setError(err); return; }

    const fieldSchema = buildFieldSchema();
    setSaving(true);

    if (isEditing) {
      const { error: e } = await formTemplatesApi.update(editTemplate.id, {
        name:        name.trim(),
        description: desc.trim() || undefined,
        fieldSchema,
      });
      setSaving(false);
      if (e) { setError(e.message); return; }
      setSuccess('Template updated! Redirecting…');
    } else {
      const { data: created, error: e } = await formTemplatesApi.create({
        name:        name.trim(),
        slug:        slug.trim(),
        description: desc.trim() || undefined,
        fieldSchema,
      });
      if (e) { setSaving(false); setError(e.message); return; }

      // Bind the new template to the selected project only
      if (projectId && created) {
        await api.put<void>(`/projects/${projectId}/forms`, {
          configs: [{ templateId: created.id, isEnabled: false, sortOrder: 999 }],
        });
      }
      setSaving(false);
      setSuccess('Template created! Redirecting…');
    }

    setTimeout(() => onNavigate('forms', projectId), 1500);
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <button className="cp-back" onClick={() => onNavigate('forms', projectId)}>← Back to Forms</button>
        <h2 className="account-title" style={{ margin: 0 }}>
          {isEditing ? 'Edit Form Template' : 'New Form Template'}
        </h2>
      </div>

      {error   && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}
      {success && <div className="submit-success" style={{ marginBottom: 16 }}>{success}</div>}

      {/* Template info */}
      <div style={{ background: '#fff', border: '1px solid var(--line-2)', borderRadius: 8, padding: 24, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>Template Info</h3>
        <div className="field" style={{ marginBottom: 14 }}>
          <label className="field-label">Name <span className="req-star">*</span></label>
          <input className="txt" value={name}
            onChange={e => { setName(e.target.value); if (!isEditing) setSlug(autoSlug(e.target.value)); }} />
        </div>
        {!isEditing && (
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="field-label">Slug <span className="req-star">*</span></label>
            <input className="txt" value={slug} onChange={e => setSlug(e.target.value)}
              placeholder="lowercase-dashes-only" />
          </div>
        )}
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field-label">Description</label>
          <textarea className="txt txt-area" value={desc} onChange={e => setDesc(e.target.value)}
            style={{ width: '100%', minHeight: 72 }} />
        </div>
      </div>

      {/* Fields */}
      <div style={{ background: '#fff', border: '1px solid var(--line-2)', borderRadius: 8, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Fields ({fields.length})</h3>
          <button className="topnav-action" style={{ fontSize: 13 }} onClick={addField}>+ Add field</button>
        </div>

        {fields.map((f, i) => (
          <div key={i} style={{ border: '1px solid var(--line-2)', borderRadius: 6, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-2)' }}>Field {i + 1}</span>
              {fields.length > 1 && (
                <button onClick={() => removeField(i)}
                  style={{ border: 'none', background: 'none', color: '#a30000', cursor: 'pointer', fontSize: 13, padding: 0 }}>
                  Remove
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label" style={{ fontSize: 12 }}>Label <span className="req-star">*</span></label>
                <input className="txt" value={f.label}
                  onChange={e => updateField(i, { label: e.target.value, name: autoId(e.target.value) })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label" style={{ fontSize: 12 }}>Field name <span className="req-star">*</span></label>
                <input className="txt" value={f.name} onChange={e => updateField(i, { name: e.target.value })}
                  placeholder="snake_case_identifier" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label" style={{ fontSize: 12 }}>Type</label>
                <select className="txt" value={f.type}
                  onChange={e => updateField(i, { type: e.target.value as FieldType, options: '' })}
                  style={{ height: 42 }}>
                  {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label" style={{ fontSize: 12 }}>Placeholder</label>
                <input className="txt" value={f.placeholder}
                  onChange={e => updateField(i, { placeholder: e.target.value })}
                  disabled={f.type === 'attachment' || f.type === 'radio' || f.type === 'checkbox'} />
              </div>
            </div>

            {needsOptions(f.type) && (
              <div className="field" style={{ marginBottom: 10 }}>
                <label className="field-label" style={{ fontSize: 12 }}>
                  Options <span className="req-star">*</span>
                  <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>(comma-separated)</span>
                </label>
                <input className="txt" value={f.options}
                  onChange={e => updateField(i, { options: e.target.value })}
                  placeholder="Option A, Option B, Option C" />
              </div>
            )}

            <div className="field" style={{ marginBottom: 10 }}>
              <label className="field-label" style={{ fontSize: 12 }}>Help text <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(shown below the field in gray)</span></label>
              <input className="txt" value={f.helpText}
                onChange={e => updateField(i, { helpText: e.target.value })}
                placeholder="Optional hint for the user" />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--ink)' }}>
              <input type="checkbox" checked={f.required} onChange={e => updateField(i, { required: e.target.checked })} />
              Required field
            </label>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn-send" style={{ height: 42, padding: '0 24px' }}
          onClick={handleSave} disabled={saving}>
          {saving ? (isEditing ? 'Saving…' : 'Creating…') : (isEditing ? 'Save changes' : 'Create Template')}
        </button>
        <button className="btn-cancel" onClick={() => onNavigate('forms', projectId)}>Cancel</button>
      </div>
    </div>
  );
}
