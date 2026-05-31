import type { FastifyRequest, FastifyReply } from 'fastify';
import type { IIdentityProvider, UserIdentity } from '../Platform/Ports/IIdentityProvider';
import type { IUserRepository } from '../Modules/IAM/UserRepository.js';
import { Errors } from './errors';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserIdentity;
  }
}

/**
 * Auth middleware factory.
 *
 * Pipeline per request:
 *   1. Skip PUBLIC_PATHS (no auth)
 *   2. Verify Bearer token via IIdentityProvider (token-level — userId, clientId, email)
 *   3. Enrich identity with role + projectIds + isActive from the user repository
 *      (DB lookup — role and project membership are NOT in the token; SuperAdmin can
 *      change them without forcing token re-issue)
 *   4. Reject deactivated accounts (403)
 *   5. PENDING users (role=null) pass auth — they're allowed to call `/users/me`
 *      and the pending-approval flow, but permission guards on other endpoints
 *      will reject them with `PENDING_APPROVAL`.
 *
 * If `userRepo` is omitted (e.g. during early bootstrap before IAM is wired),
 * the middleware falls back to a permissive identity (role=null, no projects).
 * In demo/local mode this lets unauthenticated demo tokens get through with
 * the seeded role assigned by tests/seed.
 */
export function authMiddleware(identity: IIdentityProvider, userRepo?: IUserRepository) {
  const PUBLIC_PATHS = new Set([
      '/health', '/favicon.ico',
      '/auth/login', '/auth/register',
      '/webhooks/github', '/webhooks/azuredevops',
    ]);

  return async function (req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (PUBLIC_PATHS.has(req.url)) return;

    const header = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw Errors.unauthorized('Missing Bearer token');

    const token = header.slice(7);
    let base: UserIdentity;
    try {
      base = await identity.verify(token);
    } catch {
      throw Errors.unauthorized('Invalid or expired token');
    }

    // Enrich with role + project membership from DB
    if (userRepo) {
      const portalUser = await userRepo.findByAuthUserId(base.userId);
      if (portalUser) {
        if (!portalUser.isActive) throw Errors.forbidden('Account is deactivated');
        req.user = {
          ...base,
          role:       portalUser.role,
          projectIds: portalUser.projectIds,
          isActive:   portalUser.isActive,
        };
        return;
      }
      // First-time sign-in: user authenticated via IdP but doesn't exist in PortalUser yet.
      // Auto-provision as PENDING — they'll hit the approval queue.
      const created = await userRepo.create({
        clientId:    base.clientId,
        authUserId:  base.userId,
        email:       base.email,
        displayName: base.displayName,
      });
      req.user = {
        ...base,
        role:       created.role,         // null → PENDING
        projectIds: [],
        isActive:   created.isActive,
      };
      return;
    }

    // No userRepo wired — fall through with base identity (role=undefined → permission guards block).
    // This is a development convenience; production always passes a repo.
    req.user = base;
  };
}
