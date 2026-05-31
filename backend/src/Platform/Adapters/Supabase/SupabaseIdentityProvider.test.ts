import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { SupabaseIdentityProvider } from './SupabaseIdentityProvider.js';

const SECRET = 'test-jwt-secret-for-vitest-only';
const USER_ID  = '550e8400-e29b-41d4-a716-446655440000';
const CLIENT_A = '00000000-0000-0000-0000-000000000001';
const CLIENT_B = '00000000-0000-0000-0000-000000000002';

/** Build a Supabase-shaped JWT for tests. */
function signToken(claims: Record<string, unknown>, opts: { expiresIn?: string; algorithm?: jwt.Algorithm; secret?: string } = {}): string {
  const base = {
    sub: USER_ID,
    email: 'user@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    ...claims,
  };
  return jwt.sign(base, opts.secret ?? SECRET, {
    algorithm: opts.algorithm ?? 'HS256',
    expiresIn: opts.expiresIn ?? '1h',
  });
}

describe('SupabaseIdentityProvider', () => {
  const provider = new SupabaseIdentityProvider({ jwtSecret: SECRET });

  describe('constructor', () => {
    it('throws when jwtSecret is empty', () => {
      expect(() => new SupabaseIdentityProvider({ jwtSecret: '' })).toThrow(/jwtSecret is required/);
    });
  });

  describe('verify() — happy path', () => {
    it('extracts userId, email, clientId from a valid token (app_metadata)', async () => {
      const token = signToken({ app_metadata: { client_id: CLIENT_A } });
      const identity = await provider.verify(token);
      expect(identity.userId).toBe(USER_ID);
      expect(identity.email).toBe('user@example.com');
      expect(identity.clientId).toBe(CLIENT_A);
    });

    it('prefers app_metadata.client_id over user_metadata.client_id (security)', async () => {
      const token = signToken({
        app_metadata:  { client_id: CLIENT_A },
        user_metadata: { client_id: CLIENT_B },   // user trying to override
      });
      const identity = await provider.verify(token);
      expect(identity.clientId).toBe(CLIENT_A);   // admin-set wins
    });

    it('falls back to user_metadata.client_id when app_metadata is absent', async () => {
      const token = signToken({ user_metadata: { client_id: CLIENT_B } });
      const identity = await provider.verify(token);
      expect(identity.clientId).toBe(CLIENT_B);
    });

    it('uses full_name from user_metadata as displayName', async () => {
      const token = signToken({
        app_metadata:  { client_id: CLIENT_A },
        user_metadata: { full_name: 'Yosman Ovallos' },
      });
      const identity = await provider.verify(token);
      expect(identity.displayName).toBe('Yosman Ovallos');
    });

    it('falls back to email as displayName when no full_name', async () => {
      const token = signToken({ app_metadata: { client_id: CLIENT_A } });
      const identity = await provider.verify(token);
      expect(identity.displayName).toBe('user@example.com');
    });
  });

  describe('verify() — rejection cases', () => {
    it('rejects an expired token', async () => {
      const token = signToken({ app_metadata: { client_id: CLIENT_A } }, { expiresIn: '-1s' });
      await expect(provider.verify(token)).rejects.toThrow(/Invalid or expired/);
    });

    it('rejects a token signed with a different secret', async () => {
      const token = signToken({ app_metadata: { client_id: CLIENT_A } }, { secret: 'wrong-secret' });
      await expect(provider.verify(token)).rejects.toThrow(/Invalid or expired/);
    });

    it('rejects garbage strings', async () => {
      await expect(provider.verify('not-a-jwt')).rejects.toThrow(/Invalid or expired/);
      await expect(provider.verify('')).rejects.toThrow(/Invalid or expired/);
    });

    it('rejects "alg: none" tokens (alg-confusion defence)', async () => {
      // Manually craft an unsigned JWT with alg=none
      const header  = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        sub: USER_ID, email: 'evil@example.com', aud: 'authenticated', exp: Math.floor(Date.now()/1000) + 3600,
        app_metadata: { client_id: CLIENT_A },
      })).toString('base64url');
      const noneToken = `${header}.${payload}.`;
      await expect(provider.verify(noneToken)).rejects.toThrow(/Invalid or expired/);
    });

    it('rejects tokens with wrong audience (e.g. anon role)', async () => {
      const token = signToken({ aud: 'anon', app_metadata: { client_id: CLIENT_A } });
      await expect(provider.verify(token)).rejects.toThrow(/audience must be "authenticated"/);
    });

    it('rejects when client_id is missing and no fallback configured', async () => {
      const token = signToken({});   // no client_id anywhere
      await expect(provider.verify(token)).rejects.toThrow(/no client_id claim/);
    });
  });

  describe('verify() — fallback clientId (dev only)', () => {
    const devProvider = new SupabaseIdentityProvider({
      jwtSecret: SECRET,
      fallbackClientId: CLIENT_A,
    });

    it('uses fallback when token has no client_id', async () => {
      const token = signToken({});
      const identity = await devProvider.verify(token);
      expect(identity.clientId).toBe(CLIENT_A);
    });

    it('still prefers app_metadata.client_id over fallback', async () => {
      const token = signToken({ app_metadata: { client_id: CLIENT_B } });
      const identity = await devProvider.verify(token);
      expect(identity.clientId).toBe(CLIENT_B);   // explicit claim wins over fallback
    });
  });
});
