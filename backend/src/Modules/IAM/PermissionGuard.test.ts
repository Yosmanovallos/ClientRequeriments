import { describe, it, expect } from 'vitest';
import { requirePermission, requireProjectAccess, visibleProjectIds } from './PermissionGuard.js';
import { canAssignRole, hasMinRole } from './Role.js';

const CLIENT_A = '00000000-0000-0000-0000-000000000001';
const CLIENT_B = '00000000-0000-0000-0000-000000000002';

describe('Role helpers', () => {
  describe('hasMinRole', () => {
    it('returns true when actual rank ≥ required', () => {
      expect(hasMinRole('SUPER_ADMIN', 'CLIENT')).toBe(true);
      expect(hasMinRole('ADMIN', 'AGENT')).toBe(true);
      expect(hasMinRole('AGENT', 'AGENT')).toBe(true);
    });
    it('returns false when below required', () => {
      expect(hasMinRole('CLIENT', 'AGENT')).toBe(false);
      expect(hasMinRole('AGENT', 'ADMIN')).toBe(false);
      expect(hasMinRole('ADMIN', 'SUPER_ADMIN')).toBe(false);
    });
    it('rejects null/undefined (pending) for any required role', () => {
      expect(hasMinRole(null, 'CLIENT')).toBe(false);
      expect(hasMinRole(undefined, 'CLIENT')).toBe(false);
    });
  });

  describe('canAssignRole', () => {
    it('SuperAdmin can assign any role including SuperAdmin', () => {
      expect(canAssignRole('SUPER_ADMIN', 'SUPER_ADMIN')).toBe(true);
      expect(canAssignRole('SUPER_ADMIN', 'ADMIN')).toBe(true);
      expect(canAssignRole('SUPER_ADMIN', 'CLIENT')).toBe(true);
    });
    it('Admin can assign Admin/Agent/Client but NOT SuperAdmin (privilege escalation prevention)', () => {
      expect(canAssignRole('ADMIN', 'ADMIN')).toBe(true);
      expect(canAssignRole('ADMIN', 'AGENT')).toBe(true);
      expect(canAssignRole('ADMIN', 'CLIENT')).toBe(true);
      expect(canAssignRole('ADMIN', 'SUPER_ADMIN')).toBe(false);
    });
    it('Agent and Client cannot assign anyone', () => {
      expect(canAssignRole('AGENT', 'CLIENT')).toBe(false);
      expect(canAssignRole('CLIENT', 'CLIENT')).toBe(false);
    });
    it('Pending (null) cannot assign anyone', () => {
      expect(canAssignRole(null, 'CLIENT')).toBe(false);
    });
  });
});

describe('requirePermission', () => {
  it('throws 401 when user is null (not authenticated)', () => {
    expect(() => requirePermission(null, 'requests.create')).toThrow(/Not authenticated/);
  });

  it('throws 403 PENDING_APPROVAL for pending users (role=null)', () => {
    expect(() => requirePermission({ role: null }, 'requests.create')).toThrow(/PENDING_APPROVAL/);
  });

  it('throws 403 for deactivated users even with a role', () => {
    expect(() => requirePermission({ role: 'ADMIN', isActive: false }, 'requests.create')).toThrow(/deactivated/);
  });

  it('passes when role rank meets minimum', () => {
    expect(() => requirePermission({ role: 'SUPER_ADMIN' }, 'clients.create')).not.toThrow();
    expect(() => requirePermission({ role: 'ADMIN' }, 'projects.create')).not.toThrow();
    expect(() => requirePermission({ role: 'AGENT' }, 'requests.update_status')).not.toThrow();
    expect(() => requirePermission({ role: 'CLIENT' }, 'requests.create')).not.toThrow();
  });

  it('throws 403 with descriptive error when below minimum', () => {
    expect(() => requirePermission({ role: 'CLIENT' }, 'requests.update_status'))
      .toThrow(/Insufficient role for "requests\.update_status" — requires AGENT or higher/);
  });

  it('throws 403 for Admin trying SuperAdmin-only actions', () => {
    expect(() => requirePermission({ role: 'ADMIN' }, 'clients.create'))
      .toThrow(/Insufficient role/);
  });
});

describe('requireProjectAccess', () => {
  it('SuperAdmin passes for any project, any client', () => {
    expect(() => requireProjectAccess(
      { role: 'SUPER_ADMIN', clientId: CLIENT_A, projectIds: [] },
      'p-1', CLIENT_B,
    )).not.toThrow();
  });

  it('Admin passes for projects in their own client only', () => {
    expect(() => requireProjectAccess(
      { role: 'ADMIN', clientId: CLIENT_A, projectIds: [] },
      'p-1', CLIENT_A,
    )).not.toThrow();
  });

  it('Admin is REJECTED for projects in other clients (cross-tenant defence)', () => {
    expect(() => requireProjectAccess(
      { role: 'ADMIN', clientId: CLIENT_A, projectIds: [] },
      'p-1', CLIENT_B,
    )).toThrow(/No access/);
  });

  it('Agent / Client need explicit membership', () => {
    expect(() => requireProjectAccess(
      { role: 'AGENT', clientId: CLIENT_A, projectIds: ['p-1', 'p-2'] },
      'p-1', CLIENT_A,
    )).not.toThrow();

    expect(() => requireProjectAccess(
      { role: 'AGENT', clientId: CLIENT_A, projectIds: ['p-1'] },
      'p-2', CLIENT_A,
    )).toThrow(/No access/);
  });

  it('Pending users rejected', () => {
    expect(() => requireProjectAccess({ role: null, projectIds: ['p-1'] }, 'p-1'))
      .toThrow(/PENDING_APPROVAL/);
  });

  it('throws 401 when user is null', () => {
    expect(() => requireProjectAccess(null, 'p-1'))
      .toThrow(/Not authenticated/);
  });
});

describe('visibleProjectIds', () => {
  it('SuperAdmin sees every project ID passed', () => {
    expect(visibleProjectIds({ role: 'SUPER_ADMIN' }, ['p-1', 'p-2', 'p-3'])).toEqual(['p-1', 'p-2', 'p-3']);
  });
  it('Admin sees all in the same-client list (filter happens at repo level)', () => {
    expect(visibleProjectIds({ role: 'ADMIN' }, ['p-1', 'p-2'])).toEqual(['p-1', 'p-2']);
  });
  it('Agent/Client see only their assigned projects', () => {
    expect(visibleProjectIds(
      { role: 'AGENT', projectIds: ['p-2'] },
      ['p-1', 'p-2', 'p-3'],
    )).toEqual(['p-2']);
  });
});
