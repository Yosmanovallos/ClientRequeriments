import React, { useState } from 'react';
import { formTemplatesApi, type FormFieldDef } from '../../api/formTemplates';
import type { CPSection } from './ViewControlPanel';

interface Props {
  onNavigate: (s: CPSection) => void;
}

const FIELD_TYPES = ['text', 'textarea', 'select', 'date', 'email', 'number'] as const;
type FieldType = typeof FIELD_TYPES[number];

interface FieldDraft {
  name:        string;
  label:       string;
  type:        FieldType;
  required:    boolean;
  placeholder: string;
  options:     string;
}

function autoSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function autoId(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function blankField(): FieldDraft {
  return { name: '', label: '', type: 'text', required: false, placeholder: '', options: '' };
}

export default function ViewCPFormBuilder({ onNavigate }: Props) {
  const [name,    setName]    = useState('');
  const [slug,    setSlug]    = useState('');
  const [desc,    setDesc]    = useState('');
  const [fields,  setFields]  = useState<FieldDraft[]>([blankField()]);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  const updateField = (i: number, patch: Partial<FieldDraft>) =>
    setFields(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));

  const addField = () => setFields(prev => [...prev, blankField()]);

  const removeField = (i: number) =>
    setFields(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setError('');
    if (!name.trim() || !slug.trim()) { setError('Name and slug are required.'); return; }
    for (const f of fields) {
      if (!f.name.trim() || !f.label.trim()) { setError('Every field needs a name and label.'); return; }
      if (f.type === 'select' && !f.options.trim()) { setError(`Select field "${f.label}" needs at least one option.`); return; }
    }

    const fieldSchema: FormFieldDef[] = fields.map((f, i) => {
      const base: FormFieldDef = {
        name:      f.name.trim(),
        label:     f.label.trim(),
        type:      f.type,
        required:  f.required,
        sortOrder: i,
        ...(f.placeholder.trim() ? { placeholder: f.placeholder.trim() } : {}),
      };
      if (f.type === 'select') {
        base.options = f.options.split(',').map(o => o.trim()).filter(Boolean);
      }
      return base;
    });

    setSaving(true);
    const { error: err } = await formTemplatesApi.create({
      name:        name.trim(),
      slug:        slug.trim(),
      description: desc.trim() || undefined,
      fieldSchema,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSuccess('Template created! Redirecting…');
    setTimeout(() => onNavigate('forms'), 1500);
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <button className="cp-back" onClick={() => onNavigate('forms')}>← Back to Forms</button>
        <h2 className="account-title" style={{ margin: 0 }}>New Form Template</h2>
      </div>

      {error   && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}
      {success && <div className="submit-success" style={{ marginBottom: 16 }}>{success}</div>}

      {/* Template info */}
      <div style={{ background: '#fff', border: '1px solid var(--line-2)', borderRadius: 8, padding: 24, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>Template Info</h3>
        <div className="field" style={{ marginBottom: 14 }}>
          <label className="field-label">Name <span className="req-star">*</span></label>
          <input className="txt" value={name}
            onChange={e => { setName(e.target.value); setSlug(autoSlug(e.target.value)); }} />
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          <label className="field-label">Slug <span className="req-star">*</span></label>
          <input className="txt" value={slug} onChange={e => setSlug(e.target.value)}
            placeholder="lowercase-dashes-only" />
        </div>
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                  onChange={e => updateField(i, { placeholder: e.target.value })} />
              </div>
            </div>

            {f.type === 'select' && (
              <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
                <label className="field-label" style={{ fontSize: 12 }}>
                  Options <span className="req-star">*</span>
                  <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>(comma-separated)</span>
                </label>
                <input className="txt" value={f.options}
                  onChange={e => updateField(i, { options: e.target.value })}
                  placeholder="Option A, Option B, Option C" />
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, cursor: 'pointer', color: 'var(--ink)' }}>
              <input type="checkbox" checked={f.required} onChange={e => updateField(i, { required: e.target.checked })} />
              Required field
            </label>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn-send" style={{ height: 42, padding: '0 24px' }}
          onClick={handleSave} disabled={saving}>
          {saving ? 'Creating…' : 'Create Template'}
        </button>
        <button className="btn-cancel" onClick={() => onNavigate('forms')}>Cancel</button>
      </div>
    </div>
  );
}
