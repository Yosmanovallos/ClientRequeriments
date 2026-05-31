# Task 002 — Ports layer + Local adapters + Requests module

**Phase:** 1–2 · **Status:** ✅ DONE (2026-05-29)

## Done
- Defined 5 port interfaces: IIdentityProvider, IFileStorage, ITicketSystem, INotifier, IClock
- Created Local/InMemory adapters for all 5 ports
- AdapterRegistration.ts reads env vars and wires adapters (cases for local/supabase/github/entra/azuredevops/microsoft)
- Shared layer: auth middleware (IIdentityProvider), problem+json error handler, Pino logging config
- Requests module: Request entity, InMemoryRequestsRepository, RequestsService (create/list/detail/history), RequestsValidators (Zod), RequestsEndpoints (Fastify routes)
- Comments module: Comment entity, CommentsService, CommentsEndpoints
- Backend entry point: app.ts (thin wiring — register modules, CORS, error handler)
- Prisma schema: portable Postgres schema (Text for JSON columns, no JSONB operators)
- Frontend: Vite + React + TS scaffold; api/client.ts, api/requests.ts, auth/index.ts, AppContext, all view stubs

## Next task
Task 003 — Install deps, run backend in local mode, verify POST /requests returns CBLPBR-### reference
