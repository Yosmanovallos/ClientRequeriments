/**
 * API client — one thin function per endpoint group.
 * Business logic never calls fetch() directly; it uses these typed functions.
 * To switch from Supabase direct → backend API, only this file changes.
 */

const BASE = import.meta.env['VITE_API_URL'] ?? '/api';

function getToken(): string | null {
  return sessionStorage.getItem('access_token');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: T | null; error: { message: string } | null }> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return { data: null, error: { message: json?.detail ?? `HTTP ${res.status}` } };
    }
    return { data: json as T, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Network error' } };
  }
}

export const api = {
  get:    <T>(path: string)                => request<T>('GET', path),
  post:   <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put:    <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch:  <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string)               => request<T>('DELETE', path),
};

/** Store the token after login (called by auth/index.ts) */
export function setToken(token: string): void {
  sessionStorage.setItem('access_token', token);
}

export function clearToken(): void {
  sessionStorage.removeItem('access_token');
}
