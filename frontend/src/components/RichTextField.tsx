import React, { useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Link } from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Underline } from '@tiptap/extension-underline';
import { Placeholder } from '@tiptap/extension-placeholder';

interface Props {
  id:          string;
  value:       string;
  placeholder?: string;
  onChange:    (html: string) => void;
  required?:   boolean;
}

// ── Toolbar button ────────────────────────────────────────────────────────────
function ToolBtn({
  active, onClick, title, children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`rt-btn${active ? ' is-active' : ''}`}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
    >
      {children}
    </button>
  );
}

// ── Paragraph style dropdown ──────────────────────────────────────────────────
function StyleDropdown({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const current =
    editor.isActive('heading', { level: 1 }) ? 'Heading 1' :
    editor.isActive('heading', { level: 2 }) ? 'Heading 2' :
    editor.isActive('heading', { level: 3 }) ? 'Heading 3' :
    'Normal text';

  return (
    <select
      className="rt-style-select"
      value={current}
      onMouseDown={e => e.stopPropagation()}
      onChange={e => {
        const v = e.target.value;
        if (v === 'Heading 1') editor.chain().focus().toggleHeading({ level: 1 }).run();
        else if (v === 'Heading 2') editor.chain().focus().toggleHeading({ level: 2 }).run();
        else if (v === 'Heading 3') editor.chain().focus().toggleHeading({ level: 3 }).run();
        else editor.chain().focus().setParagraph().run();
      }}
    >
      <option value="Normal text">Normal text</option>
      <option value="Heading 1">Heading 1</option>
      <option value="Heading 2">Heading 2</option>
      <option value="Heading 3">Heading 3</option>
    </select>
  );
}

// ── Color picker button ───────────────────────────────────────────────────────
function ColorBtn({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  return (
    <label className="rt-btn rt-color-btn" title="Text color">
      <span className="rt-color-icon">A</span>
      <input
        type="color"
        className="rt-color-input"
        defaultValue="#172b4d"
        onMouseDown={e => e.stopPropagation()}
        onChange={e => editor.chain().focus().setColor(e.target.value).run()}
      />
    </label>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RichTextField({ id, value, placeholder, onChange, required }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Link.configure({ openOnClick: false }),
      TextStyle,
      Color,
      Underline,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value || '',
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL', prev ?? 'https://');
    if (url === null) return;
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="richtext-wrap" id={id}>
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="rt-toolbar">
        <StyleDropdown editor={editor} />

        <span className="rt-sep" />

        <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
          <strong>B</strong>
        </ToolBtn>
        <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
          <em>I</em>
        </ToolBtn>
        <ToolBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)">
          <u>U</u>
        </ToolBtn>
        <ToolBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
          <s>S</s>
        </ToolBtn>

        <span className="rt-sep" />

        <ColorBtn editor={editor} />

        <span className="rt-sep" />

        <ToolBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
          {/* bullet list icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="9" y1="6" x2="20" y2="6" /><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
            <line x1="9" y1="12" x2="20" y2="12" /><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <line x1="9" y1="18" x2="20" y2="18" /><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        </ToolBtn>
        <ToolBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
          {/* ordered list icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
            <text x="2" y="8" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">1.</text>
            <text x="2" y="14" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">2.</text>
            <text x="2" y="20" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">3.</text>
          </svg>
        </ToolBtn>

        <span className="rt-sep" />

        <ToolBtn active={editor.isActive('link')} onClick={setLink} title="Link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </ToolBtn>

        <ToolBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
          </svg>
        </ToolBtn>

        <ToolBtn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
          </svg>
        </ToolBtn>

        <ToolBtn active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="20" height="18" rx="2" />
            <polyline points="8 8 4 12 8 16" /><polyline points="16 8 20 12 16 16" />
          </svg>
        </ToolBtn>

        <ToolBtn active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" />
          </svg>
        </ToolBtn>
      </div>

      {/* ── Editor area ───────────────────────────────────────────────────── */}
      <EditorContent
        editor={editor}
        className="rt-content"
        aria-required={required}
      />
    </div>
  );
}
