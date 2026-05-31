import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SupabaseFileStorage } from './SupabaseFileStorage.js';

const CONFIG = {
  supabaseUrl: 'https://xyz.supabase.co',
  serviceRoleKey: 'service-role-test-key',
  bucket: 'attachments',
};
const BASE = 'https://xyz.supabase.co/storage/v1';

describe('SupabaseFileStorage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  describe('constructor', () => {
    it('throws when supabaseUrl is missing', () => {
      expect(() => new SupabaseFileStorage({ ...CONFIG, supabaseUrl: '' })).toThrow(/supabaseUrl is required/);
    });
    it('throws when serviceRoleKey is missing', () => {
      expect(() => new SupabaseFileStorage({ ...CONFIG, serviceRoleKey: '' })).toThrow(/serviceRoleKey is required/);
    });
    it('throws when bucket is missing', () => {
      expect(() => new SupabaseFileStorage({ ...CONFIG, bucket: '' })).toThrow(/bucket is required/);
    });
  });

  describe('upload()', () => {
    it('POSTs to /storage/v1/object/{bucket}/{key} with auth + content-type + x-upsert', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{"Key":"attachments/foo.txt"}', { status: 200 }));
      const storage = new SupabaseFileStorage(CONFIG);

      const data = Buffer.from('hello world');
      const result = await storage.upload('client-1/req-1/foo.txt', data, 'text/plain');

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${BASE}/object/attachments/client-1/req-1/foo.txt`);
      expect(init.method).toBe('POST');
      expect(init.headers['Authorization']).toBe('Bearer service-role-test-key');
      expect(init.headers['apikey']).toBe('service-role-test-key');
      expect(init.headers['Content-Type']).toBe('text/plain');
      expect(init.headers['x-upsert']).toBe('true');
      expect(result.key).toBe('client-1/req-1/foo.txt');
      expect(result.url).toBe('https://xyz.supabase.co/storage/v1/object/public/attachments/client-1/req-1/foo.txt');
    });

    it('throws with Supabase error body on non-2xx', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{"error":"Duplicate"}', { status: 409 }));
      const storage = new SupabaseFileStorage(CONFIG);

      await expect(storage.upload('k', Buffer.from(''), 'text/plain')).rejects.toThrow(/upload failed: 409/);
    });

    it('encodes path segments correctly (spaces, special chars) but keeps slashes', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
      const storage = new SupabaseFileStorage(CONFIG);
      await storage.upload('client/with spaces/file (1).pdf', Buffer.from(''), 'application/pdf');

      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${BASE}/object/attachments/client/with%20spaces/file%20(1).pdf`);
    });
  });

  describe('getSignedUrl()', () => {
    it('POSTs to /object/sign/{bucket}/{key} with expiresIn and returns full URL', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        signedURL: '/object/sign/attachments/foo.txt?token=abc',
      }), { status: 200, headers: { 'content-type': 'application/json' } }));

      const storage = new SupabaseFileStorage(CONFIG);
      const signed = await storage.getSignedUrl('foo.txt', 3600);

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${BASE}/object/sign/attachments/foo.txt`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ expiresIn: 3600 });
      expect(signed).toBe('https://xyz.supabase.co/storage/v1/object/sign/attachments/foo.txt?token=abc');
    });

    it('also accepts the newer signedUrl (camelCase) field', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        signedUrl: '/object/sign/attachments/foo.txt?token=xyz',
      }), { status: 200, headers: { 'content-type': 'application/json' } }));

      const storage = new SupabaseFileStorage(CONFIG);
      const signed = await storage.getSignedUrl('foo.txt', 60);
      expect(signed).toBe('https://xyz.supabase.co/storage/v1/object/sign/attachments/foo.txt?token=xyz');
    });

    it('throws when neither signedURL nor signedUrl in response', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
      const storage = new SupabaseFileStorage(CONFIG);
      await expect(storage.getSignedUrl('foo.txt', 60)).rejects.toThrow(/signed URL missing/);
    });

    it('throws on non-2xx response', async () => {
      fetchMock.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
      const storage = new SupabaseFileStorage(CONFIG);
      await expect(storage.getSignedUrl('foo.txt', 60)).rejects.toThrow(/signed URL failed: 404/);
    });
  });

  describe('delete()', () => {
    it('DELETEs the object', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
      const storage = new SupabaseFileStorage(CONFIG);
      await storage.delete('foo/bar.txt');

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${BASE}/object/attachments/foo/bar.txt`);
      expect(init.method).toBe('DELETE');
    });

    it('is idempotent — 404 on delete does NOT throw', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }));
      const storage = new SupabaseFileStorage(CONFIG);
      await expect(storage.delete('foo/bar.txt')).resolves.toBeUndefined();
    });

    it('throws on 5xx error', async () => {
      fetchMock.mockResolvedValueOnce(new Response('Server error', { status: 500 }));
      const storage = new SupabaseFileStorage(CONFIG);
      await expect(storage.delete('foo/bar.txt')).rejects.toThrow(/delete failed: 500/);
    });
  });
});
