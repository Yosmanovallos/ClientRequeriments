import sanitizeHtml from 'sanitize-html';
import type { ISanitizer } from '../../Ports/ISanitizer.js';

type Attrs = Record<string, string>;

/**
 * Sanitizes rich-text HTML from TipTap before persisting to the DB.
 * Allowlist: common formatting tags only; img src must start with /api/comment-files/
 * (proxy URL) to block data URIs and external hotlinks. href limited to http/https.
 */
export class SanitizeHtmlSanitizer implements ISanitizer {
  sanitize(html: string): string {
    return sanitizeHtml(html, {
      allowedTags: [
        'p', 'br', 'strong', 'em', 'u', 's',
        'ul', 'ol', 'li',
        'h1', 'h2', 'h3', 'h4',
        'a', 'blockquote', 'pre', 'code',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'img',
      ],
      allowedAttributes: {
        a:   ['href', 'rel', 'target'],
        img: ['src', 'alt', 'width', 'height'],
      },
      transformTags: {
        img: (_tagName, attribs) => {
          const src = (attribs['src'] ?? '').trim();
          if (!src.startsWith('/api/comment-files/')) {
            // Strip any img with non-proxy src (data URIs, external URLs, javascript:)
            return { tagName: 'span', attribs: {} as Attrs };
          }
          return {
            tagName: 'img',
            attribs: { src, alt: attribs['alt'] ?? '' } as Attrs,
          };
        },
        a: (_tagName, attribs) => {
          const href = (attribs['href'] ?? '').trim();
          if (!href.startsWith('http://') && !href.startsWith('https://')) {
            return { tagName: 'span', attribs: {} as Attrs };
          }
          return {
            tagName: 'a',
            attribs: { href, rel: 'noopener noreferrer', target: '_blank' } as Attrs,
          };
        },
      },
    });
  }
}
