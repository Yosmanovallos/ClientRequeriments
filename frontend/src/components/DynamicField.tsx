import React, { useRef } from 'react';
import type { FormFieldDef } from '../api/formTemplates';
import RichTextField from './RichTextField';

interface Props {
  field:          FormFieldDef;
  value:          string;
  onChange:       (name: string, value: string) => void;
  onFilesChange?: (name: string, files: File[]) => void;
  pendingFiles?:  File[];
}

// ── Check icon for checkboxes ─────────────────────────────────────────────────
function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,6 5,9 10,3" />
    </svg>
  );
}

// ── File attachment field ─────────────────────────────────────────────────────
function AttachmentField({
  field, pendingFiles = [], onFilesChange,
}: {
  field: FormFieldDef;
  pendingFiles: File[];
  onFilesChange?: (name: string, files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const merged = [...pendingFiles];
    Array.from(newFiles).forEach(f => {
      if (!merged.find(ex => ex.name === f.name && ex.size === f.size)) merged.push(f);
    });
    onFilesChange?.(field.name, merged);
  };

  const removeFile = (idx: number) => {
    const updated = pendingFiles.filter((_, i) => i !== idx);
    onFilesChange?.(field.name, updated);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      <div
        className="dropzone dropzone-col"
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('is-drag'); }}
        onDragLeave={e => e.currentTarget.classList.remove('is-drag')}
        onDrop={e => {
          e.preventDefault();
          e.currentTarget.classList.remove('is-drag');
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        style={{ cursor: 'pointer' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b778c" strokeWidth="1.5">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
        <span>
          Drop files to attach or{' '}
          <span className="link" style={{ color: 'var(--purple)', fontWeight: 600 }}>browse</span>
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onClick={e => e.stopPropagation()}
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {pendingFiles.length > 0 && (
        <ul className="filelist">
          {pendingFiles.map((f, i) => (
            <li key={i}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="filename">{f.name}</span>
              <span className="filesize">{formatSize(f.size)}</span>
              <button type="button" onClick={() => removeFile(i)} title="Remove">×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Radio group ───────────────────────────────────────────────────────────────
function RadioGroup({
  field, value, onChange,
}: {
  field: FormFieldDef;
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div className="radios">
      {(field.options ?? []).map(opt => (
        <label key={opt} className="radio" style={{ cursor: 'pointer' }}>
          <input
            type="radio"
            name={`radio-${field.name}`}
            value={opt}
            checked={value === opt}
            required={field.required && !value}
            onChange={() => onChange(field.name, opt)}
          />
          <span className="dot" />
          {opt}
        </label>
      ))}
    </div>
  );
}

// ── Checkbox group ────────────────────────────────────────────────────────────
function CheckboxGroup({
  field, value, onChange,
}: {
  field: FormFieldDef;
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  const toggle = (opt: string) => {
    const next = selected.includes(opt)
      ? selected.filter(s => s !== opt)
      : [...selected, opt];
    onChange(field.name, next.join(','));
  };

  return (
    <div className="checks">
      {(field.options ?? []).map(opt => (
        <label key={opt} className="check" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => toggle(opt)}
          />
          <span className="box"><CheckIcon /></span>
          {opt}
        </label>
      ))}
    </div>
  );
}

// ── Main field renderer ───────────────────────────────────────────────────────
export default function DynamicField({ field, value, onChange, onFilesChange, pendingFiles }: Props) {
  const { name, label, type, required, placeholder, helpText, options } = field;
  const id = `field-${name}`;

  const handle = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange(name, e.target.value);

  return (
    <div className="field">
      {type !== 'attachment' && (
        <label className="field-label" htmlFor={id}>
          {label}
          {required && <span className="req-star"> *</span>}
        </label>
      )}

      {type === 'richtext' && (
        <RichTextField
          id={id}
          value={value}
          placeholder={placeholder}
          required={required}
          onChange={html => onChange(name, html)}
        />
      )}

      {type === 'radio' && (
        <RadioGroup field={field} value={value} onChange={onChange} />
      )}

      {type === 'checkbox' && (
        <CheckboxGroup field={field} value={value} onChange={onChange} />
      )}

      {type === 'attachment' && (
        <>
          <label className="field-label" htmlFor={id}>
            {label}
            {required && <span className="req-star"> *</span>}
          </label>
          <AttachmentField
            field={field}
            pendingFiles={pendingFiles ?? []}
            onFilesChange={onFilesChange}
          />
        </>
      )}

      {type === 'textarea' && (
        <textarea
          id={id} className="txt txt-area" value={value}
          placeholder={placeholder ?? ''} required={required}
          onChange={handle} style={{ width: '100%' }}
        />
      )}

      {type === 'select' && (
        <select id={id} className="txt" value={value} required={required} onChange={handle}
          style={{ height: 42 }}>
          <option value="">Select...</option>
          {(options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}

      {(type === 'text' || type === 'email' || type === 'number') && (
        <input
          id={id} className="txt" type={type} value={value}
          placeholder={placeholder ?? ''} required={required}
          onChange={handle}
        />
      )}

      {type === 'date' && (
        <div className="datewrap">
          <input
            id={id} className="txt date" type="date" value={value}
            required={required} onChange={handle}
          />
          <span className="date-ic">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
        </div>
      )}

      {helpText && <p className="field-sub">{helpText}</p>}
    </div>
  );
}
