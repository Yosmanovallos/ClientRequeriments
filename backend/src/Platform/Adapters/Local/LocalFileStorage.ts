import type { IFileStorage, FileRef } from '../../Ports/IFileStorage';

/**
 * LocalFileStorage — keeps files in a Map in memory.
 * Signed URLs are just data-URIs so the upload round-trip works without any cloud service.
 */
export class LocalFileStorage implements IFileStorage {
  private readonly store = new Map<string, { data: Buffer; contentType: string }>();

  async upload(key: string, data: Buffer, contentType: string): Promise<FileRef> {
    this.store.set(key, { data, contentType });
    return { key, url: `data:${contentType};base64,${data.toString('base64')}` };
  }

  async getSignedUrl(key: string, _expiresInSeconds: number): Promise<string> {
    const entry = this.store.get(key);
    if (!entry) throw new Error(`File not found: ${key}`);
    return `data:${entry.contentType};base64,${entry.data.toString('base64')}`;
  }

  async download(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    return this.store.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
