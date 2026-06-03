/**
 * Database seed — idempotent (safe to re-run).
 * Creates: 1 client, 5 demo users (all roles), standard form templates.
 * Projects are NOT seeded — they must be connected from Azure DevOps via the Control Panel.
 *
 * Demo credentials (password: Demo1234!):
 *   super@provana.com  → SUPER_ADMIN
 *   admin@blg.com      → ADMIN
 *   agent@blg.com      → AGENT
 *   client@blg.com     → CLIENT
 *   pending@blg.com    → PENDING (no role assigned yet)
 */
import { PrismaClient } from '@prisma/client';
import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { STANDARD_TEMPLATES } from '../src/Modules/FormTemplates/standardTemplates.js';

const prisma      = new PrismaClient();
const scryptAsync = promisify(scrypt);
const KEY_LEN     = 64;

const DEMO_CLIENT_ID = '00000000-0000-0000-0000-000000000001';

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key  = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

const DEMO_PASSWORD = 'Demo1234!';

const DEMO_USERS = [
  { id: '00000000-0000-0000-0002-000000000001', email: 'super@provana.com', displayName: 'Super Admin',  role: 'SUPER_ADMIN' as const },
  { id: '00000000-0000-0000-0002-000000000002', email: 'admin@blg.com',     displayName: 'BLG Admin',    role: 'ADMIN'       as const },
  { id: '00000000-0000-0000-0002-000000000003', email: 'agent@blg.com',     displayName: 'BLG Agent',    role: 'AGENT'       as const },
  { id: '00000000-0000-0000-0002-000000000004', email: 'client@blg.com',    displayName: 'BLG Client',   role: 'CLIENT'      as const },
  { id: '00000000-0000-0000-0002-000000000005', email: 'pending@blg.com',   displayName: 'Pending User', role: null },
] as const;

async function main() {
  console.log('Seeding database…');

  // ── 1. Client ──────────────────────────────────────────────────────────────
  await prisma.client.upsert({
    where:  { id: DEMO_CLIENT_ID },
    update: {},
    create: { id: DEMO_CLIENT_ID, name: 'Bell Legal Group', prefix: 'CBLPBR' },
  });

  // ── 2. Ref counter (start at 0 — increments on first request) ─────────────
  await prisma.clientRefCounter.upsert({
    where:  { clientId: DEMO_CLIENT_ID },
    update: {},
    create: { clientId: DEMO_CLIENT_ID, lastValue: 0 },
  });

  // ── 3. Demo users ──────────────────────────────────────────────────────────
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const u of DEMO_USERS) {
    await prisma.portalUser.upsert({
      where:  { id: u.id },
      update: {},
      create: {
        id:          u.id,
        clientId:    DEMO_CLIENT_ID,
        authUserId:  u.id,
        email:       u.email,
        displayName: u.displayName,
        role:        u.role ?? null,
        passwordHash,
      },
    });
  }

  // ── 4. Standard form templates ─────────────────────────────────────────────
  for (const tpl of STANDARD_TEMPLATES) {
    const fieldSchemaJson = JSON.stringify(tpl.fieldSchema);
    await prisma.formTemplate.upsert({
      where:  { clientId_slug: { clientId: DEMO_CLIENT_ID, slug: tpl.slug } },
      update: { name: tpl.name, description: tpl.description, fieldSchema: fieldSchemaJson },
      create: {
        clientId: DEMO_CLIENT_ID, name: tpl.name, slug: tpl.slug,
        description: tpl.description, fieldSchema: fieldSchemaJson, isStandard: true,
      },
    });
  }

  console.log('Seed complete:');
  console.log('  Client:   Bell Legal Group (CBLPBR)');
  console.log('  Projects: none — connect from Azure DevOps via Control Panel → Projects');
  console.log('  Users:    super@provana.com | admin@blg.com | agent@blg.com | client@blg.com | pending@blg.com');
  console.log('  Password: Demo1234! (all demo users)');
}

main()
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
