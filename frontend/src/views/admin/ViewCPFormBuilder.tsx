import React, { useState } from 'react';
import { formTemplatesApi, type FormFieldDef, type FormTemplate, type ConditionalRule, type ConditionClause } from '../../api/formTemplates';
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

const OPERATORS_FOR_TYPE: Record<string, { value: string; label: string }[]> = {
  text:     [{ value: 'eq', label: '= equals' }, { value: 'neq', label: '≠ not equals' }, { value: 'empty', label: 'is empty' }, { value: 'notEmpty', label: 'is not empty' }],
  textarea: [{ value: 'empty', label: 'is empty' }, { value: 'notEmpty', label: 'is not empty' }],
  richtext: [{ value: 'empty', label: 'is empty' }, { value: 'notEmpty', label: 'is not empty' }],
  email:    [{ value: 'eq', label: '= equals' }, { value: 'neq', label: '≠ not equals' }, { value: 'empty', label: 'is empty' }, { value: 'notEmpty', label: 'is not empty' }],
  number:   [{ value: 'eq', label: '= equals' }, { value: 'neq', label: '≠ not equals' }, { value: 'empty', label: 'is empty' }, { value: 'notEmpty', label: 'is not empty' }],
  select:   [{ value: 'eq', label: '= equals' }, { value: 'neq', label: '≠ not equals' }, { value: 'empty', label: 'is empty' }, { value: 'notEmpty', label: 'is not empty' }],
  radio:    [{ value: 'eq', label: '= equals' }, { value: 'neq', label: '≠ not equals' }, { value: 'empty', label: 'is empty' }, { value: 'notEmpty', label: 'is not empty' }],
  checkbox: [{ value: 'contains', label: 'includes' }, { value: 'notContains', label: 'does not include' }, { value: 'empty', label: 'none selected' }, { value: 'notEmpty', label: 'any selected' }],
  date:     [{ value: 'eq', label: '= equals' }, { value: 'neq', label: '≠ not equals' }, { value: 'empty', label: 'is empty' }, { value: 'notEmpty', label: 'is not empty' }],
  attachment: [{ value: 'empty', label: 'is empty' }, { value: 'notEmpty', label: 'is not empty' }],
};

function needsValueInput(operator: string) {
  return operator === 'eq' || operator === 'neq' || operator === 'contains' || operator === 'notContains';
}

interface ConditionClauseDraft {
  fieldName: string;
  operator:  string;
  value:     string;
}

interface ConditionalRuleDraft {
  when:         ConditionClauseDraft[];
  logic:        'AND' | 'OR';
  visibility?:  'show' | 'hide';
  requirement?: 'require' | 'optional';
}

interface FieldDraft {
  name:            string;
  label:           string;
  type:            FieldType;
  required:        boolean;
  placeholder:     string;
  helpText:        string;
  options:         string; // comma-separated; used for select/radio/checkbox
  defaultVisible:  boolean;
  displayLocation: 'left' | 'right' | 'hidden';
  conditions:      ConditionalRuleDraft[];
}

function autoSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function autoId(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function blankField(): FieldDraft {
  return {
    name: '', label: '', type: 'text', required: false,
    placeholder: '', helpText: '', options: '',
    defaultVisible: true, displayLocation: 'left', conditions: [],
  };
}

function blankClause(): ConditionClauseDraft {
  return { fieldName: '', operator: 'eq', value: '' };
}

function blankRule(): ConditionalRuleDraft {
  return { when: [blankClause()], logic: 'AND' };
}

function templateToFieldDrafts(tpl: FormTemplate): FieldDraft[] {
  return [...tpl.fieldSchema]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(f => ({
      name:            f.name,
      label:           f.label,
      type:            f.type as FieldType,
      required:        f.required,
      placeholder:     f.placeholder ?? '',
      helpText:        f.helpText ?? '',
      options:         f.options?.join(', ') ?? '',
      defaultVisible:  f.defaultVisible ?? true,
      displayLocation: (f.displayLocation ?? 'left') as 'left' | 'right' | 'hidden',
      conditions:      (f.conditions ?? []).map(r => ({
        when:         r.when.map(c => ({ fieldName: c.fieldName, operator: c.operator, value: c.value })),
        logic:        (r.logic ?? 'AND') as 'AND' | 'OR',
        visibility:   r.visibility,
        requirement:  r.requirement,
      })),
    }));
}

function needsOptions(type: FieldType) {
  return type === 'select' || type === 'radio' || type === 'checkbox';
}

// ── Condition Rule Editor ────────────────────────────────────────────────────

interface RuleEditorProps {
  rule:          ConditionalRuleDraft;
  ruleIndex:     number;
  allFields:     FieldDraft[];
  fieldIndex:    number;
  onChange:      (rule: ConditionalRuleDraft) => void;
  onRemove:      () => void;
}

function RuleEditor({ rule, allFields, fieldIndex, onChange, onRemove }: RuleEditorProps) {
  const otherFields = allFields.filter((_, i) => i !== fieldIndex);

  const updateClause = (ci: number, patch: Partial<ConditionClauseDraft>) => {
    const updated = rule.when.map((c, i) => i === ci ? { ...c, ...patch } : c);
    onChange({ ...rule, when: updated });
  };

  const addClause = () => onChange({ ...rule, when: [...rule.when, blankClause()] });

  const removeClause = (ci: number) =>
    onChange({ ...rule, when: rule.when.filter((_, i) => i !== ci) });

  const getTriggerOptions = (fieldName: string): string[] => {
    const f = allFields.find(f => f.name === fieldName);
    if (!f || !needsOptions(f.type)) return [];
    return f.options.split(',').map(o => o.trim()).filter(Boolean);
  };

  const getTriggerType = (fieldName: string): string => {
    return allFields.find(f => f.name === fieldName)?.type ?? 'text';
  };

  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 6, padding: 12, marginBottom: 8, background: '#fafafa' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>When…</span>
        <button onClick={onRemove} style={{ border: 'none', background: 'none', color: '#a30000', cursor: 'pointer', fontSize: 12, padding: 0 }}>
          Remove rule
        </button>
      </div>

      {rule.when.map((clause, ci) => {
        const triggerType    = getTriggerType(clause.fieldName);
        const triggerOptions = getTriggerOptions(clause.fieldName);
        const operatorList   = OPERATORS_FOR_TYPE[triggerType] ?? OPERATORS_FOR_TYPE['text']!;
        const showValue      = needsValueInput(clause.operator);

        return (
          <div key={ci} style={{ marginBottom: 8 }}>
            {ci > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <button
                  onClick={() => onChange({ ...rule, logic: 'AND' })}
                  style={{ padding: '2px 8px', border: '1px solid var(--line-2)', borderRadius: 4, fontSize: 11, cursor: 'pointer', background: rule.logic === 'AND' ? 'var(--accent)' : '#fff', color: rule.logic === 'AND' ? '#fff' : 'var(--ink)' }}
                >
                  AND
                </button>
                <button
                  onClick={() => onChange({ ...rule, logic: 'OR' })}
                  style={{ padding: '2px 8px', border: '1px solid var(--line-2)', borderRadius: 4, fontSize: 11, cursor: 'pointer', background: rule.logic === 'OR' ? 'var(--accent)' : '#fff', color: rule.logic === 'OR' ? '#fff' : 'var(--ink)' }}
                >
                  OR
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="txt"
                value={clause.fieldName}
                onChange={e => updateClause(ci, { fieldName: e.target.value, operator: 'eq', value: '' })}
                style={{ height: 34, fontSize: 12, flex: '1 1 130px', minWidth: 0 }}
              >
                <option value="">— pick field —</option>
                {otherFields.map(f => (
                  <option key={f.name} value={f.name}>{f.label || f.name}</option>
                ))}
              </select>

              <select
                className="txt"
                value={clause.operator}
                onChange={e => updateClause(ci, { operator: e.target.value, value: '' })}
                style={{ height: 34, fontSize: 12, flex: '0 0 130px' }}
                disabled={!clause.fieldName}
              >
                {operatorList.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>

              {showValue && (
                triggerOptions.length > 0 ? (
                  <select
                    className="txt"
                    value={clause.value}
                    onChange={e => updateClause(ci, { value: e.target.value })}
                    style={{ height: 34, fontSize: 12, flex: '1 1 100px', minWidth: 0 }}
                  >
                    <option value="">— pick value —</option>
                    {triggerOptions.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    className="txt"
                    value={clause.value}
                    onChange={e => updateClause(ci, { value: e.target.value })}
                    placeholder="value"
                    style={{ height: 34, fontSize: 12, flex: '1 1 100px', minWidth: 0 }}
                  />
                )
              )}

              {rule.when.length > 1 && (
                <button onClick={() => removeClause(ci)} style={{ border: 'none', background: 'none', color: '#a30000', cursor: 'pointer', fontSize: 13, padding: '0 4px', flexShrink: 0 }}>×</button>
              )}
            </div>
          </div>
        );
      })}

      <button onClick={addClause} style={{ fontSize: 11, color: 'var(--accent)', border: 'none', background: 'none', cursor: 'pointer', padding: '2px 0', marginBottom: 10 }}>
        + Add clause
      </button>

      <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 10, marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0, flex: '1 1 140px' }}>
          <label className="field-label" style={{ fontSize: 11 }}>Visibility effect</label>
          <select
            className="txt"
            value={rule.visibility ?? ''}
            onChange={e => onChange({ ...rule, visibility: (e.target.value || undefined) as 'show' | 'hide' | undefined })}
            style={{ height: 32, fontSize: 12 }}
          >
            <option value="">— no change —</option>
            <option value="show">Show this field</option>
            <option value="hide">Hide this field</option>
          </select>
        </div>
        <div className="field" style={{ margin: 0, flex: '1 1 140px' }}>
          <label className="field-label" style={{ fontSize: 11 }}>Required effect</label>
          <select
            className="txt"
            value={rule.requirement ?? ''}
            onChange={e => onChange({ ...rule, requirement: (e.target.value || undefined) as 'require' | 'optional' | undefined })}
            style={{ height: 32, fontSize: 12 }}
          >
            <option value="">— no change —</option>
            <option value="require">Make required</option>
            <option value="optional">Make optional</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ── Conditions Panel ─────────────────────────────────────────────────────────

interface ConditionsPanelProps {
  fieldIndex:  number;
  draft:       FieldDraft;
  allFields:   FieldDraft[];
  onChange:    (patch: Partial<FieldDraft>) => void;
}

function ConditionsPanel({ fieldIndex, draft, allFields, onChange }: ConditionsPanelProps) {
  const [open, setOpen] = useState(false);
  const count = draft.conditions.length;

  const updateRule = (ri: number, rule: ConditionalRuleDraft) =>
    onChange({ conditions: draft.conditions.map((r, i) => i === ri ? rule : r) });

  const removeRule = (ri: number) =>
    onChange({ conditions: draft.conditions.filter((_, i) => i !== ri) });

  const addRule = () => onChange({ conditions: [...draft.conditions, blankRule()] });

  return (
    <div style={{ borderTop: '1px solid var(--line-2)', marginTop: 10, paddingTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span style={{ transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
        Conditions
        {count > 0 && (
          <span style={{ marginLeft: 4, fontSize: 11, background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 7px' }}>{count}</span>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              Default visibility
              <select
                className="txt"
                value={draft.defaultVisible ? 'true' : 'false'}
                onChange={e => onChange({ defaultVisible: e.target.value === 'true' })}
                style={{ height: 30, fontSize: 12, width: 180 }}
              >
                <option value="true">Visible (hide on condition)</option>
                <option value="false">Hidden (show on condition)</option>
              </select>
            </label>
          </div>

          {draft.conditions.map((rule, ri) => (
            <RuleEditor
              key={ri}
              rule={rule}
              ruleIndex={ri}
              allFields={allFields}
              fieldIndex={fieldIndex}
              onChange={r => updateRule(ri, r)}
              onRemove={() => removeRule(ri)}
            />
          ))}

          <button
            type="button"
            onClick={addRule}
            style={{ fontSize: 12, color: 'var(--accent)', border: '1px dashed var(--accent)', borderRadius: 4, background: 'none', cursor: 'pointer', padding: '4px 12px', marginTop: 4 }}
          >
            + Add rule
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Form Builder ────────────────────────────────────────────────────────

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
      if (!f.defaultVisible) def.defaultVisible = false;
      if (f.displayLocation !== 'left') def.displayLocation = f.displayLocation;
      const validRules: ConditionalRule[] = f.conditions
        .filter(r => r.when.some(c => c.fieldName && c.operator) && (r.visibility !== undefined || r.requirement !== undefined))
        .map(r => ({
          when: r.when
            .filter(c => c.fieldName && c.operator)
            .map(c => ({ fieldName: c.fieldName, operator: c.operator as ConditionClause['operator'], value: c.value })),
          logic: r.logic,
          ...(r.visibility  ? { visibility:  r.visibility  } : {}),
          ...(r.requirement ? { requirement: r.requirement } : {}),
        }))
        .filter(r => r.when.length > 0);
      if (validRules.length > 0) def.conditions = validRules;
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--ink)' }}>
                <input type="checkbox" checked={f.required} onChange={e => updateField(i, { required: e.target.checked })} />
                Required field
              </label>
              <div className="field" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <label className="field-label" style={{ fontSize: 12, margin: 0, whiteSpace: 'nowrap' }}>Output Display Location</label>
                <select
                  className="txt"
                  value={f.displayLocation}
                  onChange={e => updateField(i, { displayLocation: e.target.value as FieldDraft['displayLocation'] })}
                  style={{ height: 32, fontSize: 12, width: 200 }}
                >
                  <option value="left">Left Panel (Request Details)</option>
                  <option value="right">Right Side Panel (Meta Context)</option>
                  <option value="hidden">Hidden from Client</option>
                </select>
              </div>
            </div>

            {/* Conditions panel */}
            {fields.length > 1 && (
              <ConditionsPanel
                fieldIndex={i}
                draft={f}
                allFields={fields}
                onChange={patch => updateField(i, patch)}
              />
            )}
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
