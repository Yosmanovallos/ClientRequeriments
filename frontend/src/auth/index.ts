/**
 * Auth module — thin façade over the active identity provider.
 * VITE_AUTH_PROVIDER=local  → calls /api/auth/login (local-jwt backend adapter)
 * VITE_AUTH_PROVIDER=supabase (default) → uses Supabase client SDK
 * Migration to Entra: replace the supabase branch with MSAL — no other file changes needed.
 */
import { setToken, clearToken, api } from '../api/client';

const AUTH_PROVIDER     = import.meta.env['VITE_AUTH_PROVIDER'] ?? 'supabase';
const SUPABASE_URL      = import.meta.env['VITE_SUPABASE_URL']      ?? '';
const SUPABASE_ANON_KEY = import.meta.env['VITE_SUPABASE_ANON_KEY'] ?? '';

const IS_LOCAL    = AUTH_PROVIDER === 'local';
const IS_SUPABASE = !IS_LOCAL && !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export interface ProjectSummary {
  id:      string;
  name:    string;
  slug:    string;
  iconUrl: string | null;
}

export interface UserSession {
  userId:          string;
  email:           string;
  displayName:     string;
  accessToken:     string;
  role:            string | null;
  isActive:        boolean;
  projects:        ProjectSummary[];
  /** Explicit project membership IDs from ProjectMember rows.
   *  For AGENT/CLIENT this matches `projects`. For ADMIN it may be a subset
   *  of all tenant projects — used to scope the Forms configuration dropdown. */
  projectIds:      string[];
  /** Organization membership IDs from OrganizationMember rows.
   *  Used for org-based ticket visibility filtering on the CLIENT role. */
  organizationIds: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabase: { auth: { signInWithPassword: any; signOut: any; getSession: any } } | null = null;

if (IS_SUPABASE) {
  // @ts-ignore
  import('@supabase/supabase-js').then((mod: any) => {
    supabase = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }).catch(() => { /* stay in demo mode */ });
}

/** Enriches a verified token with role + projects + orgs from the backend. */
async function fetchEnrichment(
  userId: string, email: string, displayName: string, accessToken: string,
): Promise<UserSession> {
  const meRes = await api.get<{ role: string | null; isActive?: boolean; projectIds?: string[]; organizationIds?: string[] }>('/users/me');
  const role            = meRes.data?.role ?? null;
  const isActive        = meRes.data?.isActive ?? true;
  const projectIds      = meRes.data?.projectIds ?? [];
  const organizationIds = meRes.data?.organizationIds ?? [];

  let projects: ProjectSummary[] = [];
  if (role !== null && isActive) {
    const projRes = await api.get<{ data: Array<{ id: string; name: string; slug: string; iconUrl: string | null }> }>('/projects');
    projects = projRes.data?.data.map(p => ({ id: p.id, name: p.name, slug: p.slug, iconUrl: p.iconUrl ?? null })) ?? [];
  }

  return { userId, email, displayName, accessToken, role, isActive, projects, projectIds, organizationIds };
}

export const auth = {
  /** true when a real backend auth is configured (not pure demo mode). */
  isConfigured: IS_LOCAL || IS_SUPABASE,
  isLocal:      IS_LOCAL,

  async signIn(email: string, password: string): Promise<{ session: UserSession | null; error: string | null }> {
    if (IS_LOCAL) {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        return { session: null, error: body.detail ?? 'Login failed' };
      }
      const data = await res.json() as { accessToken: string; userId: string; email: string; displayName: string };
      setToken(data.accessToken);
      const session = await fetchEnrichment(data.userId, data.email, data.displayName, data.accessToken);
      return { session, error: null };
    }

    if (IS_SUPABASE && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { session: null, error: error.message };
      setToken(data.session.access_token);
      const session = await fetchEnrichment(
        data.user.id, data.user.email ?? '',
        data.user.user_metadata?.['full_name'] ?? data.user.email ?? '',
        data.session.access_token,
      );
      return { session, error: null };
    }

    return { session: null, error: 'No auth provider configured' };
  },

  async register(email: string, password: string, displayName: string): Promise<{ error: string | null }> {
    if (!IS_LOCAL) return { error: 'Self-registration only available in local mode' };
    const res = await fetch('/api/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password, displayName }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { detail?: string };
      return { error: body.detail ?? 'Registration failed' };
    }
    return { error: null };
  },

  async forgotPassword(email: string): Promise<{ error: string | null }> {
    if (!IS_LOCAL) return { error: 'Password reset only available in local mode' };
    const res = await fetch('/api/auth/forgot-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { detail?: string };
      return { error: body.detail ?? 'Request failed' };
    }
    return { error: null };
  },

  async resetPassword(token: string, password: string): Promise<{ error: string | null }> {
    const res = await fetch('/api/auth/reset-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { detail?: string };
      return { error: body.detail ?? 'Reset failed' };
    }
    return { error: null };
  },

  async signOut(): Promise<void> {
    if (supabase) await supabase.auth.signOut();
    clearToken();
    sessionStorage.removeItem('demo_session');
  },

  async getSession(): Promise<UserSession | null> {
    const token = sessionStorage.getItem('access_token');
    if (!token) return null;

    if (IS_LOCAL) {
      // Re-enrich from backend using the stored token (already set via setToken)
      try {
        const meRes = await api.get<{ id: string; email: string; displayName: string; role: string | null; isActive?: boolean; projectIds?: string[]; organizationIds?: string[] }>('/users/me');
        if (!meRes.data) return null;
        const role            = meRes.data.role ?? null;
        const isActive        = meRes.data.isActive ?? true;
        const projectIds      = meRes.data.projectIds ?? [];
        const organizationIds = meRes.data.organizationIds ?? [];
        let projects: ProjectSummary[] = [];
        if (role !== null && isActive) {
          const projRes = await api.get<{ data: Array<{ id: string; name: string; slug: string; iconUrl: string | null }> }>('/projects');
          projects = projRes.data?.data.map(p => ({ id: p.id, name: p.name, slug: p.slug, iconUrl: p.iconUrl ?? null })) ?? [];
        }
        return {
          userId:          meRes.data.id,
          email:           meRes.data.email,
          displayName:     meRes.data.displayName,
          accessToken:     token,
          role,
          isActive,
          projects,
          projectIds,
          organizationIds,
        };
      } catch {
        clearToken();
        return null;
      }
    }

    if (IS_SUPABASE && supabase) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;
      return fetchEnrichment(
        data.session.user.id,
        data.session.user.email ?? '',
        data.session.user.user_metadata?.['full_name'] ?? '',
        data.session.access_token,
      );
    }

    return null;
  },
};
