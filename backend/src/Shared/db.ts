/**
 * Prisma client singleton.
 *
 * Lazy-loaded: the @prisma/client import only happens when DATABASE_URL is set.
 * This lets the backend run with InMemory repositories (no DB) when developing
 * locally — exactly as `Local` adapters do for the five ports.
 *
 * Phase 3 of the blueprint: real database behind a portable schema.
 * Migration to Azure SQL = change `provider` in schema.prisma + re-run migrations.
 * No code in Modules/ changes.
 */

import type { PrismaClient } from '@prisma/client';

let cached: PrismaClient | null = null;

export function isDbConfigured(): boolean {
  return Boolean(process.env['DATABASE_URL']);
}

export function getPrismaClient(): PrismaClient {
  if (cached) return cached;
  if (!isDbConfigured()) {
    throw new Error('DATABASE_URL is not set — cannot create Prisma client. Use the InMemory repository or configure a database.');
  }
  // Require at call time so the @prisma/client package isn't pulled in when running InMemory-only.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient: PrismaCtor } = require('@prisma/client') as { PrismaClient: new () => PrismaClient };
  cached = new PrismaCtor();
  return cached;
}

/** For tests and graceful shutdown. */
export async function disconnectPrisma(): Promise<void> {
  if (cached) {
    await cached.$disconnect();
    cached = null;
  }
}
