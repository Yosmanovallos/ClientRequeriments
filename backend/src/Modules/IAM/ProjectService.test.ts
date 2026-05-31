import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectService } from './ProjectService.js';
import { InMemoryProjectRepository } from './ProjectRepository.js';

const CLIENT_A = '00000000-0000-0000-0000-000000000001';
const CLIENT_B = '00000000-0000-0000-0000-000000000002';

function makeService() {
  const repo = new InMemoryProjectRepository();
  return { svc: new ProjectService({ projects: repo }), repo };
}

describe('ProjectService.create', () => {
  it('creates a project with valid name + slug', async () => {
    const { svc } = makeService();
    const p = await svc.create({ clientId: CLIENT_A, name: 'BLG - Power BI', slug: 'blg-power-bi' });
    expect(p.id).toBeTruthy();
    expect(p.name).toBe('BLG - Power BI');
    expect(p.slug).toBe('blg-power-bi');
    expect(p.isActive).toBe(true);
  });

  it('rejects an empty name', async () => {
    const { svc } = makeService();
    await expect(svc.create({ clientId: CLIENT_A, name: '   ', slug: 'foo' })).rejects.toThrow(/name is required/);
  });

  it('rejects invalid slug formats', async () => {
    const { svc } = makeService();
    await expect(svc.create({ clientId: CLIENT_A, name: 'x', slug: 'has spaces' })).rejects.toThrow(/slug must be/);
    await expect(svc.create({ clientId: CLIENT_A, name: 'x', slug: '-leading-dash' })).rejects.toThrow(/slug must be/);
    await expect(svc.create({ clientId: CLIENT_A, name: 'x', slug: 'trailing-dash-' })).rejects.toThrow(/slug must be/);
    await expect(svc.create({ clientId: CLIENT_A, name: 'x', slug: 'UPPER' })).rejects.toThrow(/slug must be/);
  });

  it('rejects duplicate slugs within the same client (but allows the same slug in a different client)', async () => {
    const { svc } = makeService();
    await svc.create({ clientId: CLIENT_A, name: 'A', slug: 'shared' });
    await expect(svc.create({ clientId: CLIENT_A, name: 'A2', slug: 'shared' })).rejects.toThrow(/already exists/);
    // Different client → OK
    await expect(svc.create({ clientId: CLIENT_B, name: 'B', slug: 'shared' })).resolves.toBeDefined();
  });

  it('trims whitespace from the name', async () => {
    const { svc } = makeService();
    const p = await svc.create({ clientId: CLIENT_A, name: '   Padded Name   ', slug: 'padded' });
    expect(p.name).toBe('Padded Name');
  });
});

describe('ProjectService.list / listByIds', () => {
  it('lists projects in a single client', async () => {
    const { svc } = makeService();
    await svc.create({ clientId: CLIENT_A, name: 'A1', slug: 'a1' });
    await svc.create({ clientId: CLIENT_A, name: 'A2', slug: 'a2' });
    await svc.create({ clientId: CLIENT_B, name: 'B1', slug: 'b1' });

    const aOnly = await svc.list(CLIENT_A);
    expect(aOnly.map(p => p.name)).toEqual(['A1', 'A2']);
  });

  it('lists ALL projects when clientId is undefined (SuperAdmin view)', async () => {
    const { svc } = makeService();
    await svc.create({ clientId: CLIENT_A, name: 'A1', slug: 'a1' });
    await svc.create({ clientId: CLIENT_B, name: 'B1', slug: 'b1' });
    const all = await svc.list();
    expect(all).toHaveLength(2);
  });

  it('listByIds returns only the requested projects', async () => {
    const { svc } = makeService();
    const a1 = await svc.create({ clientId: CLIENT_A, name: 'A1', slug: 'a1' });
    await svc.create({ clientId: CLIENT_A, name: 'A2', slug: 'a2' });
    const b1 = await svc.create({ clientId: CLIENT_B, name: 'B1', slug: 'b1' });

    const some = await svc.listByIds([a1.id, b1.id]);
    expect(some.map(p => p.name).sort()).toEqual(['A1', 'B1']);
  });
});

describe('ProjectService.update / archive', () => {
  it('updates name and description', async () => {
    const { svc } = makeService();
    const p = await svc.create({ clientId: CLIENT_A, name: 'Old', slug: 'old' });
    const updated = await svc.update(p.id, { name: 'New', description: 'Now with detail' });
    expect(updated.name).toBe('New');
    expect(updated.description).toBe('Now with detail');
  });

  it('rejects empty name on update', async () => {
    const { svc } = makeService();
    const p = await svc.create({ clientId: CLIENT_A, name: 'Old', slug: 'old' });
    await expect(svc.update(p.id, { name: '  ' })).rejects.toThrow(/cannot be empty/);
  });

  it('archive sets isActive=false (soft delete)', async () => {
    const { svc } = makeService();
    const p = await svc.create({ clientId: CLIENT_A, name: 'P', slug: 'p' });
    await svc.archive(p.id);
    const found = await svc.getById(p.id);
    expect(found.isActive).toBe(false);
  });

  it('getById throws notFound for an unknown id', async () => {
    const { svc } = makeService();
    await expect(svc.getById('11111111-1111-1111-1111-111111111111')).rejects.toThrow(/not found/);
  });
});

describe('ProjectService members', () => {
  it('addMember is idempotent (same user → same row)', async () => {
    const { svc } = makeService();
    const p = await svc.create({ clientId: CLIENT_A, name: 'P', slug: 'p' });
    const u = '99999999-9999-9999-9999-999999999991';

    const m1 = await svc.addMember(p.id, u);
    const m2 = await svc.addMember(p.id, u);
    expect(m1.id).toBe(m2.id);

    const all = await svc.listMembers(p.id);
    expect(all).toHaveLength(1);
  });

  it('removeMember works + listMembers reflects it', async () => {
    const { svc } = makeService();
    const p = await svc.create({ clientId: CLIENT_A, name: 'P', slug: 'p' });
    const u1 = '99999999-9999-9999-9999-999999999991';
    const u2 = '99999999-9999-9999-9999-999999999992';

    await svc.addMember(p.id, u1);
    await svc.addMember(p.id, u2);
    expect((await svc.listMembers(p.id))).toHaveLength(2);

    await svc.removeMember(p.id, u1);
    const after = await svc.listMembers(p.id);
    expect(after).toHaveLength(1);
    expect(after[0]!.userId).toBe(u2);
  });

  it('removeMember on a non-existent membership is a no-op (idempotent)', async () => {
    const { svc } = makeService();
    const p = await svc.create({ clientId: CLIENT_A, name: 'P', slug: 'p' });
    await expect(svc.removeMember(p.id, '99999999-9999-9999-9999-999999999991')).resolves.not.toThrow();
  });
});
