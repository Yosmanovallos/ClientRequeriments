import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { attachmentsApi } from '../api/attachments';

export interface CommentEditorHandle {
  clearContent(): void;
  isEmpty(): boolean;
}

interface Props {
  requestId: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function ToolbarBtn({
  active, disabled, title, onClick, children,
}: {
  active?: boolean; disabled?: boolean; title: string;
  onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`editor-tb-btn${active ? ' is-active' : ''}`}
    >
      {children}
    </button>
  );
}

const CommentEditor = forwardRef<CommentEditorHandle, Props>(
  ({ requestId, onChange, placeholder = 'Write a comment…' }, ref) => {
    const fileInputRef  = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = React.useState(false);

    /**
     * signedToProxy maps the signed URL (used as <img src> in the editor for live preview)
     * back to the proxy URL that gets stored in the DB.
     * On clearContent we also clear this map.
     */
    const signedToProxy = useRef(new Map<string, string>());

    /**
     * uploadRef is updated on every render so the paste handler always closes over the
     * current editor instance without causing a circular dependency in useEditor.
     */
    const uploadRef = useRef<((file: File) => Promise<void>) | null>(null);

    const editor = useEditor({
      extensions: [
        StarterKit,
        Underline,
        Link.configure({ openOnClick: false }),
        Image.configure({ inline: false }),
        Placeholder.configure({ placeholder }),
      ],
      content: '',
      onUpdate: ({ editor: e }) => {
        // Replace any signedUrls with their proxy counterparts before handing HTML to the
        // parent. This keeps proxy URLs in the saved comment body while letting the editor
        // display the real image during composition.
        let html = e.getHTML();
        signedToProxy.current.forEach((proxy, signed) => {
          // Escape regex special chars in the signed URL, then replace all occurrences
          const escaped = signed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          html = html.replace(new RegExp(escaped, 'g'), proxy);
        });
        onChange(html);
      },
      editorProps: {
        handlePaste(_view, event) {
          // Handle images pasted directly from clipboard (e.g. screenshots)
          const items = event.clipboardData?.items;
          if (!items) return false;
          for (const item of Array.from(items)) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) uploadRef.current?.(file);
              return true;
            }
          }
          return false;
        },
      },
    });

    // Keep uploadRef current so the paste handler has the latest editor + state references
    uploadRef.current = async (file: File) => {
      if (!editor || !requestId) return;
      setUploading(true);
      const { data, error } = await attachmentsApi.uploadForComment(requestId, file);
      setUploading(false);
      if (error || !data) {
        alert(`Upload failed: ${error?.message ?? 'Unknown error'}`);
        return;
      }
      const proxyUrl = `/api/comment-files/${data.storageKey}`;
      if (data.contentType.startsWith('image/')) {
        // Use the signed URL as src so the editor renders the image immediately,
        // then onUpdate swaps it back to proxyUrl before it reaches the server.
        signedToProxy.current.set(data.signedUrl, proxyUrl);
        editor.chain().focus().setImage({ src: data.signedUrl, alt: data.fileName }).run();
      } else {
        editor.chain().focus().insertContent(
          `<a href="${proxyUrl}">${data.fileName}</a>`
        ).run();
      }
    };

    useImperativeHandle(ref, () => ({
      clearContent: () => {
        editor?.commands.clearContent(true);
        signedToProxy.current.clear();
        onChange('');
      },
      isEmpty: () => !editor || editor.isEmpty,
    }));

    if (!editor) return null;

    const handleLinkToggle = () => {
      if (editor.isActive('link')) {
        editor.chain().focus().unsetLink().run();
      } else {
        const url = window.prompt('Enter URL:');
        if (url) editor.chain().focus().setLink({ href: url }).run();
      }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (file) uploadRef.current?.(file);
    };

    return (
      <div className="editor-wrap">
        <div className="editor-toolbar">
          <ToolbarBtn title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
            <strong>B</strong>
          </ToolbarBtn>
          <ToolbarBtn title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <em>I</em>
          </ToolbarBtn>
          <ToolbarBtn title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <u>U</u>
          </ToolbarBtn>
          <ToolbarBtn title="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <s>S</s>
          </ToolbarBtn>
          <span className="editor-tb-sep" />
          <ToolbarBtn title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            H1
          </ToolbarBtn>
          <ToolbarBtn title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            H2
          </ToolbarBtn>
          <ToolbarBtn title="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            H3
          </ToolbarBtn>
          <span className="editor-tb-sep" />
          <ToolbarBtn title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            ≡
          </ToolbarBtn>
          <ToolbarBtn title="Ordered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            1.
          </ToolbarBtn>
          <span className="editor-tb-sep" />
          <ToolbarBtn title="Blockquote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            "
          </ToolbarBtn>
          <ToolbarBtn title="Code block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
            {'</>'}
          </ToolbarBtn>
          <span className="editor-tb-sep" />
          <ToolbarBtn title="Link" active={editor.isActive('link')} onClick={handleLinkToggle}>
            🔗
          </ToolbarBtn>
          <ToolbarBtn
            title={uploading ? 'Uploading…' : 'Attach file / image'}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? '…' : '📎'}
          </ToolbarBtn>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.xlsx,.txt,.zip"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
        <div
          className="editor-content"
          onClick={() => editor.commands.focus()}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  },
);

CommentEditor.displayName = 'CommentEditor';
export default CommentEditor;
