import { describe, it, expect, beforeEach } from 'vitest';
import { UserService } from './UserService.js';
import { InMemoryUserRepository } from './UserRepository.js';
import { InMemoryProjectRepository } from './ProjectRepository.js';

const CLIENT_A = '00000000-0000-0000-0000-000000000001';

async function makeStack() {
  const users    = new InMemoryUserRepository();
  const projects = new InMemoryProjectRepository();
  const svc      = new UserService({ users, projects });
  return { svc, users, projects };
}

describe('UserService.create + me', () => {
  it('creates a user with role=null (PENDING) by default', async () => {
    const { svc } = await makeStack();
    const u = await svc.create({
      clientId: CLIENT_A, authUserId: 'auth-1',
      email: 'a@b.com', displayName: 'A B',
    });
    expect(u.role).toBeNull();
    expect(u.isActive).toBe(true);
  });

  it('rejects missing email', async () => {
    const { svc } = await makeStack();
    await expect(svc.create({
      clientId: CLIENT_A, authUserId: 'auth-1', email: '   ', displayName: 'X',
    })).rejects.toThrow(/email is required/);
  });

  it('me() returns the user + projectIds (empty array when none)', async () => {
    const { svc } = await makeStack();
    await svc.create({ clientId: CLIENT_A, authUserId: 'auth-me', email: 'm@e.com', displayName: 'Me' });
    const me = await svc.me('auth-me');
    expect(me.email).toBe('m@e.com');
    expect(me.projectIds).toEqual([]);
  });

  it('me() throws 404 for unknown authUserId', async () => {
    const { svc } = await makeStack();
    await expect(svc.me('does-not-exist')).rejects.toThrow(/not found/);
  });
});

describe('UserService.setRole — privilege escalation prevention', () => {
  it('SuperAdmin can assign any role', async () => {
    const { svc } = await makeStack();
    const u = await svc.create({ clientId: CLIENT_A, authUserId: 'a', email: 'u@e.com', displayName: 'U' });

    for (const role of ['SUPER_ADMIN', 'ADMIN', 'AGENT', 'CLIENT'] as const) {
      const updated = await svc.setRole({ userId: u.id, role, assignerRole: 'SUPER_ADMIN' });
      expect(updated.role).toBe(role);
    }
  });

  it('Admin can assign Admin/Agent/Client but NOT SuperAdmin', async () => {
    const { svc } = await makeStack();
    const u = await svc.create({ clientId: CLIENT_A, authUserId: 'a', email: 'u@e.com', displayName: 'U' });
    await expect(svc.setRole({ userId: u.id, role: 'SUPER_ADMIN', assignerRole: 'ADMIN' }))
      .rejects.toThrow(/privilege escalation/);
    // Other roles allowed
    await expect(svc.setRole({ userId: u.id, role: 'ADMIN', assignerRole: 'ADMIN' })).resolves.toBeDefined();
    await expect(svc.setRole({ userId: u.id, role: 'AGENT', assignerRole: 'ADMIN' })).resolves.toBeDefined();
    await expect(svc.setRole({ userId: u.id, role: 'CLIENT', assignerRole: 'ADMIN' })).resolves.toBeDefined();
  });

  it('Setting role to null resets to PENDING (allowed regardless of assigner check)', async () => {
    const { svc } = await makeStack();
    const u = await svc.create({ clientId: CLIENT_A, authUserId: 'a', email: 'u@e.com', displayName: 'U' });
    await svc.setRole({ userId: u.id, role: 'AGENT', assignerRole: 'SUPER_ADMIN' });
    const reverted = await svc.setRole({ userId: u.id, role: null, assignerRole: 'ADMIN' });
    expect(reverted.role).toBeNull();
  });
});

describe('UserService.setProjectMemberships', () => {
  it('assigns multiple projects + getById sees the updates', async () => {
    const { svc, projects } = await makeStack();
    const u  = await svc.create({ clientId: CLIENT_A, authUserId: 'a', email: 'u@e.com', displayName: 'U' });
    const p1 = await projects.create({ clientId: CLIENT_A, name: 'P1', slug: 'p1' });
    const p2 = await projects.create({ clientId: CLIENT_A, name: 'P2', slug: 'p2' });

    await svc.setProjectMemberships(u.id, [p1.id, p2.id]);
    const me = await svc.me('a');
    expect(me.projectIds.sort()).toEqual([p1.id, p2.id].sort());
  });

  it('REPLACES (not appends) the membership set', async () => {
    const { svc, projects } = await makeStack();
    const u  = await svc.create({ clientId: CLIENT_A, authUserId: 'a', email: 'u@e.com', displayName: 'U' });
    const p1 = await projects.create({ clientId: CLIENT_A, name: 'P1', slug: 'p1' });
    const p2 = await projects.create({ clientId: CLIENT_A, name: 'P2', slug: 'p2' });

    await svc.setProjectMemberships(u.id, [p1.id]);
    await svc.setProjectMemberships(u.id, [p2.id]);                  // replace, don't append
    const me = await svc.me('a');
    expect(me.projectIds).toEqual([p2.id]);
  });

  it('rejects non-existent projectIds (catches typos)', async () => {
    const { svc } = await makeStack();
    const u = await svc.create({ clientId: CLIENT_A, authUserId: 'a', email: 'u@e.com', displayName: 'U' });
    await expect(svc.setProjectMemberships(u.id, ['11111111-1111-1111-1111-111111111111']))
      .rejects.toThrow(/do not exist/);
  });
});

describe('UserService.setup — one-shot role + projects', () => {
  it('assigns role and projects atomically', async () => {
    const { svc, projects } = await makeStack();
    const u  = await svc.create({ clientId: CLIENT_A, authUserId: 'a', email: 'u@e.com', displayName: 'U' });
    const p1 = await projects.create({ clientId: CLIENT_A, name: 'P1', slug: 'p1' });

    const result = await svc.setup({
      userId: u.id,
      cmd:    { role: 'AGENT', projectIds: [p1.id] },
      assignerRole: 'SUPER_ADMIN',
    });

    expect(result.role).toBe('AGENT');
    expect(result.projectIds).toEqual([p1.id]);
  });

  it('rejects role assignment that violates assigner cap', async () => {
    const { svc, projects } = await makeStack();
    const u  = await svc.create({ clientId: CLIENT_A, authUserId: 'a', email: 'u@e.com', displayName: 'U' });
    const p1 = await projects.create({ clientId: CLIENT_A, name: 'P1', slug: 'p1' });
    await expect(svc.setup({
      userId: u.id,
      cmd:    { role: 'SUPER_ADMIN', projectIds: [p1.id] },
      assignerRole: 'ADMIN',
    })).rejects.toThrow(/privilege escalation/);
  });
});

describe('UserService.listPending', () => {
  it('returns only users with role=null', async () => {
    const { svc } = await makeStack();
    const a = await svc.create({ clientId: CLIENT_A, authUserId: 'a', email: 'a@e.com', displayName: 'A' });
    await svc.create({ clientId: CLIENT_A, authUserId: 'b', email: 'b@e.com', displayName: 'B' });
    await svc.setRole({ userId: a.id, role: 'CLIENT', assignerRole: 'SUPER_ADMIN' });

    const pending = await svc.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.email).toBe('b@e.com');
  });

  it('clientId filter scopes the list (Admin view)', async () => {
    const { svc } = await makeStack();
    await svc.create({ clientId: CLIENT_A, authUserId: 'a', email: 'a@e.com', displayName: 'A' });
    await svc.create({ clientId: '99999999-9999-9999-9999-999999999999', authUserId: 'z', email: 'z@e.com', displayName: 'Z' });

    const aOnly = await svc.listPending(CLIENT_A);
    expect(aOnly).toHaveLength(1);
    expect(aOnly[0]!.email).toBe('a@e.com');
  });
});
