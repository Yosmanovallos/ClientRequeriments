/**
 * Roles and the permission matrix.
 *
 * Roles are stored in PortalUser.role as strings (null = PENDING approval).
 * Higher rank = more privileges. SuperAdmin > Admin > Agent > Client > Pending.
 *
 * The permission matrix here is the SINGLE SOURCE OF TRUTH for what each role can do.
 * Endpoints call `requireRole()` / `requireProjectAccess()` from PermissionGuard.ts —
 * which read this matrix. Frontend code mirrors these rules but the server is authoritative.
 */

export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'AGENT', 'CLIENT'] as const;
export type Role = typeof ROLES[number];

/** Rank-ordered: higher number = more privileges. PENDING (null) is implicit rank 0. */
export const ROLE_RANK: Record<Role, number> = {
  CLIENT:      1,
  AGENT:       2,
  ADMIN:       3,
  SUPER_ADMIN: 4,
};

/** Internal roles that act on the BI team's behalf (vs. external customers). */
export const INTERNAL_ROLES: ReadonlySet<Role> = new Set(['SUPER_ADMIN', 'ADMIN', 'AGENT']);

export function hasMinRole(actual: Role | null | undefined, required: Role): boolean {
  if (!actual) return false;
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export function isInternal(role: Role | null | undefined): boolean {
  return !!role && INTERNAL_ROLES.has(role);
}

/**
 * Per-action permission matrix. Maps a logical action key → minimum role required.
 * For project-scoped actions, callers ALSO check ProjectAccess (see PermissionGuard).
 *
 * Keep this table tight — add an entry per new endpoint so the policy is auditable in one place.
 */
export const PERMISSIONS = {
  // Control Panel
  'controlpanel.access':         'ADMIN',

  // Clients (only SuperAdmin)
  'clients.create':              'SUPER_ADMIN',
  'clients.update':              'SUPER_ADMIN',
  'clients.delete':              'SUPER_ADMIN',
  'clients.list':                'SUPER_ADMIN',

  // Projects
  'projects.create':             'ADMIN',
  'projects.update':             'ADMIN',
  'projects.archive':            'ADMIN',
  'projects.list':               'CLIENT',           // filtered server-side by membership
  'projects.read':               'CLIENT',           // + project access check
  'projects.members.add':        'ADMIN',
  'projects.members.remove':     'ADMIN',
  'projects.members.list':       'CLIENT',           // + project access check

  // Form Templates
  'formtemplates.create':        'ADMIN',
  'formtemplates.update':        'ADMIN',
  'formtemplates.delete':        'ADMIN',
  'formtemplates.list':          'ADMIN',
  'formtemplates.read':          'CLIENT',           // anyone can read a template they have via a project
  'formtemplates.configure':     'ADMIN',            // enable/disable per project

  // Users
  'users.list':                  'ADMIN',
  'users.invite':                'ADMIN',
  'users.update':                'ADMIN',
  'users.assign_role':           'ADMIN',            // + role-cap check (Admin can't make someone SuperAdmin)
  'users.assign_projects':       'ADMIN',
  'users.activate':              'ADMIN',
  'users.read_self':             'CLIENT',           // /users/me always allowed for active users

  // Requests
  'requests.create':             'CLIENT',           // + project access check
  'requests.read':               'CLIENT',           // + project access + ownership filter
  'requests.update_status':      'AGENT',            // + project access check
  'requests.list':               'CLIENT',           // server filters by what they can see

  // Attachments / Comments
  'attachments.upload':          'CLIENT',           // + ownership / project access
  'attachments.download':        'CLIENT',
  'attachments.delete':          'AGENT',
  'comments.create':             'CLIENT',
  'comments.read':               'CLIENT',
  'comments.internal':           'AGENT',            // only internal users see internal-visibility comments
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Role-cap rule: Admin can assign Admin/Agent/Client but NOT SuperAdmin.
 * SuperAdmin can assign any role. Used by /users/:id/role.
 */
export function canAssignRole(assigner: Role | null, targetRole: Role): boolean {
  if (assigner === 'SUPER_ADMIN') return true;
  if (assigner === 'ADMIN')       return targetRole !== 'SUPER_ADMIN';
  return false;
}
