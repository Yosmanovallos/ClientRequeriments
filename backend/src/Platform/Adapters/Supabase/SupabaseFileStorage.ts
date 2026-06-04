import type { IFileStorage, FileRef } from '../../Ports/IFileStorage.js';

/**
 * Supabase Storage adapter for IFileStorage.
 *
 * Uses native fetch against the Supabase Storage REST API — no @supabase/supabase-js SDK.
 * Same rationale as SupabaseIdentityProvider: lighter deps, no per-request overhead, and we
 * already authenticate with the project's service-role key for server-to-server calls.
 *
 * REST surface (https://supabase.com/docs/reference/api/storage-api-reference):
 *   POST   /storage/v1/object/{bucket}/{key}      → upload
 *   POST   /storage/v1/object/sign/{bucket}/{key} → create signed URL
 *   DELETE /storage/v1/object/{bucket}/{key}      → delete
 */

export interface SupabaseStorageConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  bucket: string;
}

export class SupabaseFileStorage implements IFileStorage {
  private readonly base: string;
  private readonly headers: Record<string, string>;

  constructor(private readonly config: SupabaseStorageConfig) {
    if (!config.supabaseUrl)    throw new Error('SupabaseFileStorage: supabaseUrl is required');
    if (!config.serviceRoleKey) throw new Error('SupabaseFileStorage: serviceRoleKey is required');
    if (!config.bucket)         throw new Error('SupabaseFileStorage: bucket is required');

    this.base = `${config.supabaseUrl.replace(/\/$/, '')}/storage/v1`;
    this.headers = {
      'Authorization': `Bearer ${config.serviceRoleKey}`,
      'apikey':        config.serviceRoleKey,
    };
  }

  async upload(key: string, data: Buffer, contentType: string): Promise<FileRef> {
    const url = `${this.base}/object/${this.config.bucket}/${encodeKey(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: new Uint8Array(data),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`SupabaseFileStorage upload failed: ${res.status} ${msg}`);
    }
    // Public path; for protected buckets the consumer should call getSignedUrl.
    const publicUrl = `${this.config.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${this.config.bucket}/${encodeKey(key)}`;
    return { key, url: publicUrl };
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const url = `${this.base}/object/sign/${this.config.bucket}/${encodeKey(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`SupabaseFileStorage signed URL failed: ${res.status} ${msg}`);
    }
    const body = await res.json() as { signedURL?: string; signedUrl?: string };
    const path = body.signedURL ?? body.signedUrl;
    if (!path) throw new Error('SupabaseFileStorage: signed URL missing from response');
    // Supabase returns a relative path like "/object/sign/bucket/key?token=..."
    return `${this.config.supabaseUrl.replace(/\/$/, '')}/storage/v1${path}`;
  }

  async download(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    const url = `${this.base}/object/${this.config.bucket}/${encodeKey(key)}`;
    const res = await fetch(url, { method: 'GET', headers: this.headers });
    if (res.status === 404) return null;
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`SupabaseFileStorage download failed: ${res.status} ${msg}`);
    }
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    const arrayBuffer = await res.arrayBuffer();
    return { data: Buffer.from(arrayBuffer), contentType };
  }

  async delete(key: string): Promise<void> {
    const url = `${this.base}/object/${this.config.bucket}/${encodeKey(key)}`;
    const res = await fetch(url, { method: 'DELETE', headers: this.headers });
    if (!res.ok && res.status !== 404) {  // 404 = already gone → idempotent
      const msg = await res.text().catch(() => '');
      throw new Error(`SupabaseFileStorage delete failed: ${res.status} ${msg}`);
    }
  }
}

/** Encode each path segment but keep '/' so we can use forward-slash keys. */
function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}
