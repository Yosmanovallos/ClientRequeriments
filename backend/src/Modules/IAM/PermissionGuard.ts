import { PERMISSIONS, hasMinRole, type Permission, type Role } from './Role.js';
import { Errors } from '../../Shared/errors.js';

/**
 * Permission helpers — call these from endpoint handlers to enforce access.
 *
 * Pattern:
 *   app.post('/projects', async (req, reply) => {
 *     requirePermission(req.user, 'projects.create');
 *     // ... handler logic
 *   });
 *
 * Throws AppError (401 / 403) on denial — caught by the problem+json error handler.
 */

interface UserContext {
  // Accepts the wire type `string | null | undefined` (from UserIdentity); we narrow internally.
  role?:            Role | string | null;
  isActive?:        boolean;
  projectIds?:      string[];
  organizationIds?: string[];
  clientId?:        string;
}

/** Narrow an unknown string to a known Role, returning null if unknown / pending. */
function narrowRole(role: UserContext['role']): Role | null {
  if (role == null) return null;
  const known: ReadonlyArray<Role> = ['SUPER_ADMIN', 'ADMIN', 'AGENT', 'CLIENT'];
  return (known as ReadonlyArray<string>).includes(role) ? (role as Role) : null;
}

/** Throws 401 if not authenticated, 403 if pending, 403 if role rank insufficient. */
export function requirePermission(user: UserContext | null | undefined, action: Permission): void {
  if (!user)              throw Errors.unauthorized('Not authenticated');
  if (user.isActive === false) throw Errors.forbidden('Account is deactivated');
  const role = narrowRole(user.role);
  if (role == null)  throw Errors.forbidden('PENDING_APPROVAL');

  const required = PERMISSIONS[action];
  if (!hasMinRole(role, required)) {
    throw Errors.forbidden(`Insufficient role for "${action}" — requires ${required} or higher`);
  }
}

/**
 * Verify the user has access to a specific project.
 * SuperAdmin and Admin (same client) implicitly pass — they see everything in their tenant.
 * Agent/Client must be an explicit member.
 *
 * Pass `projectClientId` so we can short-circuit Admin access without a DB roundtrip.
 */
export function requireProjectAccess(
  user: UserContext | null | undefined,
  projectId: string,
  projectClientId?: string,
): void {
  if (!user) throw Errors.unauthorized('Not authenticated');
  if (user.isActive === false) throw Errors.forbidden('Account is deactivated');
  const role = narrowRole(user.role);
  if (role == null) throw Errors.forbidden('PENDING_APPROVAL');

  // SuperAdmin sees every project across every client
  if (role === 'SUPER_ADMIN') return;

  // Admin sees every project in their own client.
  // When projectClientId is provided, validate it matches; when omitted, trust that the
  // calling endpoint already scopes all data by req.user.clientId (safe by construction).
  if (role === 'ADMIN') {
    if (!projectClientId || projectClientId === user.clientId) return;
    throw Errors.forbidden('No access to this project');
  }

  // Agent / Client need explicit membership
  if (user.projectIds?.includes(projectId)) return;

  throw Errors.forbidden('No access to this project');
}

/** Filter a list of project IDs down to the ones the user can see. SuperAdmin sees all. */
export function visibleProjectIds(user: UserContext, allProjectIds: string[]): string[] {
  const role = narrowRole(user.role);
  if (role === 'SUPER_ADMIN') return allProjectIds;
  if (role === 'ADMIN') return allProjectIds;        // same-client filter happens in repo query
  return allProjectIds.filter(id => user.projectIds?.includes(id));
}

/**
 * Verify the user has access to a specific organization.
 *   SuperAdmin: always passes.
 *   Admin (same client): always passes.
 *   Agent: must be a member of the org's project.
 *   Client: must be an explicit org member.
 */
export function requireOrganizationAccess(
  user: UserContext | null | undefined,
  org: { id: string; clientId: string; projectId: string },
): void {
  if (!user) throw Errors.unauthorized('Not authenticated');
  if (user.isActive === false) throw Errors.forbidden('Account is deactivated');
  const role = narrowRole(user.role);
  if (role == null) throw Errors.forbidden('PENDING_APPROVAL');

  if (role === 'SUPER_ADMIN') return;

  if (role === 'ADMIN') {
    if (org.clientId === user.clientId) return;
    throw Errors.forbidden('No access to this organization');
  }

  if (role === 'AGENT') {
    if (user.projectIds?.includes(org.projectId)) return;
    throw Errors.forbidden('No access to this organization');
  }

  // CLIENT: must be an explicit member
  if (user.organizationIds?.includes(org.id)) return;
  throw Errors.forbidden('No access to this organization');
}
