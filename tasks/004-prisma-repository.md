# Task 004 — PrismaRequestsRepository + Vitest tests

**Phase:** 3 · **Status:** ✅ DONE (2026-05-29)

## Result
- `Shared/db.ts` — Prisma client singleton (lazy-loaded; throws clear error when DATABASE_URL unset)
- `PrismaRequestsRepository` — `IRequestsRepository` against Prisma. `nextReference()` uses UPSERT on `client_ref_counters` for atomic per-client sequencing
- `CommentsRepository` — `ICommentsRepository` interface + InMemory + Prisma impls (removed module-level Map from CommentsService)
- `RequestsEndpoints` / `CommentsEndpoints` — repos now passed as parameters, no longer create their own
- `app.ts` — chooses Prisma vs InMemory based on `isDbConfigured()`; logs which is active
- `/health` now reports `db: "prisma" | "in-memory"`
- InMemory `nextReference()` fixed: per-instance counter, no global `let seq` state
- Vitest config + 7 tests passing (idempotency, tenant isolation, sequential refs, history row, payload JSON round-trip)
- `npx prisma generate` ran cleanly with placeholder DATABASE_URL
- `docs/environments.md` — added Neon + Supabase setup steps + Azure SQL switch path

## Do
1. Create `backend/src/Shared/db.ts` — Prisma client singleton (lazy-loaded only when DATABASE_URL is set)
2. Create `backend/src/Modules/Requests/PrismaRequestsRepository.ts` — implements `IRequestsRepository`
3. Create `backend/src/Modules/Comments/CommentsRepository.ts` — extract `commentStore` Map into proper repo + Prisma impl
4. Update `RequestsEndpoints.ts` and `CommentsEndpoints.ts` to accept repo as parameter (decouple from concrete class)
5. Update `app.ts` to choose `Prisma*Repository` vs `InMemory*Repository` based on `DATABASE_URL` presence
6. Add Vitest config + unit tests for `RequestsService` (against InMemory — no real DB needed)
7. Run `npx prisma generate` to produce the client
8. Document DB setup steps (Neon free tier + Supabase) in README

## Definition of done
- [ ] `npm test` runs Vitest, ≥4 tests pass (create, list, getDetail, idempotency)
- [ ] Backend still starts with no `DATABASE_URL` (falls back to InMemory)
- [ ] Backend starts with `DATABASE_URL=postgres://…` and uses Prisma repo
- [ ] `prisma generate` produces `@prisma/client` with all 6 models typed
- [ ] No business logic touched — only repository wiring and new Prisma classes

## Context to load
- `backend/src/Modules/Requests/RequestsRepository.ts` (current InMemory)
- `backend/src/Modules/Requests/RequestsService.ts` (consumer — must not change)
- `backend/prisma/schema.prisma`
- `backend/src/app.ts`

## Out of scope
- Real auth (Phase 4 — keep using LocalIdentityProvider)
- Realtime / outbox worker (Phase 5+)
- Migrating supabase/migrations/*.sql to Prisma migrations (those stay as reference)
