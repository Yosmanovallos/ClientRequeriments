import React from 'react';
import type { FormFieldDef } from '../api/formTemplates';

interface Props {
  field:    FormFieldDef;
  value:    string;
  onChange: (name: string, value: string) => void;
}

export default function DynamicField({ field, value, onChange }: Props) {
  const { name, label, type, required, placeholder, options } = field;
  const id = `field-${name}`;

  const handle = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange(name, e.target.value);

  return (
    <div style={{ marginBottom: 20 }}>
      <label className="field-label" htmlFor={id}>
        {label}
        {required && <span style={{ color: '#de350b' }}> *</span>}
      </label>

      {type === 'textarea' && (
        <textarea
          id={id} className="txt txt-area" value={value}
          placeholder={placeholder ?? ''} required={required}
          onChange={handle} style={{ width: '100%' }}
        />
      )}

      {type === 'select' && (
        <select id={id} className="txt" value={value} required={required} onChange={handle} style={{ height: 42 }}>
          <option value="">— select —</option>
          {(options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}

      {(type === 'text' || type === 'email' || type === 'number' || type === 'date') && (
        <input
          id={id} className="txt" type={type} value={value}
          placeholder={placeholder ?? ''} required={required}
          onChange={handle}
          style={type === 'date' ? { maxWidth: 240 } : undefined}
        />
      )}
    </div>
  );
}
