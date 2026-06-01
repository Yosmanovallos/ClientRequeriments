export interface ISanitizer {
  /** Sanitize an HTML string, stripping disallowed tags and attributes. */
  sanitize(html: string): string;
}
