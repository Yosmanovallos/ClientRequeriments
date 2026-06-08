import { fromBuffer } from 'file-type';

const ALLOWED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.pdf', '.docx', '.xlsx', '.txt', '.zip',
  '.mp4', '.mov', '.webm',
]);

/**
 * Validates a file upload by:
 *  1. Checking the file extension against an allowlist
 *  2. Sniffing the first 4 096 bytes for the actual MIME type (magic bytes)
 *
 * Returns an error message string on failure, or null on success.
 */
export async function validateUpload(fileName: string, data: Buffer): Promise<string | null> {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return `File type "${ext}" is not allowed. Permitted: ${[...ALLOWED_EXTENSIONS].join(', ')}`;
  }

  // Plain text files have no magic bytes — skip magic-byte check and trust the extension
  if (ext === '.txt') return null;

  const result = await fromBuffer(data.slice(0, 4096));
  if (!result) {
    return 'Could not determine file type from content. File may be corrupt or unsupported.';
  }
  if (!ALLOWED_MIMES.has(result.mime)) {
    return `File content type "${result.mime}" is not allowed.`;
  }
  return null;
}
