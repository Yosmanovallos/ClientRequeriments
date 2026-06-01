/**
 * Org-based ticket visibility tests.
 *
 * Scenarios verified:
 * 1. Legacy request (organizationId=null, own) visible to creator via byCreator
 * 2. Org-tagged request visible to org member via byOrg
 * 3. Org-tagged request NOT visible to non-member of same project
 * 4. Non-own, non-org request invisible to CLIENT
 * 5. organizationIds=[] (no orgs) — only own requests visible
 * 6. createdBy unset + organizationIds set — only byOrg matches, byCreator never fires
 * 7. AGENT ignores org filter — sees all project requests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRequestsRepository }       from '../Requests/RequestsRepository.js';
import { InMemoryOrganizationRepository }   from './OrganizationRepository.js';
import { InMemoryUserRepository }           from '../IAM/UserRepository.js';
import { OrganizationService }              from './OrganizationService.js';

const CLIENT_ID  = '00000000-0000-0000-0000-000000000001';
const PROJECT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_A_ID  = 'user-aaaa-0000-0000-0000-000000000001';
const USER_B_ID  = 'user-bbbb-0000-0000-0000-000000000001';

function makeRepos() {
  const requestsRepo = new InMemoryRequestsRepository();
  const orgRepo      = new InMemoryOrganizationRepository();
  const userRepo     = new InMemoryUserRepository();
  const orgSvc       = new OrganizationService({ orgs: orgRepo, users: userRepo });
  return { requestsRepo, orgRepo, userRepo, orgSvc };
}

/** Minimal create helper — fills required fields. */
async function makeRequest(
  repo: InMemoryRequestsRepository,
  overrides: { organizationId?: string | null; createdBy?: string; title?: string },
) {
  return repo.create({
    id:             crypto.randomUUID(),
    reference:      'TEST-1',
    clientId:       CLIENT_ID,
    projectId:      PROJECT_ID,
    organizationId: overrides.organizationId ?? null,
    requestType:    'new_report',
    title:          overrides.title ?? 'Test Request',
    priority:       'Medium',
    dueDate:        null,
    payload:        {},
    idempotencyKey: null,
    createdBy:      overrides.createdBy ?? 'creator@example.com',
  });
}

describe('org-based ticket visibility (InMemory)', () => {
  let ctx: ReturnType<typeof makeRepos>;
  let orgId: string;

  beforeEach(async () => {
    ctx = makeRepos();
    // Seed an org
    const org = await ctx.orgRepo.create({
      id:          crypto.randomUUID(),
      clientId:    CLIENT_ID,
      projectId:   PROJECT_ID,
      name:        'Acme Corp',
      description: null,
    });
    orgId = org.id;
  });

  // ── Scenario 1 ──────────────────────────────────────────────────────────
  it('legacy request (organizationId=null) is visible to its creator', async () => {
    const req = await makeRequest(ctx.requestsRepo, { createdBy: 'alice@example.com' });

    const rows = await ctx.requestsRepo.list(CLIENT_ID, {
      projectIds:      [PROJECT_ID],
      createdBy:       'alice@example.com',
      organizationIds: [],          // alice has no org memberships
    });

    expect(rows.map(r => r.id)).toContain(req.id);
  });

  // ── Scenario 2 ──────────────────────────────────────────────────────────
  it('org-tagged request is visible to a member of that org', async () => {
    const req = await makeRequest(ctx.requestsRepo, {
      organizationId: orgId,
      createdBy:      'bob@example.com',  // different user created it
    });

    // alice is a member of the org
    await ctx.orgRepo.addMember(orgId, USER_A_ID);
    await ctx.userRepo.addOrgMembership(USER_A_ID, orgId);

    const rows = await ctx.requestsRepo.list(CLIENT_ID, {
      projectIds:      [PROJECT_ID],
      createdBy:       'alice@example.com',
      organizationIds: [orgId],
    });

    expect(rows.map(r => r.id)).toContain(req.id);
  });

  // ── Scenario 3 ──────────────────────────────────────────────────────────
  it('org-tagged request is NOT visible to a non-member (same project)', async () => {
    await makeRequest(ctx.requestsRepo, {
      organizationId: orgId,
      createdBy:      'bob@example.com',
    });

    // carol is NOT a member of the org
    const rows = await ctx.requestsRepo.list(CLIENT_ID, {
      projectIds:      [PROJECT_ID],
      createdBy:       'carol@example.com',
      organizationIds: [],              // no org memberships
    });

    expect(rows).toHaveLength(0);
  });

  // ── Scenario 4 ──────────────────────────────────────────────────────────
  it('non-own, non-org request is invisible to CLIENT', async () => {
    // Request created by someone else and NOT tagged to alice's org
    await makeRequest(ctx.requestsRepo, {
      organizationId: null,
      createdBy:      'other@example.com',
    });

    const rows = await ctx.requestsRepo.list(CLIENT_ID, {
      projectIds:      [PROJECT_ID],
      createdBy:       'alice@example.com',
      organizationIds: [],
    });

    expect(rows).toHaveLength(0);
  });

  // ── Scenario 5 ──────────────────────────────────────────────────────────
  it('CLIENT with no org memberships sees only their own requests', async () => {
    const mine   = await makeRequest(ctx.requestsRepo, { createdBy: 'alice@example.com' });
    const others = await makeRequest(ctx.requestsRepo, { createdBy: 'bob@example.com' });

    const rows = await ctx.requestsRepo.list(CLIENT_ID, {
      projectIds:      [PROJECT_ID],
      createdBy:       'alice@example.com',
      organizationIds: [],
    });

    expect(rows.map(r => r.id)).toContain(mine.id);
    expect(rows.map(r => r.id)).not.toContain(others.id);
  });

  // ── Scenario 6 ──────────────────────────────────────────────────────────
  it('byCreator does NOT fire when createdBy is absent (prevents false positives)', async () => {
    const req = await makeRequest(ctx.requestsRepo, {
      organizationId: orgId,
      createdBy:      'owner@example.com',
    });

    // Query with organizationIds set but no createdBy
    // Only byOrg should match — byCreator must not coalesce to true
    const inOrg = await ctx.requestsRepo.list(CLIENT_ID, {
      projectIds:      [PROJECT_ID],
      // no createdBy
      organizationIds: [orgId],
    });

    // Should find the request via byOrg
    expect(inOrg.map(r => r.id)).toContain(req.id);

    // Separately verify that an unrelated request (diff org) is not pulled in
    const anotherOrgId = crypto.randomUUID();
    const unrelated = await makeRequest(ctx.requestsRepo, {
      organizationId: anotherOrgId,
      createdBy:      'stranger@example.com',
    });

    const narrow = await ctx.requestsRepo.list(CLIENT_ID, {
      projectIds:      [PROJECT_ID],
      organizationIds: [orgId],   // only this org, no createdBy
    });

    expect(narrow.map(r => r.id)).not.toContain(unrelated.id);
  });

  // ── Scenario 7 ──────────────────────────────────────────────────────────
  it('AGENT filter (projectIds only, no createdBy/organizationIds) sees all project requests', async () => {
    const req1 = await makeRequest(ctx.requestsRepo, { createdBy: 'alice@example.com', title: 'R1' });
    const req2 = await makeRequest(ctx.requestsRepo, {
      createdBy: 'bob@example.com', organizationId: orgId, title: 'R2',
    });

    const rows = await ctx.requestsRepo.list(CLIENT_ID, {
      projectIds: [PROJECT_ID],
      // no createdBy, no organizationIds — AGENT scope
    });

    expect(rows.map(r => r.id)).toContain(req1.id);
    expect(rows.map(r => r.id)).toContain(req2.id);
  });
});

// ── OrganizationService unit tests ──────────────────────────────────────────
describe('OrganizationService', () => {
  let ctx: ReturnType<typeof makeRepos>;

  beforeEach(() => { ctx = makeRepos(); });

  it('creates an org and finds it by id', async () => {
    const org = await ctx.orgSvc.create({
      clientId:    CLIENT_ID,
      projectId:   PROJECT_ID,
      name:        'Test Org',
      description: null,
    });
    expect(org.name).toBe('Test Org');
    const found = await ctx.orgSvc.getById(org.id);
    expect(found.id).toBe(org.id);
  });

  it('rejects duplicate org names within the same project', async () => {
    await ctx.orgSvc.create({ clientId: CLIENT_ID, projectId: PROJECT_ID, name: 'Dup', description: null });
    await expect(
      ctx.orgSvc.create({ clientId: CLIENT_ID, projectId: PROJECT_ID, name: 'dup', description: null }),
    ).rejects.toThrow(/already exists/i);
  });

  it('allows same org name in different projects', async () => {
    const OTHER_PROJECT = 'bbbbbbbb-0000-0000-0000-000000000002';
    const a = await ctx.orgSvc.create({ clientId: CLIENT_ID, projectId: PROJECT_ID,    name: 'Shared', description: null });
    const b = await ctx.orgSvc.create({ clientId: CLIENT_ID, projectId: OTHER_PROJECT, name: 'Shared', description: null });
    expect(a.id).not.toBe(b.id);
  });

  it('addMember syncs the user org membership cache', async () => {
    const org = await ctx.orgSvc.create({ clientId: CLIENT_ID, projectId: PROJECT_ID, name: 'X', description: null });

    // Seed a portal user so userRepo knows about them
    const user = await ctx.userRepo.create({
      clientId:    CLIENT_ID,
      authUserId:  'auth-uid-001',
      email:       'member@example.com',
      displayName: 'Test Member',
    });

    await ctx.orgSvc.addMember(org.id, user.id);

    const orgIds = await ctx.userRepo.listOrgIdsForUser(user.id);
    expect(orgIds).toContain(org.id);
  });

  it('removeMember removes the user from org membership cache', async () => {
    const org = await ctx.orgSvc.create({ clientId: CLIENT_ID, projectId: PROJECT_ID, name: 'Y', description: null });
    const user = await ctx.userRepo.create({
      clientId:    CLIENT_ID,
      authUserId:  'auth-uid-002',
      email:       'member2@example.com',
      displayName: 'Test Member 2',
    });

    await ctx.orgSvc.addMember(org.id, user.id);
    await ctx.orgSvc.removeMember(org.id, user.id);

    const orgIds = await ctx.userRepo.listOrgIdsForUser(user.id);
    expect(orgIds).not.toContain(org.id);
  });

  it('delete cleans up all member org-cache entries', async () => {
    const org = await ctx.orgSvc.create({ clientId: CLIENT_ID, projectId: PROJECT_ID, name: 'Z', description: null });
    const user = await ctx.userRepo.create({
      clientId:    CLIENT_ID,
      authUserId:  'auth-uid-003',
      email:       'member3@example.com',
      displayName: 'Test Member 3',
    });

    await ctx.orgSvc.addMember(org.id, user.id);
    await ctx.orgSvc.delete(org.id);

    const orgIds = await ctx.userRepo.listOrgIdsForUser(user.id);
    expect(orgIds).not.toContain(org.id);
    await expect(ctx.orgSvc.getById(org.id)).rejects.toThrow(/not found/i);
  });
});
