/**
 * Attachments API client. multipart/form-data POSTs are NOT routed through the
 * generic api/client.ts (which serializes JSON); we build them here instead.
 */

const BASE = import.meta.env['VITE_API_URL'] ?? '/api';

function getToken(): string | null {
  return sessionStorage.getItem('access_token');
}

export interface AttachmentView {
  id:          string;
  requestId:   string;
  commentId:   string | null;
  fileName:    string;
  contentType: string;
  size:        number;
  storageKey:  string;
  uploadedBy:  string;
  uploadedAt:  string;
  signedUrl:   string;
}

export const attachmentsApi = {
  /** Upload a single file to a request. Returns the AttachmentView (with signedUrl). */
  async upload(requestId: string, file: File): Promise<{ data: AttachmentView | null; error: { message: string } | null }> {
    const formData = new FormData();
    formData.append('file', file);

    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // IMPORTANT: do NOT set Content-Type — the browser sets it with the multipart boundary

    try {
      const res = await fetch(`${BASE}/requests/${requestId}/attachments`, {
        method: 'POST', headers, body: formData,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) return { data: null, error: { message: json?.detail ?? `HTTP ${res.status}` } };
      return { data: json as AttachmentView, error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : 'Network error' } };
    }
  },

  /** List attachments for a request. */
  async list(requestId: string): Promise<{ data: AttachmentView[]; error: { message: string } | null }> {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${BASE}/requests/${requestId}/attachments`, { headers });
      const json = await res.json().catch(() => null);
      if (!res.ok) return { data: [], error: { message: json?.detail ?? `HTTP ${res.status}` } };
      return { data: (json?.data ?? []) as AttachmentView[], error: null };
    } catch (err) {
      return { data: [], error: { message: err instanceof Error ? err.message : 'Network error' } };
    }
  },

  /**
   * Upload an array of files sequentially. Best-effort per file: a single failure does
   * NOT abort the whole batch — failures are logged + counted, and the returned object
   * tells the caller how many succeeded.
   *
   * @param onProgress called between uploads with a status string suitable for UI display
   */
  async uploadAll(
    requestId: string,
    files: File[],
    onProgress?: (status: string) => void,
  ): Promise<{ succeeded: number; failed: number }> {
    let succeeded = 0;
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      onProgress?.(`Uploading ${i + 1}/${files.length}: ${f.name}…`);
      const { error } = await attachmentsApi.upload(requestId, f);
      if (error) {
        failed++;
        console.error(`[attachmentsApi] upload failed for ${f.name}:`, error.message);
      } else {
        succeeded++;
      }
    }
    return { succeeded, failed };
  },

  /**
   * Upload a file from the CommentEditor inline attach button.
   * Uses the request-scoped attachment endpoint; the storageKey is embedded
   * in the comment body as an img src proxy URL: /api/comment-files/{storageKey}
   */
  async uploadForComment(
    requestId: string,
    file: File,
  ): Promise<{ data: AttachmentView | null; error: { message: string } | null }> {
    return attachmentsApi.upload(requestId, file);
  },

  /** Delete an attachment. */
  async remove(requestId: string, attId: string): Promise<{ error: { message: string } | null }> {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${BASE}/requests/${requestId}/attachments/${attId}`, {
        method: 'DELETE', headers,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        return { error: { message: json?.detail ?? `HTTP ${res.status}` } };
      }
      return { error: null };
    } catch (err) {
      return { error: { message: err instanceof Error ? err.message : 'Network error' } };
    }
  },
};
