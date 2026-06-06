import React, { useRef, useEffect, useState } from 'react';
import ImageLightbox from './ImageLightbox';
import { sanitizeHtml } from '../lib/sanitize';

interface Props {
  body: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Renders a comment body.
 * - Rich-text (HTML): body starts with '<' — sanitized via DOMPurify before rendering.
 *   Clicking an image opens a lightbox.
 * - Legacy plain-text: escaped and wrapped in <p>.
 */
export default function CommentBody({ body }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  const isHtml = body.trimStart().startsWith('<');

  useEffect(() => {
    if (!isHtml || !containerRef.current) return;
    const imgs = containerRef.current.querySelectorAll('img');
    const handlers: Array<() => void> = [];
    imgs.forEach(img => {
      const handler = () => setLightbox({ src: img.src, alt: img.alt });
      img.addEventListener('click', handler);
      img.style.cursor = 'zoom-in';
      handlers.push(() => img.removeEventListener('click', handler));
    });
    return () => handlers.forEach(cleanup => cleanup());
  }, [body, isHtml]);

  return (
    <>
      <div
        ref={containerRef}
        className="comment-body"
        dangerouslySetInnerHTML={{
          __html: isHtml ? sanitizeHtml(body) : `<p>${escapeHtml(body)}</p>`,
        }}
      />
      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}
