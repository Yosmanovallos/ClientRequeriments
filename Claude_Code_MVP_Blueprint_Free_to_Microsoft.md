# Implementation Blueprint — Free MVP → Microsoft Migration

**Project:** `CLIENTREQUIREMENTS` (Provana client request portal)
**Build tool:** Claude Code (engineering assistant only — see framing below)
**Strategy:** ship a working demo on free, non-Microsoft services now; migrate cleanly to Microsoft after approvals — with no rewrite of business logic.

---

## Framing — this is NOT an AI product

The platform is **traditional, deterministic enterprise software**: a request portal with a standard frontend, a standard backend, a relational database, and a work-tracking integration. There are **no AI features, agents, LLM calls, embeddings, vector databases, or autonomous logic** anywhere in the product. Every line of business logic is explicit, testable, and fully understandable without any AI dependency.

**Claude Code is used only during development** — to generate code, scaffold modules, keep architecture consistent, and accelerate engineering. It produces ordinary source code that runs with zero AI at runtime. Nothing in this blueprint introduces an AI dependency into the shipped product.

---

## The one principle that makes everything else work

**Every external service sits behind an interface (a "port"); the concrete implementation (an "adapter") is chosen by configuration.** Your business logic depends on `IFileStorage`, never on "Supabase" or "Azure Blob." Migrating from the free stack to Microsoft later becomes *writing a new adapter and flipping an environment variable* — not touching a single line of business logic.

This is the answer to "build free now, migrate to Microsoft later" without painting yourself into a corner. It is also lightweight: ports/adapters here means a handful of small interfaces, not a heavy framework. We apply it to exactly the five things that will change in migration (auth, database, file storage, ticket system, notifications) and nothing else — avoiding overengineering.

---

## 1. The free MVP stack — and what each becomes under Microsoft

| Concern | Free MVP choice | Migrates to (Microsoft) | How migration works |
|---|---|---|---|
| **Frontend hosting** | Vercel / Netlify / Render static (free, no sleep) | **Azure Static Web Apps** | Static bundle; just re-point the deploy target. No code change. |
| **Backend hosting** | **Render** free web service (Docker) | **Azure App Service** (Linux) | Same container; change host + CI deploy step. |
| **Database** | **Neon** or **Supabase** Postgres (free) | **Azure SQL** (or Azure Postgres) | EF Core provider swap (Postgres→SQL Server) + re-run migrations. |
| **Authentication** | **Supabase Auth** / Clerk / Auth0 (free tier) | **Microsoft Entra External ID** | Swap the `IIdentityProvider` adapter (both are standard OIDC/JWT). |
| **File storage** | **Supabase Storage** / Cloudflare R2 (free) | **Azure Blob Storage** | Swap the `IFileStorage` adapter. |
| **Work-tracking / tickets** | **GitHub Issues** (free API) or a local tickets table | **Azure DevOps** work items | Swap the `ITicketSystem` adapter (same operations: create/status/comment). |
| **Notifications** | Email via **Resend**/SMTP + **Slack/Discord** webhook | **Outlook (Graph)** + **Microsoft Teams** | Swap the `INotifier` adapter. |
| **Automation/orchestration** | **In-process worker + outbox table** (code) | Power Automate Premium *(optional)* | Keep in code, or add a Power Automate adapter later. No premium license needed for the MVP. |
| **CI/CD** | **GitHub Actions** (free) | Azure DevOps Pipelines *(optional)* | GitHub Actions works for both; migrate only if you want to. |
| **Monitoring/logging** | **OpenTelemetry** → Sentry / Grafana Cloud free | **Azure Monitor / App Insights** | OTel is vendor-neutral; change the exporter target only. |

**Notes that matter for a demo:**
- Render's free **web service sleeps after ~15 min idle** (30–50s cold start). Fine for a demo you control; for a smoother always-on demo, Railway/Render paid Starter is ~$5–7/mo. Static frontends on Vercel/Netlify/Render do **not** sleep.
- Neon (free Postgres) supports **scale-to-zero and branching** — excellent for dev/CI. Supabase free pauses after 7 days idle; Neon is the safer pick if the demo sits unused between showings.
- **GitHub Issues is the most realistic free stand-in for Azure DevOps work items** — issues, states, labels, comments, and webhooks map almost 1:1, so the `ITicketSystem` adapter you write for the demo is structurally the same one you write for Azure DevOps later.

---

## 2. Migration-ready architecture (ports & adapters, applied minimally)

### 2.1 The shape

```
Business logic (services)  ──depends on──▶  Ports (interfaces)
                                                 ▲
                                                 │ implemented by
                                   ┌─────────────┴─────────────┐
                          Free adapters                 Microsoft adapters
                       (Supabase, GitHub, …)          (Entra, Azure DevOps, …)
                                   └──────── chosen by config/env ────────┘
```

Only **five ports** exist — the only things that change in migration:

```
server/src/Platform/                 # the abstraction layer (small)
├── Ports/
│   ├── IIdentityProvider.cs          # who is the user + which client/tenant
│   ├── IFileStorage.cs               # save/get/delete files, signed URLs
│   ├── ITicketSystem.cs              # create/update/comment on work items
│   ├── INotifier.cs                  # send email / channel message
│   └── IClock.cs                     # (tiny) testable time, env-agnostic
├── Adapters/
│   ├── Supabase/                     # MVP: SupabaseAuth, SupabaseStorage
│   ├── GitHub/                       # MVP: GitHubIssuesTicketSystem
│   ├── Smtp/ , Slack/                # MVP: notifications
│   ├── Azure/                        # LATER: EntraAuth, BlobStorage, AzureDevOps...
│   └── Local/                        # InMemory/local adapters for tests + early dev
└── AdapterRegistration.cs            # reads env vars, registers the chosen adapters
```

### 2.2 A port and two adapters (concrete, .NET example)

```csharp
// Port — business logic depends ONLY on this
public interface ITicketSystem {
    Task<TicketRef> CreateAsync(CreateTicket cmd, CancellationToken ct);
    Task UpdateStatusAsync(string externalId, string status, CancellationToken ct);
    Task AddCommentAsync(string externalId, string body, CancellationToken ct);
}

// MVP adapter — free
public sealed class GitHubIssuesTicketSystem : ITicketSystem { /* calls GitHub Issues API */ }

// Migration adapter — added later, business logic untouched
public sealed class AzureDevOpsTicketSystem : ITicketSystem { /* calls ADO work item API */ }
```

```csharp
// AdapterRegistration.cs — the ONLY place that knows which is active
services.AddScoped<ITicketSystem>(sp => config["TICKETS_PROVIDER"] switch {
    "github"     => new GitHubIssuesTicketSystem(...),
    "azuredevops"=> new AzureDevOpsTicketSystem(...),
    _            => new LocalTicketSystem(...)   // default for tests/early dev
});
```

Migration day = write `AzureDevOpsTicketSystem`, set `TICKETS_PROVIDER=azuredevops`, deploy. The `RequestsService` that calls `ITicketSystem.CreateAsync` never changes.

### 2.3 Environment abstraction

- **All config via environment variables**, never hard-coded. One `.env.example` documents every key; real values live in the host's secret store (Render env vars now; Azure Key Vault later).
- A single `appsettings`/config object reads them; nothing else touches `process.env`/`Environment`.
- Provider switches are explicit env keys: `AUTH_PROVIDER`, `STORAGE_PROVIDER`, `TICKETS_PROVIDER`, `NOTIFY_PROVIDER`, `DB_PROVIDER`.
- *Result:* the same build artifact runs on the free stack or on Azure purely by changing env values — "infrastructure portability."

### 2.4 Database portability

- **ORM with both Postgres and SQL Server providers** — **EF Core** (.NET) or **Prisma** (Node). Develop against Postgres (free) now; switch the provider to SQL Server for Azure later and re-run migrations.
- Keep schema **ORM-first** (migrations in code), avoid Postgres-only features in the MVP (no `JSONB`-specific operators in queries — store form-variant fields as a JSON string column the app parses, which is portable to SQL Server's `nvarchar(max)`/JSON functions).
- *Tradeoff:* you give up a few Postgres niceties to stay portable. Worth it for a clean migration.

### 2.5 Why this is the optimal shape (and not overengineered)

| Choice | Migration benefit | Maintainability | Avoids overengineering because… |
|---|---|---|---|
| 5 ports only | Each MS service = 1 adapter swap | Business logic is provider-agnostic | We abstract only what *will* change, not everything |
| Config-driven adapters | Flip env var, no code change | One registration file to reason about | No DI gymnastics or plugin framework |
| ORM provider swap | Postgres→SQL Server is a setting | Schema lives in code | Standard ORM feature, not custom tooling |
| OTel for telemetry | Re-target exporter only | Vendor-neutral instrumentation | Industry standard, not a homegrown logger |
| Outbox worker (not a broker) | Add Power Automate later if wanted | Reliable hand-off in plain code | No message-broker infra for ~8 requests/day |

---

## 3. Repository structure

```
clientrequirements/
├── CLAUDE.md                       # root memory (small; loads every session)
├── .claude/
│   ├── skills/                     # reusable workflows (slash-command replacement)
│   ├── agents/                     # subagents (explorer, test-runner)
│   └── settings.json
├── docs/
│   ├── architecture.md             # short, living description of current system
│   ├── migration.md                # the free→Microsoft map + per-port migration steps
│   ├── environments.md             # env vars per environment & provider
│   └── decisions/                  # one-paragraph ADRs
├── specs/
│   ├── api/                        # one .md per endpoint group
│   ├── schemas/                    # per-request-type field rules
│   └── features/                   # feature specs + acceptance criteria
├── tasks/                          # one .md per unit of work (+ TEMPLATE.md)
├── context/
│   └── session-log.md              # running continuity summary
├── frontend/                       # React + Vite + TS
│   └── src/{views,components,api,auth,context,lib}
└── backend/                        # .NET 8 (or Node) — modular monolith
    └── src/
        ├── Modules/                # vertical feature slices
        │   ├── Requests/           # Endpoints/Service/Repository/Validators/entity/Tests
        │   ├── Comments/
        │   ├── Attachments/
        │   └── Sync/               # uses ITicketSystem (GitHub now → ADO later)
        ├── Platform/               # Ports + Adapters + AdapterRegistration (Section 2)
        ├── Shared/                 # auth middleware, error→problem+json, logging(OTel), DI
        └── Program.cs              # thin wiring
```

The `/docs`, `/architecture`, `/skills`, `/prompts` (→ `.claude/skills`), `/tasks`, `/specs`, `/context`, `/backend`, `/frontend` folders you asked for all map directly above. `/prompts` is folded into `.claude/skills` because **custom slash commands have merged into Skills** in current Claude Code (`.claude/skills/<name>/SKILL.md`); legacy `.claude/commands/*.md` still work if you prefer that name.

---

## 4. Claude Code workflow, token & context strategy

(The platform has no AI; this section is purely about using Claude Code efficiently to *build* it.)

### 4.1 Mental model
Claude Code starts each session fresh but auto-loads `CLAUDE.md` + memory + MCP tool *names* + skill *descriptions*. File reads accumulate; when the window fills, it auto-compacts (oldest tool output first). Three levers follow:
1. **Keep `CLAUDE.md` small** — it's taxed every session.
2. **Offload search/test work to subagents** — they read in their own window and return only a summary (the biggest single token saver).
3. **Compact at milestones** (`/context` to watch, `/compact` at clean stops) — don't drift one session across five features.

### 4.2 Architecture *is* the token strategy
Vertical feature slices + one-direction dependency (Endpoints → Service → Repository) mean any one task loads **one slice**, not the repo. The ports layer means a feature task loads the *interface*, not the adapter's implementation. This structural choice is what keeps tokens low automatically.

### 4.3 Best practices (ranked)
1. **Subagent offloading** for codebase search, test runs, log analysis.
2. **Selective context loading** — every task names the exact files to load.
3. **Spec-driven development** — implement from a small spec, not a verbal description that forces Claude to read code to guess intent.
4. **One-task units** — small enough to finish before the window fills.
5. **Reusable summaries** — `context/session-log.md` replaces re-loading history.
6. **Small files (<300 lines)** — Claude reads a part, not a monolith.
7. **Typed backend** — the compiler verifies cross-file correctness, so Claude needn't load callers to check a change.

### 4.4 Anti-patterns (what wastes tokens)
| Anti-pattern | Do instead |
|---|---|
| Pasting whole files into chat | Let Claude read the file, or send a subagent |
| "Explore the whole repo" | Name the module; use the `explorer` subagent |
| One giant multi-feature session | One task per session; `/compact` between |
| Massive log/schema paste dumps | Subagent returns a summary |
| God files (`utils`, 2k-line `app.jsx`) | Split by concern, <300 lines |
| Vague prompts ("make it production-ready") | Point to a spec + acceptance criteria |
| Re-explaining the project each session | Use `CLAUDE.md` + `session-log.md` |
| Walls of "don't…" rules | A few "Prefer X over Y" rules (more durable) |

### 4.5 What experienced Claude Code users do
Treat the window as a **budget** (`/context`); **delegate and judge the diff**, not every step; keep `CLAUDE.md` lean + repo modular so the agent self-serves the right context; **codify repeated work as skills** instead of re-prompting; work **feature-by-feature behind small PRs** reviewed with a `pr-review` skill or `/security-review`.

### 4.6 Preventing context degradation over time
- One task per session; compact between tasks.
- End every session with the `session-recap` skill → updates `context/session-log.md`.
- Resume with: "Continue from session-log.md; don't re-explain the project."
- Prune `CLAUDE.md` every few weeks — delete anything no longer needed.

---

## 5. Step-by-step roadmap (free MVP first, Microsoft migration last)

Each phase is a small batch of tasks, not a marathon session. Phases 1–8 ship a working free demo; Phase 9 is the clean migration.

### Phase 0 — Project setup
- **Do:** create the repo skeleton (Section 3); add `CLAUDE.md`, `.claude/skills`, `.claude/agents`, `/specs`, `/tasks`, `/context`; init Git + GitHub; add `.env.example`.
- **Claude strategy:** one scaffolding task; load nothing but the target structure.
- **Done:** repo builds empty; CI (GitHub Actions) runs a no-op lint/test.

### Phase 1 — Foundation & the Platform (ports) layer
- **Do:** define the five ports; add `Local/InMemory` adapters; `AdapterRegistration` reads env. Migrate the existing `view-*.jsx` into `frontend/src/views`; add Vite build.
- **Done:** `Local` adapters let the app run end-to-end with no external service; both builds pass.
- **Pitfall:** implementing real adapters now — start with `Local` so business logic can be built and tested in isolation.

### Phase 2 — Backend core (Shared + Requests module)
- **Do:** `Shared/` (problem+json errors, OTel logging w/ correlationId, auth middleware skeleton, DI). Implement the `Requests` module (5-file shape) against the in-memory repository, from `specs/api/requests.md`.
- **Done:** create/list/detail requests work in-memory; unit tests green (happy path, idempotency, invalid type).
- **Pitfall:** building all modules at once — prove the pattern on `Requests` first.

### Phase 3 — Database (free Postgres)
- **Do:** add EF Core + Neon/Supabase Postgres; migrations; real `RequestsRepository`; transactional outbox table. Keep schema portable (Section 2.4).
- **Done:** create→read round-trip against real DB; migration applies cleanly; outbox row written in same transaction.
- **Pitfall:** Postgres-only SQL that won't port to SQL Server.

### Phase 4 — Authentication (free provider)
- **Do:** `SupabaseAuth` (or Clerk) adapter behind `IIdentityProvider`; MSAL-style OIDC in the frontend `auth/`; tenant (`client_id`) from token claims; invite-only; per-tenant row filtering.
- **Done:** a user from client A cannot read client B's data (explicit test); login→token→call works.
- **Pitfall:** trusting `client_id` from the request body; enabling open public sign-up.

### Phase 5 — Ticket integration (free: GitHub Issues)
- **Do:** `GitHubIssuesTicketSystem` behind `ITicketSystem`; the outbox worker creates an issue on submit; a webhook (or poll) syncs status/comments back.
- **Done:** submitting a request creates a GitHub issue; status changes flow back to the portal. This is the *exact* behavior Azure DevOps will provide later — proven now, free.
- **Pitfall:** coupling business logic to GitHub specifics — keep everything GitHub-shaped inside the adapter.

### Phase 6 — Notifications (free)
- **Do:** `INotifier` with an SMTP/Resend email adapter + a Slack/Discord webhook adapter. Fire on submit (after the ticket is created) and on status change.
- **Done:** submission sends an email + posts a channel message with a link to the issue.
- **Pitfall:** letting a failed notification fail the submission — notifications are best-effort, logged, retried once.

### Phase 7 — Frontend integration
- **Do:** replace mock data with the `frontend/src/api` client; wire the submit form → `POST /requests`; the requests list; a request-detail view with status/history.
- **Done:** end-to-end demo: log in → submit → track, with a real backend.
- **Pitfall:** calling `fetch` from views directly; reintroducing mock paths "temporarily."

### Phase 8 — Testing, CI/CD & deploy the demo
- **Do:** unit tests on services; E2E (Playwright) for login→submit→track + the cross-tenant and duplicate-submit checks; GitHub Actions build→test→deploy to Render (backend) + Vercel/Netlify (frontend).
- **Done:** CI green; public demo URL works; secrets only in host env vars.
- **Pitfall:** flaky E2E from hard-coded waits; secrets committed to the repo.

### Phase 9 — Microsoft migration (after approvals)
- **Do, per port, one at a time:** write the Azure adapter, flip its env var, redeploy, verify, move on:
  1. **DB:** EF Core provider Postgres→SQL Server; re-run migrations against Azure SQL.
  2. **Auth:** `EntraExternalIdAuth` adapter; `AUTH_PROVIDER=entra`.
  3. **Storage:** `BlobStorage` adapter; `STORAGE_PROVIDER=azureblob`.
  4. **Tickets:** `AzureDevOpsTicketSystem` adapter; `TICKETS_PROVIDER=azuredevops`.
  5. **Notifications:** Graph (Outlook) + Teams adapter; `NOTIFY_PROVIDER=microsoft`.
  6. **Hosting:** same container → Azure App Service; frontend → Azure Static Web Apps.
  7. **Telemetry:** OTel exporter → Azure Monitor. **Automation (optional):** add Power Automate Premium if desired.
- **Done:** each swap verified independently; business logic and tests unchanged throughout.
- **Pitfall:** doing all swaps at once — migrate one port per PR so a failure is isolated.

### Definition of done (every phase)
Builds green · module tests pass · no secret in code · `docs/architecture.md` + `docs/migration.md` updated if anything changed · `context/session-log.md` updated · small reviewed PR.

---

## 6. Technology recommendations (free now, migration-friendly)

| Concern | Free MVP pick | Why this one | Migration-friendly because |
|---|---|---|---|
| Frontend | React + **Vite** + TypeScript | Real build; reuses your existing views | Static output runs anywhere → Azure Static Web Apps |
| Backend | **.NET 8** (C#) — *or Node + TypeScript* | Typed; **EF Core targets Postgres *and* SQL Server** | Provider swap is the DB migration |
| Backend host | **Render** free web service (Docker) | No card, full container, free | Same container → Azure App Service |
| Database | **Neon** (free Postgres, scale-to-zero) | Won't pause like Supabase free; branching for CI | EF Core/Prisma → Azure SQL |
| ORM | **EF Core** (or **Prisma** for Node) | Migrations in code; dual-provider | Postgres→SQL Server is a setting |
| Auth | **Supabase Auth** (or Clerk/Auth0 free) | Free, standard OIDC/JWT, invite support | OIDC → Entra External ID adapter swap |
| File storage | **Supabase Storage** / **Cloudflare R2** | Free, S3-style API, signed URLs | → Azure Blob adapter swap |
| Tickets | **GitHub Issues** (free API) | ~1:1 with Azure DevOps work items | → Azure DevOps adapter swap |
| Notifications | **Resend**/SMTP + **Slack/Discord** webhook | Free, simple | → Outlook (Graph) + Teams adapter swap |
| Orchestration | **In-process outbox worker** (code) | No broker/license at this volume | → optional Power Automate later |
| CI/CD | **GitHub Actions** | Free; works before and after migration | No change needed at migration |
| Monitoring | **OpenTelemetry** → Sentry/Grafana Cloud free | Vendor-neutral instrumentation | → Azure Monitor: change exporter only |
| Docs | Markdown in-repo (`/docs`, `/specs`) | Claude reads natively; zero tooling | Unchanged |

Everything above is cleanly abstracted (Section 2) and enterprise-scalable — the free choices are demo conveniences behind interfaces, not architectural commitments.

---

## 7. Deliverables — ready-to-paste Claude assets

### 7.1 `CLAUDE.md` (root)
```markdown
# CLIENTREQUIREMENTS — Claude memory

## What this is
Traditional (NON-AI) client request portal: React/Vite frontend + .NET 8 API.
Clients submit & track requests; requests sync to a work-tracking system.
Claude Code is the DEV TOOL only — the product contains no AI, ever.

## Architecture rule that matters most
External services sit behind PORTS in backend/src/Platform/Ports
(IIdentityProvider, IFileStorage, ITicketSystem, INotifier, IClock).
Business logic depends on ports, NEVER on a vendor. Adapters are chosen by env vars
in AdapterRegistration. To migrate to Microsoft later we ADD an adapter; we do not
change business logic.

## Where things live
- Frontend: frontend/src — views/, components/, api/ (one fn per endpoint), auth/, context/
- Backend: backend/src/Modules/<Feature> — Endpoints/Service/Repository/Validators/entity/Tests
- Ports & adapters: backend/src/Platform/  | Cross-cutting: backend/src/Shared
- Specs: specs/  Tasks: tasks/  Migration map: docs/migration.md  Arch: docs/architecture.md
- Continuity: context/session-log.md

## Rules (prefer these phrasings)
- Dependency direction: Endpoints → Service → Repository. Never skip a layer.
- Talk to external services ONLY through a Port. Vendor specifics live inside one adapter.
- Server is source of truth for validation; client validation is UX only.
- Prefer files < 300 lines; one feature per module; co-locate tests.
- Read ONLY the module a task names. Use the `explorer` subagent to search.
- Prefer env vars for all config; never put secrets in code or this file.
- Keep DB queries portable (no Postgres-only SQL) so SQL Server migration stays clean.

## Commands
- Backend tests: cd backend && dotnet test
- Frontend dev:  cd frontend && npm run dev
- Build: cd frontend && npm run build ; cd backend && dotnet build

## Workflow
One /tasks file at a time. Skills: scaffold-module, add-endpoint, add-adapter,
session-recap, pr-review. End each session with session-recap.
```

### 7.2 Skill — `add-adapter` (the migration workhorse)
`.claude/skills/add-adapter/SKILL.md`
```markdown
---
name: add-adapter
description: Implement a new adapter for an existing Port without touching business logic.
---
Inputs: the port name (e.g. ITicketSystem) and the target provider (e.g. AzureDevOps).
Steps:
1. Read ONLY: the port interface in backend/src/Platform/Ports, and one existing
   adapter for that port as a reference. Do NOT read Modules or business logic.
2. Create backend/src/Platform/Adapters/<Provider>/<Provider><Port>.cs implementing
   every method of the port. Keep ALL vendor-specific code inside this class.
3. Register it in AdapterRegistration under a new env-var value.
4. Add adapter-level tests (mock the external call).
5. Report files changed + the env var to set. Confirm NO business logic was modified.
Constraint: if you find yourself needing to change a Module, STOP — the port is leaking.
```

### 7.3 Skill — `add-endpoint`
`.claude/skills/add-endpoint/SKILL.md`
```markdown
---
name: add-endpoint
description: Implement one API endpoint from its spec, with tests, in one module.
---
1. Read ONLY: the named spec under specs/api/, and the target Modules/<Feature>/* files.
2. Route in <Feature>Endpoints.cs (no logic). Logic in <Feature>Service.cs.
   Data in <Feature>Repository.cs. Validation in <Feature>Validators.cs.
3. External calls go through a Port (never call a vendor SDK from a Module).
4. Unit tests covering happy path + each error in the spec.
5. Run tests via the test-runner subagent; fix to green. Report changes only.
```

### 7.4 Subagent — `explorer`
`.claude/agents/explorer.md`
```markdown
---
name: explorer
description: Read-only codebase search; returns concise findings, never full files.
tools: Read, Grep, Glob
---
Answer the question by searching. Return only relevant file paths, the specific
lines/symbols that matter, and a 2-3 sentence conclusion. Never paste whole files back.
```

### 7.5 Subagent — `test-runner`
`.claude/agents/test-runner.md`
```markdown
---
name: test-runner
description: Runs tests and returns only failures, never full logs.
tools: Bash, Read
---
Run the relevant module's tests. Return ONLY a pass/fail summary and failing
assertions with file:line. Do not paste full output into the reply.
```

### 7.6 Feature spec template
`specs/features/TEMPLATE.md`
```markdown
# Feature: <name>
## Goal
<one sentence: what the user can do>
## Endpoint(s)
<method + path; link specs/api/...>
## Ports used
<e.g. ITicketSystem, INotifier — business logic must use these, not vendors>
## Acceptance criteria
- [ ] <behavioral, testable>
- [ ] <error case>
## Out of scope
- <explicitly excluded>
```

### 7.7 Task template
`tasks/TEMPLATE.md`
```markdown
# Task <NNN> — <title>
Spec: <specs/...>      Module/area: <single module or one adapter>
## Do
- <imperative step>
## Definition of done
- <build/test condition>   - <behavioral acceptance>
## Context to load
- <exact files — keep minimal>
## Out of scope
- <excluded, to stop scope creep>
```

### 7.8 Session-log template
`context/session-log.md`
```markdown
# Session Log   <!-- newest on top; each entry <150 words; no code -->

## 2026-05-29 — Phase 1 ports layer
- Defined 5 ports + Local adapters; AdapterRegistration reads env
- Frontend migrated to frontend/src/views; Vite build green
- Next: Phase 2 — Shared layer + Requests module (in-memory)
```

### 7.9 Low-token prompt templates
```
Start a task:
  Work on tasks/021-tickets-github-adapter.md. Load only the files it lists.
  Follow CLAUDE.md. Use test-runner for tests. Stop at DoD.

Add a migration adapter:
  Use the add-adapter skill: implement AzureDevOps for ITicketSystem.
  Do not modify any Module.

Resume next session:
  Resume from context/session-log.md (latest). Continue the open task; don't re-explain the project.

Investigate without polluting context:
  Use the explorer subagent: where is the request reference (CBLPBR-###) generated?
```

### 7.10 Text architecture diagram (`docs/architecture.md`)
```
[ Browser ] React/Vite SPA --OIDC/JWT--> Auth (Supabase now → Entra later)
     | HTTPS (api client: one fn/endpoint)
     v
[ Backend API ] (.NET 8 on Render now → Azure App Service later)
   Shared: auth | errors→problem+json | logging (OpenTelemetry)
   Modules: Requests | Comments | Attachments | Sync
        |            |              |
        |            |              └─ uses ITicketSystem ─┐
        v            v                                     v
   Postgres      File storage                      Adapter (GitHub Issues now
   (EF Core,     (Supabase/R2 now                   → Azure DevOps later)
   Neon now →    → Azure Blob later)                       |
   Azure SQL)                                       outbox worker (code)
                                                           |
                                              INotifier → email + Slack
                                              (now)  → Outlook + Teams (later)
```

---

## Closing guidance

- **Build Phases 0–2 first** and run entirely on `Local` adapters — prove the architecture and the Claude Code workflow before touching any external service.
- **The free stack is a set of adapters, not a commitment.** Because everything external is behind a port, "we used Supabase/GitHub for the demo" never becomes technical debt — it's a swap, by design.
- **Two habits deliver most of the token savings:** name the exact files in every task, and send search/test work to subagents. The vertical-slice + ports architecture makes both effortless.
- **Migration is a checklist, not a project** (Phase 9): one adapter per PR, flip an env var, verify, repeat — business logic and tests stay untouched the whole way.
- **The product stays AI-free throughout.** Claude Code writes ordinary, deterministic code; nothing here adds a runtime AI dependency.

*This blueprint is the human reference map. Day to day, Claude Code reads `CLAUDE.md`, one `/specs` file, and one `/tasks` file — never this whole document.*
