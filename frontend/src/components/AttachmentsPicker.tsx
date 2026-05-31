import React, { useRef, useState } from 'react';

/**
 * Reusable file picker — Browse button + drag-and-drop.
 * Controlled component: parent owns the `files` state and receives changes via `onChange`.
 *
 * Visual feedback: the dropzone border turns purple while dragging over it.
 */
interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  /** Override label and helper text if a form needs different copy. */
  label?: string;
}

export default function AttachmentsPicker({ files, onChange, label = 'Attachments' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    onChange([...files, ...Array.from(list)]);
  };
  const removeFile = (i: number) => onChange(files.filter((_, idx) => idx !== i));

  return (
    <div style={{ marginBottom: 20 }}>
      <label className="field-label">{label}</label>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        style={{
          border: `2px dashed ${dragging ? 'var(--purple)' : 'var(--line-2)'}`,
          borderRadius: 6,
          padding: 16,
          textAlign: 'center',
          background: dragging ? '#f4f0fb' : '#fafbfc',
          transition: 'all 0.14s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => { addFiles(e.target.files); if (inputRef.current) inputRef.current.value = ''; }}
        />
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>
          {dragging ? 'Drop to attach' : 'Drag files here, or browse to attach'}
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            background: '#fff',
            border: '1px solid var(--line-2)',
            padding: '6px 14px',
            borderRadius: 4,
            color: 'var(--ink-2)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Browse files…
        </button>
      </div>

      {files.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {files.map((f, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: '#f4f5f7',
                padding: '7px 12px',
                borderRadius: 4,
                fontSize: 13,
                color: 'var(--ink-2)',
              }}
            >
              <span style={{ flex: 1 }}>{f.name}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{(f.size / 1024).toFixed(1)} KB</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                title="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
