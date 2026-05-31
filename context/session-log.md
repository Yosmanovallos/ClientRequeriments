# Session Log   <!-- newest on top; each entry < 150 words; no code -->

## 2026-05-30 — UX Audit + E2E Tests

UX audit found 4 critical issues: (1) ViewPortal had hardcoded BLG cards, not project-aware; (2) all roles routed to the same portal home after login; (3) demo login showed raw role names (`SUPER_ADMIN` etc); (4) "My Requests" buried in avatar menu. Fixed all four: `ViewLogin.tsx` now shows 4 persona cards with descriptions (Submit a Request / Work on Tickets / Manage the Portal / Full Control) with role-aware post-login routing (Client→forms, Agent→myrequests, Admin→portal). `ViewPortal.tsx` rewritten: hero shows active project name, Admin sees Control Panel + All Requests cards, Client sees Submit/My Requests cards — no hardcoded BLG. `TopNav.tsx`: active project chip (purple pill, click to switch), "Submit Request" / "My Requests" direct buttons visible in nav bar. `ViewProjectPicker` and `ViewPendingApproval` also route by role. Playwright E2E tests set up (`e2e/flows.spec.ts`, 27 tests across 8 suites: Login, Client, Agent, Admin, SuperAdmin, Pending, Portal content, Nav). Run: `npx playwright install chromium && npm run test:e2e`. tsc clean.

## 2026-05-30 — Task 019 Phase G Session 3a: Control Panel Shell + Overview (Steps 16–19)

Steps 16–19 complete. New `views/admin/` directory. `ViewControlPanel.tsx`: sidebar nav (Overview/Users/Projects/Forms) + lazy-loaded content area, role guard (SUPER_ADMIN|ADMIN only), "← Back to Portal" link, `CPSection` type exported for subviews. New `api/admin.ts`: `usersApi` (list/pending/updateRole/updateProjects/setup) + `projectsApi` (list/create/update/members/addMember/removeMember) — 44 lines. New `views/admin/ViewCPOverview.tsx`: fetches user/pending/project/request counts in parallel, 4 stat cards, pending-users warning banner with "View pending users →" that calls `onNavigate('users')`. `AppContext.tsx`: added `'admin'` to View type. `App.tsx`: added `case 'admin' → ViewControlPanel`. `TopNav.tsx`: Control Panel button now calls `nav('admin')` (was `nav('pending')`). Added CP + modal CSS to `index.css` (`.cp-layout/.cp-sidebar/.cp-nav-item/.cp-content/.modal-overlay/.modal-card`). `tsc --noEmit` exit 0. Next: Session 3b — ViewCPUsers, UserSetupModal, ViewCPProjects, ViewCPProjectMembers.

## 2026-05-30 — Task 018 Phase F: Dynamic Form Renderer (Steps 9–15)

Steps 9–14 complete. New `api/formTemplates.ts` (`FormFieldDef` + `FormTemplate` types, `listByProject` + `getById`). New `components/DynamicField.tsx` (renders text/textarea/select/date/email/number by field.type, under 60 lines). New `views/ViewDynamicForm.tsx` (receives `FormTemplate` prop, sorts fields by sortOrder, submits via `requestsApi.create()` with slug→underscore requestType mapping, shows ticket reference on success). New `views/ViewFormsList.tsx` (fetches enabled forms for activeProject, shows clickable cards, navigates to `dynamic-form` view). `AppContext.tsx`: added `'dynamic-form'` to View type + `selectedTemplate` / `setSelectedTemplate` state. `App.tsx`: `'requests'` → `ViewFormsList`, `'dynamic-form'` → `ViewDynamicForm`, `'myrequests'` → `ViewMyRequests`. Bug #9 fixed: `ViewRequests.tsx` (replaced by ViewFormsList) + `ViewRequestsList.tsx` (renamed → `ViewMyRequests.tsx`) deleted. `tsc --noEmit` exit 0. Next: Task 019 Phase G (Control Panel).

## 2026-05-30 — Task 017 Phase E: Role-aware nav + project picker

Steps 1–7 complete. `auth/index.ts`: added `ProjectSummary` + `role`/`projects` to `UserSession`; `fetchEnrichment()` calls `/users/me` then `/projects` (guarded: PENDING skips projects call); demo mode stores selected role in `sessionStorage.demo_session`. `ViewLogin.tsx`: demo mode shows 5 role-picker buttons (Super Admin / Admin / Agent / Client / Pending) instead of form. New views: `ViewPendingApproval` (centered card, "Check again" re-calls `getSession`, sign-out button) + `ViewProjectPicker` (portal-card grid, auto-selects if 1 project). `App.tsx` router: guards `role === null → pending`, `!activeProject → picker` before normal view switch. `TopNav.tsx`: "Control Panel" item gated on `SUPER_ADMIN|ADMIN`, "Switch Project" always visible. `AppContext.tsx` was already correct — no changes needed. `tsc --noEmit` exit 0. Next: Task 018 Phase F (dynamic form renderer).

## 2026-05-30 — Phase 8c + Task 016: DB migrations + production deploy config

**8c (Prisma migrations):** Generated `prisma/migrations/0001_init/migration.sql` (140 lines, 7 tables, all FKs/uniques) via `prisma migrate diff --from-empty` (no live DB needed). Added `prisma/seed.ts` (idempotent — BLG client, counter=629, 4 sample requests). New npm scripts: `db:setup` (generate → deploy → seed one-shot), `db:reset`, `db:seed`. Updated `docs/environments.md` with full Neon / Supabase / Docker walkthroughs.

**16 (Deploy):** Multi-stage `backend/Dockerfile` (Node 20 alpine, tini PID-1, non-root, runs `prisma migrate deploy` on cold start). `render.yaml` with all env-var slots (sync:false for secrets). `frontend/vercel.json` with `/api/*` → Render rewrite + immutable asset caching. `.github/workflows/ci.yml` (backend tsc+vitest, frontend typecheck+build) + `deploy.yml` (90s sleep then smoke-tests live `/health` and `/api/health`). Full deploy walkthrough at `docs/deployment.md` (Neon→Render→Vercel→GitHub Actions, ~30 min total).

**150/150 backend tests passing; both tsc clean.** Ready to deploy.

## 2026-05-30 — Phase 7b: design parity pass (Task 015)

User pointed out the Vite views were spartan placeholders compared to the legacy design. Did a full port:
- **CSS**: 360 lines from `Provana Help Center.html` → `frontend/src/index.css` (tokens, hero, portal-card, formcrumbs, accordion, reqlist, profile-menu, reqtable, badges, login, detail, etc.)
- **Icons**: 27 SVGs from `app/icons.jsx` → `components/Icons.tsx` (named TSX exports)
- **Brand components**: ProvanaLogo (with text fallback), Monogram (navy+gold BLG), Avatar+BigAvatar, **HeroNetwork** (42-node animated SVG with seeded random + opacity animations), SupportBadge
- **Layout shells**: TopNav (avatar dropdown + click-outside-close), Breadcrumbs strip, PortalBanner (dark hero with HeroNetwork), FormCrumbs (inline trail)
- **Views refactored**: ViewPortal, ViewLogin, ViewRequests, ViewRequestsList, ViewProfile, ViewRequestDetail + all 5 form views wrapped with new shells
- Logo asset (258KB) copied to `frontend/public/assets/`
- E2E live: Vite serves logo + transpiles TopNav.tsx + proxies POST → CBLPBR-630 created
- **Backend untouched — 150/150 tests still passing**, frontend tsc clean
- Next: Phase 8c (Prisma migrations + real DB), Phase 9 (Entra/Azure Blob), or Task 016 (production deploy)

## 2026-05-30 — Phase 5d + 8b: ADO inbound webhook + attachments frontend polish

**Phase 5d (Task 014):** New `verifyBasicAuth` helper (constant-time, handles passwords with colons). `SyncService` extended with `handleAdoWorkItemUpdated` + `handleAdoWorkItemCommented` — covers Agile/Scrum/Basic processes, unknown states silently ignored. New `registerAzureDevOpsWebhook` in SyncEndpoints (Basic Auth verify, reuses GitHub's dedup Set). Endpoint only registered when `ADO_WEBHOOK_USER+PASS` set. `app.ts` cleaned up so each webhook is independent. 28 new tests (10 Basic Auth + 18 ADO event handlers). E2E smoke: 9 cases including wrong-creds 401 and replay dedup — all green.

**Phase 8b (Task 011):** Extracted reusable `<AttachmentsPicker>` component (Browse + DnD with visual drop feedback). New `attachmentsApi.uploadAll()` batch helper. All 5 form views use them — eliminated ~30 lines of inline JSX per form. `ViewRequestDetail` got an attachments section: parallel fetch + styled signed-URL download links with metadata. Frontend tsc exit 0. **150/150 backend tests.**

Next: Phase 8c (Prisma migrations + real DB) OR Phase 9 (full Microsoft Entra + Azure Blob adapters) OR Task 015 (production deploy: Render + Vercel + GitHub Actions CI).

## 2026-05-30 — Phase 5c: AzureDevOpsTicketSystem adapter (Task 013)

- New `AzureDevOpsTicketSystem` adapter (`Adapters/Azure/`) — native fetch + JSON Patch + Basic Auth (PAT)
- Default state map for Agile process (`DEFAULT_STATE_MAP_AGILE` exported); overridable via `ADO_STATE_MAP_JSON` env or constructor arg
- Maps DONE→Closed+Fixed, CANCELLED→Removed+Abandoned, etc. Reason field paired with state transitions
- Configurable work item type (`ADO_WORK_ITEM_TYPE` — default Task). On-prem ADO Server supported via `ADO_API_URL`
- URL encoding for org/project/work item type — handles spaces correctly (`My Org`, `User Story`)
- AdapterRegistration `azuredevops` case wired with full env validation; docs/environments.md got step-by-step PAT creation + status mapping table + Scrum override example
- 20 new tests covering: JSON Patch shape, Basic Auth header, state mapping per status, unknown-status warn-and-skip, error propagation, apiUrl override, regression guard that default map covers every portal status
- E2E smoke: backend booted with `TICKETS_PROVIDER=azuredevops`, mocked ADO fetch saw correct `POST /workitems/$Task?api-version=7.1` with proper Title/Description/Tags Patch ops. **122/122 tests passing.** tsc exit 0
- User flips env vars to ship — code complete
- Next: Task 014 (ADO Service Hooks → inbound webhook handler, mirrors Phase 5b GitHub) OR Phase 8b (attachments frontend polish)

## 2026-05-30 — Phase 6b: Outlook + Teams wiring (no Power Automate Premium)

- New `TeamsNotifier` adapter (Adaptive Card payload → Teams Workflow webhook). Native fetch, no SDK. 8 tests covering shape + 3 best-effort failure modes
- `AdapterRegistration::buildNotifier()`: added `'teams'` case; `'composite'` now prefers Teams over Slack when both URLs set (with console warning)
- `.env.example` annotated with Outlook-specific SMTP values (smtp.office365.com:587, app password)
- `docs/environments.md` got 3 new walkthroughs: Teams Workflow webhook setup, Outlook SMTP app-password setup, recommended composite config for Microsoft stack — all with explicit note that Power Automate Premium is NOT required
- End-to-end smoke (mocked nodemailer + fetch) verified composite path: single POST fires both Outlook send + Teams Adaptive Card
- **102/102 tests passing**; tsc exit 0
- User can ship this today with just env vars — no more code on the Outlook/Teams side
- Next: Task 013 — `AzureDevOpsTicketSystem` adapter (need: ADO org URL + project + PAT + state mapping)

## 2026-05-29 — Phase 8: attachments via IFileStorage

- `SupabaseFileStorage` adapter (native fetch — no SDK): upload, signed URL, idempotent delete. Path-safe encoding
- New `Attachments` module (5-file blueprint): entity, InMemory + Prisma repos, service (tenant isolation, filename sanitisation, storage-first delete), endpoints (POST/GET/DELETE)
- Added `Attachment` model to Prisma schema. Storage key shape: `{clientId}/{requestId}/{attId}/{safeFilename}` — enables RLS scoping by prefix
- `@fastify/multipart@8` installed (v10 needed Fastify v5; we're v4). 25 MiB per-file limit
- `AdapterRegistration::buildStorage()`'s `supabase` case wired
- Frontend: `api/attachments.ts` (multipart helper) + file picker on `ViewForm.tsx` (uploads after request creation, best-effort per file)
- 22 new tests (13 storage + 9 service) — **94/94 total passing**
- E2E smoke green: 8 HTTP cases (create → upload txt+png → list → delete → 404/400 edges)
- Next: Phase 8b — propagate picker to 4 other forms + DnD + list on detail view. Or Phase 9 — Microsoft migration adapters.

## 2026-05-29 — Phase 7: frontend API integration

- Migrated 4 stub form views to real TSX: `ViewFormNewPage`, `ViewFormNewFeature`, `ViewFormFixIssue`, `ViewFormViewRequest`
- Each form follows the same shell pattern as `ViewForm.tsx` and POSTs to `requestsApi.create()` with form-specific `requestType` + payload
- Installed `@supabase/supabase-js` in frontend so Vite resolves the dynamic import in `auth/index.ts` (only loaded at runtime when SUPABASE_URL is set)
- Frontend `tsc --noEmit` → exit 0; backend tests unchanged at **72/72**
- Full stack live: backend :4000 + Vite :5173 with `/api/*` proxy working
- POST one per requestType → `CBLPBR-630`…`CBLPBR-634` with sequential refs and correct type discrimination
- Browser visual QA handed to user — CLI smoke covers API contract
- Next: Phase 8 — Attachments via `IFileStorage` (Supabase Storage / R2). Task 010.

## 2026-05-29 — Phase 6: real notifications (SMTP + Slack + Composite)

- Implemented 3 adapters: `SmtpNotifier` (nodemailer), `SlackNotifier` (fetch+webhook), `CompositeNotifier` (delegates each method to the right adapter)
- All three honor the port's best-effort guarantee — every transport/network error logged + swallowed, never thrown (verified by explicit tests for SMTP async-fail, SMTP sync-throw, Slack network reject, Slack 4xx, Slack 5xx)
- `AdapterRegistration::buildNotifier()` extended with smtp/slack/composite cases. Composite requires at least one side configured; either delegate may be null and become a clean no-op
- Installed `nodemailer` + `@types/nodemailer`
- 19 new tests added (7 SMTP + 7 Slack + 5 Composite) — **72/72 passing total**
- End-to-end smoke (NOTIFY_PROVIDER=composite + mocked nodemailer + mocked Slack fetch): single POST /requests triggered both `sendMail` and Slack webhook with correct payloads
- `docs/environments.md` got full notifications setup section (Resend instructions, SendGrid/Mailgun compat note, Slack webhook walkthrough, best-effort explanation)
- Next: Phase 7 — frontend integration (wire Vite views to backend API). Task 009.

## 2026-05-29 — Phase 5b: GitHub webhook handler (inbound sync)

- New `Modules/Sync/` slice with 4 files: types, signature verifier, service, endpoints
- HMAC verify via `node:crypto` `createHmac` + `timingSafeEqual` (constant-time)
- Status mapping: closed+completed→DONE, closed+not_planned→CANCELLED, reopened→IN REVIEW
- Two-layer idempotency: in-memory `x-github-delivery` dedup + service-level no-op-when-already-at-target
- Added `IRequestsRepository.findByExternalRef()` to InMemory + Prisma (additive)
- Added `RequestsService.applyExternalStatus()` and `CommentsService.appendExternalComment()` — use-case-specific extensions; no existing logic modified
- `/webhooks/github` added to PUBLIC_PATHS (HMAC is the trust boundary); raw-body parser captures bytes for verification
- Sync endpoint registered only when `GITHUB_WEBHOOK_SECRET` is set (opt-in)
- 18 new tests (7 signature + 11 SyncService) — **53/53 passing total**
- Live smoke verified: signed `issues.closed` flipped CBLPBR-630 to DONE with `source=github`, wrong sig → 401, replay → duplicate
- Next: Phase 6 — Real notifications (`SmtpNotifier` + `SlackNotifier`). Task 008.

## 2026-05-29 — Phase 5: GitHubIssuesTicketSystem (real ticketing)

- Implemented `GitHubIssuesTicketSystem` using native `fetch` (no `@octokit/rest` SDK — saves ~150KB deps)
- Status mapping: DONE→closed+completed, CANCELLED→closed+not_planned, others→open. Precise status stays in portal DB; GitHub gets open/closed for the BI team
- Labels derived from `requestType` + `priority:<level>`; supports extra labels via cmd.labels
- Wired `github` case in `AdapterRegistration::buildTickets()` with token/owner/repo validation
- 14 unit tests passing: constructor validation, POST shape, headers, status mapping, error propagation, apiUrl override (GitHub Enterprise)
- End-to-end smoke: booted backend with `TICKETS_PROVIDER=github`, intercepted fetch, confirmed correct outbound POST /issues with no duplicate labels
- **Bug fix**: `RequestsService.createTicketAsync()` was passing redundant `labels` field — adapter already derives them from structured fields. Service simplified, port contract clarified inline
- `docs/environments.md` got full GitHub setup section (fine-grained PAT, status mapping explanation)
- **35/35 tests passing total** (7 + 14 Supabase + 14 GitHub)
- Next: Phase 5b — inbound webhook handler (`POST /webhooks/github` for status sync back to portal)

## 2026-05-29 — Phase 4: SupabaseIdentityProvider (real auth)

- Implemented `SupabaseIdentityProvider` — offline HS256 JWT verification via `jsonwebtoken` (no SDK dep, no per-request network call)
- ADR 002 records the rejection of `supabase.auth.getUser()` SDK approach (the task originally suggested it; offline verification chosen for performance + smaller deps)
- Tenant claim resolution: `app_metadata.client_id` (admin, secure) → `user_metadata.client_id` → `DEMO_FALLBACK_CLIENT_ID` env (dev only)
- Security hardening: `algorithms: ['HS256']` pinned (alg-confusion defence), `aud === "authenticated"` enforced
- Wired the `supabase` case in `AdapterRegistration.ts::buildIdentity()`; clear error when `SUPABASE_JWT_SECRET` missing
- `.env.example` updated; `docs/environments.md` gained full Supabase Auth setup section
- 14 new unit tests added (valid token, expired, wrong-secret, alg-none, wrong-aud, missing claim, fallback) — **21/21 tests passing total**
- Live smoke test: two users (clients A and B) got distinct reference series; cross-tenant detail read returned 404 NOT_FOUND (no enumeration leak)
- Next: Phase 5 — `GitHubIssuesTicketSystem` adapter (Task 006)

## 2026-05-29 — Phase 3: Prisma repositories wired

- Created `Shared/db.ts` — lazy Prisma client singleton (only loads when DATABASE_URL set)
- Implemented `PrismaRequestsRepository` — UPSERT on `client_ref_counters` for atomic per-client sequencing
- Extracted `CommentsRepository` interface (InMemory + Prisma); removed module-level Map from CommentsService
- Decoupled `RequestsEndpoints` and `CommentsEndpoints` — repos passed in, not constructed internally
- `app.ts` now selects Prisma vs InMemory from `isDbConfigured()`; logs the choice; `/health` reports it
- Fixed leaky module-level `let seq = 629` — replaced with per-instance Map
- Added Vitest config + 7 passing tests: idempotency, tenant isolation, sequential refs, history row, payload JSON round-trip
- `prisma generate` succeeded with placeholder DATABASE_URL — types available for TS compile
- Live smoke test green: POST returned CBLPBR-630, /health reports `db: "in-memory"`
- `docs/environments.md` extended with Neon + Supabase + Azure SQL setup paths
- Next: Phase 4 — `SupabaseIdentityProvider` adapter behind `IIdentityProvider`; flip `AUTH_PROVIDER=supabase`

## 2026-05-29 — Phase 0–1: blueprint implementation

- Read `Claude_Code_MVP_Blueprint_Free_to_Microsoft.md`; analyzed gap vs existing frontend
- Created full repo skeleton per blueprint Section 3 (backend/, frontend/, .claude/, docs/, specs/, tasks/, context/)
- Defined 5 port interfaces: IIdentityProvider, IFileStorage, ITicketSystem, INotifier, IClock
- Created Local/InMemory adapters for all 5 ports (no external service needed)
- Implemented AdapterRegistration.ts: reads AUTH_PROVIDER/TICKETS_PROVIDER/etc. env vars
- Built Requests module: entity, InMemoryRepository, Service (create/list/detail/history+outbox), Zod validators, Fastify endpoints
- Built Comments module: entity, service, endpoints
- Shared layer: auth middleware, problem+json errors, OTel-ready Pino logging
- Prisma schema: portable (Text columns, no JSONB operators)
- Frontend Vite+TS scaffold: api/client.ts, api/requests.ts, auth/index.ts, AppContext, all view stubs
- CLAUDE.md rewritten; skills, agents, docs, migration map, ADR 001 created
- Next: Task 003 — install deps and smoke-test backend in local mode
