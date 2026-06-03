# Provana Help Center — Client Request Portal

A multi-tenant customer request portal where clients submit and track Power BI and analytics work requests. Built with React + Vite on the frontend and Node.js/Fastify on the backend, with a clean ports-and-adapters architecture that lets every external service (auth, storage, ticketing, notifications, database) swap from a free provider to a Microsoft provider by changing one environment variable — no business logic touches.

> **No AI at runtime.** Claude Code was used as a development tool only. The shipped product contains zero AI.

---

## Table of Contents

1. [What it does](#what-it-does)
2. [Tech stack](#tech-stack)
3. [Architecture overview](#architecture-overview)
4. [User roles](#user-roles)
5. [Running locally (quick start)](#running-locally-quick-start)
6. [Environment variables reference](#environment-variables-reference)
7. [Database setup options](#database-setup-options)
8. [Deploying to production](#deploying-to-production)
9. [Ticket integration](#ticket-integration)
10. [Notification setup](#notification-setup)
11. [Migrating to Microsoft (Phase 9)](#migrating-to-microsoft-phase-9)
12. [Project structure](#project-structure)
13. [Development commands](#development-commands)
14. [Demo accounts](#demo-accounts)

---

## What it does

- **Clients** log in, select their project, fill in a structured form, and submit a request. Each submission gets a unique reference number (e.g. `CBLPBR-631`).
- **Agents** and **Admins** see all requests for their assigned project, update statuses, and leave comments.
- **Super Admins** manage tenants (clients), users, projects, form templates, and can see everything across all tenants.
- Every status change can sync to a ticket system (GitHub Issues → Azure DevOps) and send a notification (SMTP email → Teams / Outlook).
- **Projects are Azure DevOps-driven** — admins connect existing ADO projects to the portal via a selector; freeform project creation is not allowed. If there are no unconnected ADO projects, the "+ New Project" button explains why instead of showing a form.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 + TypeScript |
| Backend | Node.js 20 + Fastify 4 + TypeScript |
| Database | PostgreSQL via Prisma ORM (Neon / Supabase / local Docker) |
| Auth | Local JWT (dev) → Supabase Auth → Azure Entra ID (Phase 9) |
| Storage | In-memory (dev) → Supabase Storage → Azure Blob (Phase 9) |
| Ticketing | In-memory (dev) → GitHub Issues → Azure DevOps (Phase 9) |
| Notifications | In-memory (dev) → SMTP / Teams / Slack → Microsoft Graph (Phase 9) |
| CI/CD | GitHub Actions (test + build + post-deploy smoke test) |
| Backend host | Render (Docker container) |
| Frontend host | Vercel (static Vite build + `/api/*` rewrite) |

---

## Architecture overview

```
[ Browser ] React/Vite SPA ──── JWT ────▶ Auth middleware
      │  HTTPS /api/*
      ▼
[ Fastify API ] :4000
  ├── Modules/
  │     ├── Requests    (submit, list, status transitions)
  │     ├── Comments    (public / internal notes)
  │     ├── Attachments (file upload / signed URL download)
  │     ├── FormTemplates (dynamic form builder per project)
  │     ├── IAM         (users, projects, project membership)
  │     ├── Auth        (login, register, enrichment)
  │     └── Sync        (outbox worker — pushes events to ITicketSystem + INotifier)
  │
  └── Platform/Ports/   ← interfaces only, no vendor code
        ├── IIdentityProvider   Supabase Auth  (→ Entra ID)
        ├── IFileStorage        Supabase/local  (→ Azure Blob)
        ├── ITicketSystem       GitHub Issues   (→ Azure DevOps)
        ├── INotifier           SMTP/Slack      (→ Teams/Graph)
        └── IClock              system time

[ Database ] PostgreSQL via Prisma
  7 tables: clients, portal_users, projects, project_members,
            form_templates, project_form_configs,
            requests, status_history, comments, attachments,
            outbox_events, client_ref_counters
```

**The rule that makes migration cheap:** business logic in `Modules/` depends only on port interfaces. Vendor SDKs live inside one adapter class each. Swapping a provider = add an adapter file + flip one env var. Nothing in `Modules/` ever changes.

---

## User roles

| Role | What they can do |
|---|---|
| `PENDING` | Registered but awaiting admin approval. Sees a holding screen. |
| `CLIENT` | Submit requests, track their own requests, download attachments. |
| `AGENT` | Everything a client can + see all project requests, update statuses, leave internal comments. |
| `ADMIN` | Everything an agent can + configure form templates for assigned projects. |
| `SUPER_ADMIN` | Everything + manage all tenants, users, projects, and form templates globally. |

Super Admins assign roles and project membership from the Control Panel. A newly registered user stays `PENDING` until a Super Admin activates them.

---

## Running locally (quick start)

### Prerequisites

- **Node.js 20+** — https://nodejs.org
- **npm 10+** (comes with Node)
- **Git**
- A PostgreSQL database (see [Database setup options](#database-setup-options) — Docker is the easiest for a fresh machine)

### 1. Clone the repository

```bash
git clone https://github.com/Yosmanovallos/ClientRequeriments.git
cd ClientRequeriments
```

### 2. Set up the backend

```bash
cd backend
npm install
```

Create `backend/.env` by copying the example below and filling in your values:

```env
# ── Required ──────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres:dev@localhost:5432/postgres

# ── Provider switches (leave as "local" for zero-config dev) ──────────────
AUTH_PROVIDER=local        # local | supabase | entra
STORAGE_PROVIDER=local     # local | supabase | azureblob
TICKETS_PROVIDER=local     # local | github   | azuredevops
NOTIFY_PROVIDER=local      # local | smtp     | slack | teams | composite

# ── Server ────────────────────────────────────────────────────────────────
PORT=4000
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=debug
NODE_ENV=development
```

> See [Environment variables reference](#environment-variables-reference) for all available variables.

Run the one-shot database setup (creates tables + seeds demo data):

```bash
npm run db:setup
```

Start the dev server:

```bash
npm run dev
```

The API is now available at `http://localhost:4000`. Check `http://localhost:4000/health`.

### 3. Set up the frontend

Open a second terminal:

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
# Leave VITE_API_URL empty in dev — Vite proxies /api to :4000 automatically
VITE_API_URL=

# Only needed if switching to real Supabase Auth (AUTH_PROVIDER=supabase)
# VITE_SUPABASE_URL=https://xxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

Start the frontend:

```bash
npm run dev
```

Open `http://localhost:5173` in your browser. Sign in with any [demo account](#demo-accounts).

---

## Environment variables reference

All configuration is via environment variables. Set them in `backend/.env` for local dev, or in your hosting provider's secret store for production.

### Provider switches

| Variable | Default | Options | Notes |
|---|---|---|---|
| `AUTH_PROVIDER` | `local` | `local` · `supabase` · `entra` | `local` = JWT with bcrypt passwords stored in DB |
| `STORAGE_PROVIDER` | `local` | `local` · `supabase` · `azureblob` | `local` = in-memory data URIs (lost on restart) |
| `TICKETS_PROVIDER` | `local` | `local` · `github` · `azuredevops` | `local` = no-op (tickets not created) |
| `NOTIFY_PROVIDER` | `local` | `local` · `smtp` · `slack` · `teams` · `composite` | `local` = no-op |

### Core server

| Variable | Example | Required |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pwd@host/db?sslmode=require` | Yes (without it, the server runs in-memory mode with no data persistence) |
| `PORT` | `4000` | No (default: 4000) |
| `CORS_ORIGIN` | `https://your-app.vercel.app` | Yes in production |
| `LOG_LEVEL` | `debug` | No (default: info) |
| `NODE_ENV` | `production` | No (default: development) |

### Supabase Auth (`AUTH_PROVIDER=supabase`)

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL |
| `SUPABASE_JWT_SECRET` | Supabase Dashboard → Project Settings → API → JWT Settings → JWT Secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → service_role key |
| `DEMO_FALLBACK_CLIENT_ID` | UUID of the demo tenant — only needed for dev/testing |

### GitHub Issues (`TICKETS_PROVIDER=github`)

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | Fine-grained PAT with Issues: Read+Write on the target repo |
| `GITHUB_OWNER` | GitHub username or org |
| `GITHUB_REPO` | Repository name |
| `GITHUB_WEBHOOK_SECRET` | Random string — used to verify inbound webhook payloads |

### Azure DevOps (`TICKETS_PROVIDER=azuredevops`)

| Variable | Required | Description |
|---|---|---|
| `ADO_ORG` | Yes | Organisation slug from `dev.azure.com/<org>` |
| `ADO_PAT` | Yes | Personal Access Token — scopes: Work Items Read+Write, Project and Team Read |
| `ADO_PROJECT` | No | Fallback project name when the request has no mapped ADO project |
| `ADO_WORK_ITEM_TYPE` | No | Work item type to create — `Task` (default) · `User Story` · `Bug` · `Issue` |
| `ADO_STATE_MAP_JSON` | No | JSON override for the portal-status → ADO-state map (default targets Agile template) |
| `ADO_API_URL` | No | Override for Azure DevOps Server (on-prem). Defaults to `https://dev.azure.com` |
| `ADO_WEBHOOK_USER` | No | Basic-auth username for inbound ADO Service Hook |
| `ADO_WEBHOOK_PASS` | No | Basic-auth password for inbound ADO Service Hook |

### SMTP Notifications (`NOTIFY_PROVIDER=smtp` or `composite`)

| Variable | Example |
|---|---|
| `SMTP_HOST` | `smtp.office365.com` · `smtp.resend.com` · `smtp.sendgrid.net` |
| `SMTP_PORT` | `587` (STARTTLS) · `465` (TLS) |
| `SMTP_USER` | Your email or API key username |
| `SMTP_PASS` | App password or API key |
| `NOTIFY_FROM` | `noreply@yourcompany.com` |

### Teams / Slack Notifications

| Variable | Description |
|---|---|
| `TEAMS_WEBHOOK_URL` | Teams Workflow webhook URL (`NOTIFY_PROVIDER=teams` or `composite`) |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL (`NOTIFY_PROVIDER=slack` or `composite`) |

### Frontend variables (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Leave empty in dev (Vite proxy handles it). Set to full Render URL in prod if not using Vercel rewrites. |
| `VITE_SUPABASE_URL` | Only when `AUTH_PROVIDER=supabase` |
| `VITE_SUPABASE_ANON_KEY` | Only when `AUTH_PROVIDER=supabase` |

---

## Database setup options

The backend runs entirely in-memory (no data persistence) when `DATABASE_URL` is not set — useful for running tests. For real usage, pick one of the options below.

### Option A — Local Docker (recommended for development on a new machine)

No account needed. Install Docker Desktop first: https://www.docker.com/products/docker-desktop/

```bash
# Spin up a throwaway Postgres instance
docker run -d --name portal-pg \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=dev \
  postgres:16-alpine
```

Set in `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:dev@localhost:5432/postgres
```

Then run the one-shot setup:

```bash
cd backend
npm run db:setup
```

### Option B — Neon (free cloud Postgres, recommended for demos)

1. Sign up free at https://console.neon.tech (no credit card)
2. Create a new project → copy the **pooled connection URL**:
   ```
   postgresql://user:pwd@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
3. Set it as `DATABASE_URL` in `backend/.env`
4. Run `cd backend && npm run db:setup`

### Option C — Supabase Postgres

Use your existing Supabase project database:

1. Dashboard → Project Settings → Database → **Transaction pooler** URL (port 6543)
2. Set as `DATABASE_URL` in `backend/.env`
3. Run `cd backend && npm run db:setup`

### Useful database commands

```bash
cd backend

npm run db:setup      # One-shot: generate → deploy migrations → seed demo data
npm run db:generate   # Regenerate Prisma client after editing schema.prisma
npm run db:migrate    # Create a new migration from schema changes (dev only)
npm run db:deploy     # Apply migrations to a live DB (production-safe, non-interactive)
npm run db:seed       # Re-run the seed script (demo client + sample requests)
npm run db:reset      # Drop + re-migrate + re-seed (DESTRUCTIVE — dev only)

npx prisma studio     # Visual DB browser at http://localhost:5555
```

---

## Deploying to production

Full deploy in ~30 minutes using free tiers. See `docs/deployment.md` for the step-by-step walkthrough.

### Overview

```
User → Vercel (frontend, static) → /api/* rewrite → Render (backend, Docker) → Neon (Postgres)
```

### Quick steps

**1. Neon** — create a project, copy the connection URL.

**2. Render**
- New Web Service → connect your GitHub repo → Render auto-detects `render.yaml`
- Set `DATABASE_URL` (Neon URL) in the Environment tab
- Set `CORS_ORIGIN` to your Vercel URL after step 3

**3. Vercel**
- New Project → import the same repo → set Root Directory = `frontend`
- Edit `frontend/vercel.json` and replace the placeholder backend URL with your Render URL
- Commit + push → Vercel redeploys automatically

**4. GitHub Actions secrets** (for CI smoke tests)
- `BACKEND_URL` = your Render URL
- `FRONTEND_URL` = your Vercel URL

**5. Smoke test**
```bash
curl https://your-render-app.onrender.com/health
# → {"status":"ok","db":"prisma"}

curl -I https://your-app.vercel.app/
# → HTTP/2 200
```

### Free tier limits

| Service | Limit |
|---|---|
| Render Free | Sleeps after 15 min idle (cold start ~30-50s). Upgrade to Starter ($7/mo) for always-on. |
| Vercel Hobby | 100 GB bandwidth/mo, unlimited builds |
| Neon Free | 0.5 GB storage, scale-to-zero after 5 min idle (wakes in ~1s) |

---

## Ticket integration

### GitHub Issues (free MVP)

1. Create a GitHub repo to serve as the issue tracker
2. Generate a fine-grained PAT: https://github.com/settings/tokens?type=beta
   - Permissions: Issues → Read and write
3. Set in `backend/.env`:
   ```env
   TICKETS_PROVIDER=github
   GITHUB_TOKEN=github_pat_xxx
   GITHUB_OWNER=your-org
   GITHUB_REPO=your-repo
   ```

For bidirectional sync (status changes flow back from GitHub to the portal), also add a GitHub webhook pointing to `https://your-host/webhooks/github` and set `GITHUB_WEBHOOK_SECRET`.

### Azure DevOps

The portal treats Azure DevOps as the source of truth for **projects and work items**. Admins connect existing ADO projects to the portal — the app never creates ADO projects.

#### Minimum setup

```env
TICKETS_PROVIDER=azuredevops
ADO_ORG=your-org-slug          # the slug from dev.azure.com/<slug>
ADO_PAT=<PAT>                  # generate at dev.azure.com/<org>/_usersSettings/tokens
ADO_WORK_ITEM_TYPE=Issue       # matches the work item type in your ADO process template
                               # Agile → Task | User Story  /  Scrum → Product Backlog Item  /  Basic → Issue
```

**`ADO_PROJECT` is optional.** When omitted, every request targets the ADO project stored in the portal's database (set when an admin connects the project). You only need to set it if you have a single fixed fallback project.

#### Process template — state map override

The default state map targets the **Agile** template (`New → Active → Resolved → Closed`). If your ADO project uses the **Basic** template (`To Do → Doing → Done`), set:

```env
ADO_STATE_MAP_JSON={"NEW":{"state":"To Do"},"IN REVIEW":{"state":"To Do"},"APPROVED":{"state":"To Do"},"IN DEVELOPMENT":{"state":"Doing"},"UAT":{"state":"Doing"},"CUSTOMER FEEDBACK":{"state":"Doing"},"DONE":{"state":"Done"},"CANCELLED":{"state":"Done"},"ON HOLD":{"state":"To Do"}}
```

#### Connecting ADO projects in the portal

1. In the Control Panel → **Projects**, click **+ New Project**
2. The modal fetches all ADO projects in `ADO_ORG` that are not yet connected
3. Select one — the portal name and slug auto-fill from the ADO project name
4. Click **Connect project** — a local mapping row is created; nothing is created in ADO
5. Once all ADO projects are connected the modal shows an informational message instead of a form

#### Generating a PAT

Go to `https://dev.azure.com/<your-org>/_usersSettings/tokens` → **+ New Token** → set these scopes:
- Work Items → **Read & Write**
- Project and Team → **Read**

#### Bidirectional sync via ADO Service Hooks

```env
ADO_WEBHOOK_USER=<username>
ADO_WEBHOOK_PASS=<password>
```
Then create Service Hook subscriptions in ADO pointing to `https://your-host/webhooks/azuredevops`.

Full ADO state mapping and webhook setup: see `docs/environments.md`.

---

## Notification setup

### Outlook + Teams (recommended for Microsoft organisations)

```env
NOTIFY_PROVIDER=composite

# Email via Outlook SMTP
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your.email@outlook.com
SMTP_PASS=<16-char app password>   # generate at account.microsoft.com/security
NOTIFY_FROM=your.email@outlook.com

# Teams Workflow webhook
# Teams channel → ⋯ → Workflows → "Post to channel when webhook request received"
TEAMS_WEBHOOK_URL=https://prod-12.westus.logic.azure.com/workflows/...
```

### Resend (free 100 emails/day)

```env
NOTIFY_PROVIDER=smtp
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxx
NOTIFY_FROM=noreply@your-verified-domain.com
```

### Slack

```env
NOTIFY_PROVIDER=slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../X...
```

---

## Migrating to Microsoft (Phase 9)

The whole system is designed to migrate to the Microsoft stack by swapping adapters one at a time. Each swap is one PR that adds a new adapter file and flips one env var. Business logic (`Modules/`) is never touched.

| What | Free MVP (now) | Microsoft (Phase 9) | Env var to flip |
|---|---|---|---|
| Auth | Local JWT / Supabase | Azure Entra ID (OIDC) | `AUTH_PROVIDER=entra` |
| Storage | Supabase Storage | Azure Blob Storage | `STORAGE_PROVIDER=azureblob` |
| Ticketing | GitHub Issues | Azure DevOps Work Items | `TICKETS_PROVIDER=azuredevops` |
| Notifications | SMTP + Teams Webhook | Microsoft Graph (Mail + Teams) | `NOTIFY_PROVIDER=microsoft` |
| Database | Postgres (Neon) | Azure SQL (SQL Server) | Change `prisma/schema.prisma` provider + `DATABASE_URL` |
| Backend host | Render (Docker) | Azure App Service for Containers | Same Dockerfile |
| Frontend host | Vercel | Azure Static Web Apps | Same Vite build output |

See `docs/migration.md` for the full step-by-step migration playbook.

---

## Project structure

```
.
├── backend/                    Node.js/Fastify API
│   ├── prisma/
│   │   ├── schema.prisma       Database schema (7 models)
│   │   ├── migrations/         SQL migration history
│   │   └── seed.ts             Demo data seeder
│   ├── src/
│   │   ├── app.ts              Entry point — Fastify setup + adapter wiring
│   │   ├── Modules/            Feature slices (vertical)
│   │   │   ├── Requests/       Request CRUD, status transitions
│   │   │   ├── Comments/       Public + internal comments
│   │   │   ├── Attachments/    File upload (signed URL download)
│   │   │   ├── FormTemplates/  Dynamic form builder + project assignment
│   │   │   ├── IAM/            Users, projects, project membership
│   │   │   ├── Auth/           Login, register, token enrichment
│   │   │   └── Sync/           Outbox worker → ITicketSystem + INotifier
│   │   ├── Platform/
│   │   │   ├── Ports/          Interfaces (IIdentityProvider, IFileStorage, ...)
│   │   │   ├── Adapters/       Vendor implementations
│   │   │   └── AdapterRegistration.ts  Wires env vars → concrete adapters
│   │   └── Shared/             Auth middleware, error helpers, logging
│   ├── Dockerfile              Multi-stage, Node 20 alpine, non-root, tini PID-1
│   └── package.json
│
├── frontend/                   React + Vite SPA
│   ├── src/
│   │   ├── views/              Page-level components
│   │   │   ├── ViewPortal.tsx         Home screen — project picker
│   │   │   ├── ViewFormsList.tsx      Form selector for a project
│   │   │   ├── ViewDynamicForm.tsx    Dynamic form renderer
│   │   │   ├── ViewMyRequests.tsx     Request list (client = own, agent/admin = all)
│   │   │   ├── ViewRequestDetail.tsx  Request detail + comments + attachments
│   │   │   ├── ViewLogin.tsx          Login / register / pending-approval screens
│   │   │   └── admin/
│   │   │       └── ViewControlPanel.tsx  Super Admin + Admin back-office
│   │   ├── components/         Reusable UI components
│   │   │   ├── layout/         TopNav, Breadcrumbs
│   │   │   └── brand/          ProvanaLogo, Avatar, HeroNetwork, Monogram
│   │   ├── context/            AppContext — global state (user, view, activeProject)
│   │   ├── api/                One function per backend endpoint
│   │   └── auth/               Auth provider abstraction (local / Supabase)
│   ├── vercel.json             /api/* rewrite to Render + asset caching headers
│   └── package.json
│
├── docs/
│   ├── architecture.md         System architecture diagram
│   ├── deployment.md           Full Render + Vercel deploy walkthrough
│   ├── environments.md         All env vars + database / integration setup guides
│   ├── migration.md            Port-by-port Microsoft migration playbook
│   └── decisions/              Architecture decision records
│
├── specs/                      Feature and API specifications
├── tasks/                      Per-task implementation files
├── render.yaml                 Render service spec (auto-detected on first deploy)
└── README.md                   This file
```

---

## Development commands

### Backend (`cd backend`)

```bash
npm run dev           # Dev server on :4000 with hot reload (tsx watch)
npm run build         # Compile TypeScript → dist/
npm start             # Run compiled output (production)
npm test              # Run Vitest unit tests
npm run typecheck     # TypeScript type check only (no emit)

npm run db:setup      # One-shot: generate + migrate + seed
npm run db:generate   # Regenerate Prisma client
npm run db:migrate    # Create new migration from schema changes
npm run db:deploy     # Apply migrations (production-safe)
npm run db:seed       # Re-run seed script
npm run db:reset      # Drop + re-migrate + re-seed (DESTRUCTIVE)
```

### Frontend (`cd frontend`)

```bash
npm run dev           # Dev server on :5173 (proxies /api → :4000)
npm run build         # Type check + Vite production build → dist/
npm run preview       # Serve the production build locally
npm run typecheck     # TypeScript type check only (no emit)
npm run test:e2e      # Run Playwright end-to-end tests
npm run test:e2e:ui   # Run Playwright with the interactive UI
```

### Legacy demo app (no build required)

The `app/` folder contains the original Babel-standalone prototype. To run it:

```bash
npx serve . --listen 3000
```

Open `http://localhost:3000/Provana Help Center.html`. No database, no backend — useful for UI prototyping only.

---

## Demo accounts

When running with `AUTH_PROVIDER=local` (the default), these seeded accounts are available:

| Email | Password | Role |
|---|---|---|
| `super@provana.com` | `Demo1234!` | SUPER_ADMIN |
| `admin@blg.com` | `Demo1234!` | ADMIN |
| `agent@blg.com` | `Demo1234!` | AGENT |
| `client@blg.com` | `Demo1234!` | CLIENT |
| `pending@blg.com` | `Demo1234!` | PENDING — awaiting approval |

> **No projects are seeded.** Connect an Azure DevOps project first via Control Panel → Projects → + New Project. Assign users to projects afterwards via Control Panel → Projects → Members.

---

## Running on another computer — checklist

1. **Install Node.js 20+** → https://nodejs.org
2. **Clone the repo**: `git clone https://github.com/Yosmanovallos/ClientRequeriments.git`
3. **Install Docker Desktop** (easiest local DB) → https://www.docker.com/products/docker-desktop/
4. **Start a local Postgres**:
   ```bash
   docker run -d --name portal-pg -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16-alpine
   ```
5. **Create `backend/.env`** with at minimum:
   ```env
   DATABASE_URL=postgresql://postgres:dev@localhost:5432/postgres
   AUTH_PROVIDER=local
   STORAGE_PROVIDER=local
   TICKETS_PROVIDER=local
   NOTIFY_PROVIDER=local
   PORT=4000
   CORS_ORIGIN=http://localhost:5173
   ```
6. **Install + migrate + seed**:
   ```bash
   cd backend && npm install && npm run db:setup
   ```
7. **Start the backend**:
   ```bash
   npm run dev
   ```
8. **In a second terminal, start the frontend**:
   ```bash
   cd frontend && npm install && npm run dev
   ```
9. Open `http://localhost:5173` and sign in with `super@provana.com` / `Demo1234!`

---

## License

Private — Provana internal project. All rights reserved.
