/**
 * Database seed — idempotent (safe to re-run).
 * Creates: 1 client, 5 demo users (all roles), 2 projects, memberships,
 * standard form templates, and project form configs.
 *
 * Demo credentials (password: Demo1234!):
 *   super@provana.com       → SUPER_ADMIN  (all projects)
 *   admin@blg.com           → ADMIN        (both projects)
 *   agent@blg.com           → AGENT        (BLG project only)
 *   client@blg.com          → CLIENT       (Stonebridge project)
 *   pending@blg.com         → PENDING      (no project yet)
 */
import { PrismaClient } from '@prisma/client';
import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { STANDARD_TEMPLATES } from '../src/Modules/FormTemplates/standardTemplates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STONEBRIDGE_ICON = readFileSync(join(__dirname, 'stonebridge_icon.txt'), 'utf8').trim();

const prisma        = new PrismaClient();
const scryptAsync   = promisify(scrypt);
const KEY_LEN       = 64;

const DEMO_CLIENT_ID   = '00000000-0000-0000-0000-000000000001';
const PROJECT_BLG_ID   = '00000000-0000-0000-0001-000000000001';
const PROJECT_STONE_ID = '00000000-0000-0000-0001-000000000002';

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key  = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

const DEMO_PASSWORD = 'Demo1234!';

const DEMO_USERS = [
  { id: '00000000-0000-0000-0002-000000000001', email: 'super@provana.com',  displayName: 'Super Admin',     role: 'SUPER_ADMIN' as const, projects: [PROJECT_BLG_ID, PROJECT_STONE_ID] },
  { id: '00000000-0000-0000-0002-000000000002', email: 'admin@blg.com',      displayName: 'BLG Admin',       role: 'ADMIN'       as const, projects: [PROJECT_BLG_ID, PROJECT_STONE_ID] },
  { id: '00000000-0000-0000-0002-000000000003', email: 'agent@blg.com',      displayName: 'BLG Agent',       role: 'AGENT'       as const, projects: [PROJECT_BLG_ID] },
  { id: '00000000-0000-0000-0002-000000000004', email: 'client@blg.com',     displayName: 'BLG Client',      role: 'CLIENT'      as const, projects: [PROJECT_STONE_ID] },
  { id: '00000000-0000-0000-0002-000000000005', email: 'pending@blg.com',    displayName: 'Pending User',    role: null,                   projects: [] },
] as const;

const STANDARD_SLUGS = ['new-report', 'new-page', 'new-feature', 'fix-issue', 'view-request'] as const;

async function main() {
  console.log('Seeding database…');

  // ── 1. Client ──────────────────────────────────────────────────────────────
  await prisma.client.upsert({
    where:  { id: DEMO_CLIENT_ID },
    update: {},
    create: { id: DEMO_CLIENT_ID, name: 'Bell Legal Group', prefix: 'CBLPBR' },
  });

  // ── 2. Ref counter (start at 629 so first new request = CBLPBR-630) ───────
  await prisma.clientRefCounter.upsert({
    where:  { clientId: DEMO_CLIENT_ID },
    update: {},
    create: { clientId: DEMO_CLIENT_ID, lastValue: 629 },
  });

  // ── 3. Projects ────────────────────────────────────────────────────────────
  await prisma.project.upsert({
    where:  { id: PROJECT_BLG_ID },
    update: { name: 'BLG Power BI', iconUrl: null },
    create: {
      id: PROJECT_BLG_ID, clientId: DEMO_CLIENT_ID,
      name: 'BLG Power BI', slug: 'blg-power-bi',
      description: 'Bell Legal Group — Power BI report requests',
      iconUrl: null, // uses the Bell monogram fallback in the UI
    },
  });
  await prisma.project.upsert({
    where:  { id: PROJECT_STONE_ID },
    update: { name: 'Stonebridge Analytics', iconUrl: STONEBRIDGE_ICON },
    create: {
      id: PROJECT_STONE_ID, clientId: DEMO_CLIENT_ID,
      name: 'Stonebridge Analytics', slug: 'stonebridge',
      description: 'Stonebridge — analytics and dashboard requests',
      iconUrl: STONEBRIDGE_ICON,
    },
  });

  // ── 4. Demo users ──────────────────────────────────────────────────────────
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const u of DEMO_USERS) {
    await prisma.portalUser.upsert({
      where:  { id: u.id },
      update: {}, // don't overwrite password or role changes made by tests
      create: {
        id:           u.id,
        clientId:     DEMO_CLIENT_ID,
        authUserId:   u.id, // for local-jwt, authUserId = portalUser.id (userId in JWT sub)
        email:        u.email,
        displayName:  u.displayName,
        role:         u.role ?? null,
        passwordHash,
      },
    });

    // Project memberships (delete+recreate is safe — idempotent by design)
    await prisma.projectMember.deleteMany({ where: { userId: u.id } });
    if (u.projects.length > 0) {
      await prisma.projectMember.createMany({
        data: u.projects.map(projectId => ({ projectId, userId: u.id })),
        skipDuplicates: true,
      });
    }
  }

  // ── 5. Standard form templates — always upsert fieldSchema so re-seeding ────
  //       picks up any field changes made in standardTemplates.ts
  const templateIds: Record<string, string> = {};
  for (const tpl of STANDARD_TEMPLATES) {
    const fieldSchemaJson = JSON.stringify(tpl.fieldSchema);
    const row = await prisma.formTemplate.upsert({
      where:  { clientId_slug: { clientId: DEMO_CLIENT_ID, slug: tpl.slug } },
      update: { name: tpl.name, description: tpl.description, fieldSchema: fieldSchemaJson },
      create: {
        clientId: DEMO_CLIENT_ID, name: tpl.name, slug: tpl.slug,
        description: tpl.description, fieldSchema: fieldSchemaJson, isStandard: true,
      },
    });
    templateIds[tpl.slug] = row.id;
  }

  // ── 6. Project form configs (all templates enabled for both projects) ──────
  for (const projectId of [PROJECT_BLG_ID, PROJECT_STONE_ID]) {
    for (const [i, slug] of STANDARD_SLUGS.entries()) {
      const templateId = templateIds[slug];
      if (!templateId) continue;
      await prisma.projectFormConfig.upsert({
        where:  { projectId_templateId: { projectId, templateId } },
        update: {},
        create: { projectId, templateId, isEnabled: true, sortOrder: i },
      });
    }
  }

  console.log('Seed complete:');
  console.log('  Client:   Bell Legal Group (CBLPBR)');
  console.log('  Projects: BLG Power BI, Stonebridge Analytics');
  console.log('  Users:    super@provana.com | admin@blg.com | agent@blg.com | client@blg.com | pending@blg.com');
  console.log('  Password: Demo1234! (all demo users)');
}

main()
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
