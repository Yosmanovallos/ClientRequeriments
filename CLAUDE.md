# CLIENTREQUIREMENTS — Claude memory

## What this is
Traditional (NON-AI) client request portal: React + Vite frontend + Node.js/Fastify backend.
Clients submit & track Power BI requests; requests sync to a work-tracking system (GitHub Issues now → Azure DevOps Phase 9).
Claude Code is the DEV TOOL only — the product contains no AI at runtime, ever.

## Architecture rule that matters most
External services sit behind PORTS in `backend/src/Platform/Ports/`:
  - `IIdentityProvider` · `IFileStorage` · `ITicketSystem` · `INotifier` · `IClock`
Business logic (Modules/) depends on ports, NEVER on a vendor.
Adapters are chosen by env vars in `backend/src/Platform/AdapterRegistration.ts`.
**To migrate to Microsoft: add an adapter, flip an env var. Never touch Modules/.**

## Where things live
| Area | Path |
|------|------|
| Frontend (Vite + React + TS) | `frontend/src/` — views/, components/, api/, auth/, context/, lib/ |
| Backend entry | `backend/src/app.ts` |
| Modules (feature slices) | `backend/src/Modules/<Feature>/` — Endpoints / Service / Repository / Validators / entity |
| Ports (interfaces) | `backend/src/Platform/Ports/` |
| Adapters | `backend/src/Platform/Adapters/<Provider>/` |
| Adapter wiring | `backend/src/Platform/AdapterRegistration.ts` |
| Cross-cutting | `backend/src/Shared/` — auth, errors (problem+json), logging (OTel-ready) |
| Database schema | `backend/prisma/schema.prisma` |
| Specs | `specs/` | Tasks | `tasks/` | Decisions | `docs/decisions/` |
| Migration map | `docs/migration.md` | Arch | `docs/architecture.md` |
| Continuity | `context/session-log.md` |
| Legacy demo app | `app/*.jsx` + `Provana Help Center.html` (Babel standalone, no build) |

## Rules (Prefer these phrasings)
- Dependency direction in Modules: Endpoints → Service → Repository. Never skip a layer.
- Talk to external services ONLY through a Port. Vendor code lives inside one adapter class.
- Server is source of truth for validation (Zod); client validation is UX only.
- Keep DB queries portable: no Postgres-only SQL. payload columns are `String @db.Text` (JSON string) so they map to `nvarchar(max)` in SQL Server.
- Prefer files < 300 lines; one feature per module; co-locate tests next to source.
- Read ONLY the module a task names. Use the `explorer` subagent to search broadly.
- All config via env vars. Never hard-code secrets.

## Commands
```bash
# Backend
cd backend && npm install        # install deps
cd backend && npm run dev        # dev server on :4000 (tsx watch)
cd backend && npm test           # vitest unit tests
cd backend && npm run db:generate  # regenerate Prisma client after schema change
cd backend && npm run db:migrate   # apply migrations to DB (Phase 3+)

# Frontend (Vite)
cd frontend && npm install       # install deps
cd frontend && npm run dev       # dev server on :5173 (proxies /api → :4000)
cd frontend && npm run build     # production build
cd frontend && npm run typecheck # TypeScript check only

# Legacy demo (no build, Babel standalone)
npx serve . --listen 3000       # serves Provana Help Center.html on :3000
```

## Current phase
**Phase 8c + Task 016 done** (2026-05-30): Production-ready.
- **8c (DB)**: Prisma init migration generated (140 lines, 7 tables, 4 unique indexes, 6 FKs). `seed.ts` bootstraps BLG demo client (CBLPBR prefix, counter=629) + 4 sample requests. `npm run db:setup` one-shots generate → deploy → seed. Full Neon / Supabase / local-docker walkthroughs in `docs/environments.md`.
- **16 (deploy)**: Multi-stage `backend/Dockerfile` (Node 20 alpine, tini PID-1, runs `prisma migrate deploy` on cold start, non-root). `render.yaml` with all env-var slots scaffolded. `frontend/vercel.json` with `/api/*` rewrite + immutable asset caching. GitHub Actions: `ci.yml` (backend tsc+vitest, frontend typecheck+build) + `deploy.yml` (90s sleep then smoke-tests live `/health` and `/api/health`). Full deploy walkthrough at `docs/deployment.md`.
- **Backend untouched: 150/150 tests still passing**, frontend tsc clean.

**Ready to ship.** Plug in Neon URL → push to main → Render + Vercel auto-deploy. ~30 min end-to-end.
**Next:** Phase 9 (Entra ID + Azure Blob + MS Graph adapters) once you've validated the free-tier deploy.

## Workflow
One `/tasks` file at a time. Skills: `add-adapter`, `add-endpoint`, `scaffold-module`, `session-recap`.
End each session with the `session-recap` skill → updates `context/session-log.md`.
Resume with: `Resume from context/session-log.md; continue the open task; don't re-explain the project.`
