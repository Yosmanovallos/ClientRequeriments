import jwt from 'jsonwebtoken';
import type { IIdentityProvider, UserIdentity } from '../../Ports/IIdentityProvider.js';

/**
 * Supabase-issued JWTs are standard HS256 tokens signed with the project's JWT secret.
 * Verifying offline (with the secret) is faster than calling supabase.auth.getUser() per request
 * — no network hop, no SDK dependency, identical security guarantees.
 *
 * All Supabase-specific knowledge (JWT shape, which claim holds the tenant ID, signing algorithm)
 * is encapsulated in THIS file. The Modules layer never sees any of it.
 */

interface SupabaseJwtPayload {
  sub:            string;       // Supabase user UUID
  email?:         string;
  aud:            string;       // must be "authenticated"
  exp:            number;
  app_metadata?:  { client_id?: string; [k: string]: unknown };  // admin-set (secure)
  user_metadata?: { full_name?: string; client_id?: string; [k: string]: unknown }; // user-modifiable
  role?:          string;
}

export interface SupabaseIdentityConfig {
  /** Supabase project JWT secret — Dashboard → Project Settings → API → JWT Secret */
  jwtSecret: string;
  /**
   * DEV-ONLY fallback when the token has no client_id claim.
   * Set via DEMO_FALLBACK_CLIENT_ID env var; leave unset in production.
   */
  fallbackClientId?: string;
}

export class SupabaseIdentityProvider implements IIdentityProvider {
  constructor(private readonly config: SupabaseIdentityConfig) {
    if (!config.jwtSecret) {
      throw new Error('SupabaseIdentityProvider: jwtSecret is required (set SUPABASE_JWT_SECRET)');
    }
  }

  async verify(token: string): Promise<UserIdentity> {
    let payload: SupabaseJwtPayload;
    try {
      // HS256 is the algorithm Supabase Auth uses for all access tokens.
      // Pinning the algorithm prevents alg-confusion attacks (e.g. "none").
      payload = jwt.verify(token, this.config.jwtSecret, {
        algorithms: ['HS256'],
      }) as SupabaseJwtPayload;
    } catch (err) {
      throw new Error(`Invalid or expired token: ${(err as Error).message}`);
    }

    if (payload.aud !== 'authenticated') {
      throw new Error(`Token audience must be "authenticated", got "${payload.aud}"`);
    }
    if (!payload.sub) {
      throw new Error('Token has no "sub" (user id) claim');
    }

    // Prefer app_metadata.client_id — set by admin, users cannot modify it.
    // Fall back to user_metadata.client_id (user-settable, less secure but valid for demo).
    // Final fallback to DEMO_FALLBACK_CLIENT_ID env var — dev-only escape hatch.
    const clientId =
      payload.app_metadata?.client_id
      ?? payload.user_metadata?.client_id
      ?? this.config.fallbackClientId;

    if (!clientId) {
      throw new Error(
        'Token has no client_id claim. Set app_metadata.client_id when inviting the user, ' +
        'or configure DEMO_FALLBACK_CLIENT_ID for dev.'
      );
    }

    return {
      userId:      payload.sub,
      clientId,
      email:       payload.email ?? '',
      displayName: payload.user_metadata?.full_name ?? payload.email ?? 'User',
    };
  }
}
