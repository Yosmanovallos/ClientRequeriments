# Environment Variables

All config via env vars. Real values live in the host's secret store (Render env vars → Azure Key Vault later).
Copy `.env.example` to `.env` and fill in values. Never commit `.env`.

## Provider switches (the migration levers)
| Variable | Default | Options |
|----------|---------|---------|
| `AUTH_PROVIDER` | `local` | `local` · `supabase` · `entra` (Phase 9) |
| `STORAGE_PROVIDER` | `local` | `local` · `supabase` · `azureblob` |
| `TICKETS_PROVIDER` | `local` | `local` · `github` · `azuredevops` |
| `NOTIFY_PROVIDER` | `local` | `local` · `smtp` · `slack` · `microsoft` |

`local` = InMemory adapters (no external service needed, safe for tests and early dev).

## Per-environment values
| Variable | Dev (local) | Staging (Render) | Prod (Render / Azure) |
|----------|-------------|------------------|-----------------------|
| `DATABASE_URL` | local Postgres or Neon branch | Neon main | Neon/Azure SQL |
| `AUTH_PROVIDER` | `local` | `supabase` | `supabase` → `entra` |
| `TICKETS_PROVIDER` | `local` | `github` | `github` → `azuredevops` |
| `CORS_ORIGIN` | `http://localhost:5173` | Vercel preview URL | Production domain |
| `LOG_LEVEL` | `debug` | `info` | `warn` |

## Database setup (Phases 3 + 8c)

The backend boots with **InMemory** repositories when `DATABASE_URL` is unset — useful for tests and the early dev loop. To switch to a real Postgres database, set `DATABASE_URL` and run the one-shot setup script.

### One-shot setup (after picking a host below)
```bash
cd backend
# .env contains DATABASE_URL=postgresql://...
npm run db:setup    # = generate Prisma client → apply migrations → seed
```
That's it. `db:setup` chains:
- `prisma generate` — produce the typed client
- `prisma migrate deploy` — apply `prisma/migrations/0001_init/migration.sql` (140 lines, 7 tables)
- `tsx prisma/seed.ts` — bootstrap the BLG demo client (`prefix=CBLPBR`, counter=629) + 4 sample requests

Restart the backend — `/health` now returns `db: "prisma"` instead of `db: "in-memory"`.

### Option A — Neon (recommended for free MVP)
Free Postgres with scale-to-zero + branching (one branch per PR for CI). No credit card.

1. Sign up: https://console.neon.tech → new project
2. Dashboard → **Connection Details** → copy the URL — looks like:
   ```
   postgresql://user:pwd@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
3. `backend/.env`:
   ```
   DATABASE_URL=postgresql://user:pwd@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. `npm run db:setup` → migrations apply, seed runs.

### Option B — Supabase Postgres
Use your existing Supabase project (the one with the auth keys).

1. Supabase Dashboard → **Project Settings → Database → Connection string (URI)**
2. Use the **"Transaction pooler"** URL for `DATABASE_URL` (port 6543, includes `?pgbouncer=true`):
   ```
   DATABASE_URL=postgresql://postgres.xxx:pwd@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
3. For `prisma migrate`, you also need a direct connection (port 5432, no pooler). Add as a separate var **and** reference it in `schema.prisma` if you want migrations to bypass the pooler:
   ```
   DIRECT_URL=postgresql://postgres.xxx:pwd@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   ```
4. `npm run db:setup`

### Option C — Local Postgres (Docker)
For offline dev. Spin up a throwaway Postgres in 5 seconds:
```bash
docker run -d --name portal-pg -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16-alpine
```
Then in `backend/.env`:
```
DATABASE_URL=postgresql://postgres:dev@localhost:5432/postgres
```
Run `npm run db:setup`.

### Useful Prisma commands
| Command | What it does |
|---------|--------------|
| `npm run db:generate` | Regenerate the typed Prisma client (run after editing `schema.prisma`) |
| `npm run db:migrate -- --name <slug>` | Create a new migration from schema changes (dev only — interactive) |
| `npm run db:deploy` | Apply pending migrations to a real DB (production-safe, non-interactive) |
| `npm run db:seed` | Re-run the seed script |
| `npm run db:reset` | Drop everything, re-migrate, re-seed (dev only — destructive!) |
| `npx prisma studio` | Open the visual DB browser at http://localhost:5555 |

### Switching to Azure SQL (Phase 9)
1. Change `provider = "postgresql"` → `"sqlserver"` in `backend/prisma/schema.prisma`
2. Update `DATABASE_URL` to an Azure SQL connection string
3. Run `npx prisma migrate deploy` — Prisma regenerates the migration SQL for SQL Server
4. No code in `Modules/` changes. The `payload` columns are `String @db.Text` (not Postgres `Jsonb`) so they translate to `nvarchar(max)` cleanly.

## Ticket integration setup (Phase 5)

### GitHub Issues (free MVP)
1. Create a personal repo to serve as the issue tracker (e.g. `acme/bi-requests`)
2. Generate a **fine-grained personal access token** at https://github.com/settings/tokens?type=beta
   - Repository access: only the one repo (least privilege)
   - Permissions: **Issues** → Read and write
3. Set in `backend/.env`:
   ```
   TICKETS_PROVIDER=github
   GITHUB_TOKEN=github_pat_xxx
   GITHUB_OWNER=acme
   GITHUB_REPO=bi-requests
   ```
4. Restart the backend. POST /requests will now create real GitHub issues.
5. Status mapping: only `DONE` and `CANCELLED` close the issue (with appropriate `state_reason`). All other statuses keep the issue open — the precise portal status lives in the DB, GitHub just shows open/closed for the BI team.

### GitHub webhook setup (Phase 5b — inbound sync)
1. In the same repo: **Settings → Webhooks → Add webhook**
2. **Payload URL:** `https://your-host/webhooks/github` (must be HTTPS-reachable — for local dev use ngrok or a Render preview URL)
3. **Content type:** `application/json`
4. **Secret:** generate a long random string and paste it in
5. Set the same value in `backend/.env` as `GITHUB_WEBHOOK_SECRET`
6. **Which events?** → "Let me select" → check **Issues** and **Issue comments**
7. Save. GitHub immediately fires a `ping` event — verify it succeeds (200 with `{status:"pong"}`)
8. Status mapping (GitHub → portal):
   - `issues.closed` with `state_reason: completed` → `DONE`
   - `issues.closed` with `state_reason: not_planned` → `CANCELLED`
   - `issues.reopened` → `IN REVIEW` (re-triage)
   - `issue_comment.created` → appends to portal comments with `source: 'TICKET'`
9. The endpoint is only registered when `GITHUB_WEBHOOK_SECRET` is set (clean opt-in).

### Azure DevOps (`TICKETS_PROVIDER=azuredevops`)
Real ADO Work Items via REST + JSON Patch + Basic Auth (PAT). No SDK. Works with Azure DevOps Services (cloud) and Azure DevOps Server (on-prem, set `ADO_API_URL`).

1. **Get the org name** — the segment after `dev.azure.com/` in your org URL. e.g. `https://dev.azure.com/acme/...` → `acme`.
2. **Get the project name** — the exact case-sensitive name from `https://dev.azure.com/<org>/_projects`.
3. **Create a Personal Access Token**:
   - `https://dev.azure.com/<org>/_usersSettings/tokens` → **+ New Token**
   - Name: "Provana Portal"
   - Expiration: pick max (you'll rotate as part of secret hygiene)
   - **Scopes**: pick **Custom defined** → check **Work Items: Read, write, & manage**
   - Click Create, **copy the token immediately** — you can't view it again
4. **Pick the work item type** — must exist in your project's process template. Default: `Task`. Common choices:
   - Agile: `User Story`, `Task`, `Bug`, `Issue`
   - Scrum: `Product Backlog Item`, `Task`, `Bug`, `Impediment`
   - Basic: `Issue`, `Task`, `Epic`
   - CMMI: `Requirement`, `Task`, `Bug`, `Change Request`
5. **Set in `backend/.env`**:
   ```
   TICKETS_PROVIDER=azuredevops
   ADO_ORG=acme
   ADO_PROJECT=BLG-Reports
   ADO_PAT=<the token from step 3>
   ADO_WORK_ITEM_TYPE=Task                       # or User Story, Bug, Issue, etc.
   # ADO_API_URL=https://tfs.acme.internal/tfs   # ONLY for on-prem ADO Server
   ```
6. Restart the backend → next request submission creates a real work item at `https://dev.azure.com/<org>/<project>/_workitems/edit/<id>`.

### ADO status mapping — what gets pushed to System.State

Default mapping (**Agile process template** — most common):

| Portal status | ADO `System.State` | ADO `System.Reason` |
|---|---|---|
| NEW, IN REVIEW, APPROVED | `New` | — |
| IN DEVELOPMENT | `Active` | — |
| UAT | `Resolved` | — |
| CUSTOMER FEEDBACK | `Resolved` | `Information received` |
| DONE | `Closed` | `Fixed` |
| CANCELLED | `Removed` | `Abandoned` |
| ON HOLD | `New` | — (add a tag `on-hold` manually if needed) |

**If your project uses a different process** (Scrum / Basic / CMMI / custom), override via `ADO_STATE_MAP_JSON`:
```
ADO_STATE_MAP_JSON={"DONE":{"state":"Done","reason":"Work finished"},"IN DEVELOPMENT":{"state":"Committed"}}
```
Only the statuses you include in the JSON are overridden — the rest fall back to the Agile defaults. Find your project's valid states at: **Project Settings → Boards → Process → (your work item type) → States**.

### What gets stored in ADO when a request is created
- `System.Title` → `[CBLPBR-630] <your request title>`
- `System.Description` → the structured markdown body (reference, type, priority, due, payload fields)
- `System.Tags` → semicolon-joined: `CBLPBR-630; new_report; priority:high`

You can search/filter work items in ADO by the `CBLPBR-###` tag to find their portal counterpart.

### Custom fields (optional, advanced)
If your ADO project has custom fields like `Custom.PortalRequestId` you'd like populated, that needs a follow-up adapter extension (~30 min). Not required for the MVP — the reference is already in the title prefix and tags.

### ADO Service Hooks inbound webhook (Phase 5d — bidirectional sync)
Once the outbound adapter is working, set up Service Hooks to push status changes and comments back into the portal.

1. **Pick a strong username + password pair** for the webhook auth. Generate with e.g. `openssl rand -base64 24` for each.
2. Set in `backend/.env`:
   ```
   ADO_WEBHOOK_USER=<chosen username>
   ADO_WEBHOOK_PASS=<chosen password>
   ```
   The route `/webhooks/azuredevops` only registers when both are set.
3. In ADO: **Project Settings → Service hooks → + Create subscription**
4. **Service**: choose **Web Hooks**, click Next
5. **Trigger** — create one subscription **per event type**:
   - `Work item updated` (catches `System.State` changes)
   - `Work item commented on`
   - (Optional) filter by Area Path or Work Item Type
6. **Action: Web Hooks settings**:
   - **URL**: `https://your-host/webhooks/azuredevops` (must be HTTPS reachable — use ngrok for local dev)
   - **HTTP headers**: leave empty
   - **Basic authentication username**: the `ADO_WEBHOOK_USER` value
   - **Basic authentication password**: the `ADO_WEBHOOK_PASS` value
   - **Resource details to send**: **All** (the adapter reads multiple fields)
   - **Messages to send**: **None**
7. **Test** with the green "Test" button — should get a 200 response from the backend
8. **Finish**. Any work item state change or comment in this project now flows back into the portal automatically

### ADO webhook event mapping (ADO → portal)
| ADO `System.State` (Agile) | Portal status |
|---|---|
| `New` | `IN REVIEW` (re-triage) |
| `Active` | `IN DEVELOPMENT` |
| `Resolved` | `UAT` |
| `Closed` | `DONE` |
| `Removed` | `CANCELLED` |
| Scrum: `Approved`, `Committed`, `Done` | `APPROVED`, `IN DEVELOPMENT`, `DONE` |
| Basic: `To Do`, `Doing`, `Done` | `NEW`, `IN DEVELOPMENT`, `DONE` |
| Anything else (custom) | silently ignored (log entry only) |

For `workitem.commented`, the `System.History` text becomes a portal comment with `source: 'TICKET'` and the ADO user's display name as author. No loop-back to ADO (would cause infinite comment mirroring).

## Attachments setup (Phase 8)

### Supabase Storage (`STORAGE_PROVIDER=supabase`)
1. In your Supabase dashboard → **Storage → New bucket** → name it `attachments` (or whatever you put in `SUPABASE_STORAGE_BUCKET`)
2. Bucket privacy: **Private** is recommended (the backend hands out short-lived signed URLs; nothing is exposed publicly)
3. Set in `backend/.env`:
   ```
   STORAGE_PROVIDER=supabase
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...           # service-role key (server-only)
   SUPABASE_STORAGE_BUCKET=attachments            # defaults to "attachments"
   ```
4. Optional RLS / IAM scoping: storage keys use the shape `{clientId}/{requestId}/{attId}/{filename}` so you can write Supabase Storage policies that constrain access by tenant prefix.
5. Default upload size limit: 25 MiB per file (`MAX_UPLOAD_BYTES` in `Attachment.ts`). Override Fastify multipart limits if you need more.

### Local development (`STORAGE_PROVIDER=local`)
Files stay in memory as `data:` URIs. Resets on restart. Useful for tests + the first dev pass.

### Switching to Azure Blob Storage (Phase 9)
Implement `BlobFileStorage.ts` using `@azure/storage-blob`. Set `STORAGE_PROVIDER=azureblob` + `AZURE_STORAGE_CONNECTION_STRING` + `AZURE_STORAGE_CONTAINER`. No file in `Modules/` changes — keys and signed-URL semantics are identical.

## Notifications setup (Phase 6)

Free MVP picks: **Resend** (email, 100/day free) + **Slack incoming webhook** (channel, unlimited). Both swap for Microsoft Graph (Outlook + Teams) in Phase 9 without touching Modules/.

### SMTP-only (`NOTIFY_PROVIDER=smtp`)
Works with any SMTP provider. Resend is the simplest free choice.
1. Sign up at https://resend.com (free 100 emails/day, no card)
2. Verify a sending domain (or use `onboarding@resend.dev` for testing)
3. Create an API key → Dashboard → API Keys
4. Set in `backend/.env`:
   ```
   NOTIFY_PROVIDER=smtp
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=465
   SMTP_USER=resend
   SMTP_PASS=re_xxxxxxxxxxxx          # your Resend API key
   NOTIFY_FROM=noreply@your-verified-domain.com
   ```
5. Same shape works for SendGrid (`smtp.sendgrid.net:587`, user `apikey`), Mailgun, Amazon SES, etc.

### Slack-only (`NOTIFY_PROVIDER=slack`)
1. Slack workspace → **Apps → Incoming Webhooks → Add to Slack**
2. Pick the channel (e.g. `#bi-requests`) → **Add Incoming Webhooks integration**
3. Copy the **Webhook URL** (`https://hooks.slack.com/services/T.../B.../X...`)
4. Set in `backend/.env`:
   ```
   NOTIFY_PROVIDER=slack
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
   ```

### Teams-only (`NOTIFY_PROVIDER=teams`)
The modern Teams Workflow webhook — replaces the deprecated "Incoming Webhooks" connector. **Does NOT require Power Automate Premium.**

1. In your Teams channel: click `⋯` (More options) → **Workflows**
2. Pick the template **"Post to a channel when a webhook request is received"** (search if not visible)
3. Click **Next** — verify the team + channel are correct
4. Click **Create flow**. Teams shows a **Workflow URL** — copy it (it looks like `https://prod-12.westus.logic.azure.com/workflows/.../triggers/manual/paths/invoke?sig=...`)
5. Set in `backend/.env`:
   ```
   NOTIFY_PROVIDER=teams
   TEAMS_WEBHOOK_URL=https://prod-12.westus.logic.azure.com/workflows/...
   ```
6. The first POST will trigger the Workflow's permission consent if not already granted.
7. Payload format is an Adaptive Card (handled by the adapter); messages render as a styled card in the channel.

### Outlook email (`NOTIFY_PROVIDER=smtp` with Outlook SMTP)
Outlook/Microsoft 365 mailboxes work as plain SMTP, but Microsoft requires an **app password** since they deprecated basic auth.

1. **Enable two-factor authentication** on your Microsoft account (required for app passwords)
   - https://account.microsoft.com/security → **Two-step verification** → **On**
2. **Create an app password**
   - https://account.microsoft.com/security → **Advanced security options** → **App passwords** → **Create a new app password**
   - Label it "Provana Portal" (or similar)
   - Copy the 16-character generated password — you can't view it again
3. Set in `backend/.env`:
   ```
   NOTIFY_PROVIDER=smtp
   SMTP_HOST=smtp.office365.com
   SMTP_PORT=587                                     # STARTTLS, not 465
   SMTP_USER=your.email@outlook.com                  # full email address
   SMTP_PASS=<16-character-app-password>             # NOT your login password
   NOTIFY_FROM=your.email@outlook.com                # must match SMTP_USER's mailbox
   ```
4. **If your organisation blocks SMTP** (some M365 tenants do for security): you'll see `Authentication unsuccessful, SmtpClientAuthentication is disabled for the Tenant`. In that case you need the Graph API route (Phase 9) — contact your M365 admin to enable SMTP AUTH or move to Graph.

### Composite (`NOTIFY_PROVIDER=composite`) — recommended for production
Combines an email channel with a chat channel. Set the SMTP_* vars **AND** either `TEAMS_WEBHOOK_URL` or `SLACK_WEBHOOK_URL`. Either side may be omitted — the missing channel becomes a clean no-op.

**Recommended for your Microsoft setup (Outlook + Teams):**
```
NOTIFY_PROVIDER=composite

# Email via Outlook SMTP
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your.email@outlook.com
SMTP_PASS=<app-password>
NOTIFY_FROM=your.email@outlook.com

# Channel via Teams
TEAMS_WEBHOOK_URL=https://prod-12.westus.logic.azure.com/workflows/...
```

When both `TEAMS_WEBHOOK_URL` and `SLACK_WEBHOOK_URL` are set, Teams wins (with a console warning so the misconfig is visible).

### Best-effort guarantee
Notifications are **fire-and-forget**. If your SMTP provider is down or your webhook is revoked, the adapter logs a `[SmtpNotifier]/[TeamsNotifier]/[SlackNotifier] … (non-fatal):` line and the request submission still succeeds. The user experience never breaks because of a notification failure.

### About Power Automate (Premium)
We deliberately do **not** require Power Automate Premium. The Teams Workflow webhook above is a free Workflow trigger, available to all Microsoft 365 accounts. If you later want Power Automate Premium for richer orchestration (approvals, branching, 1000+ connectors), it slots in as a new `IWorkflowOrchestrator` port — no business logic changes.

### Full Microsoft Graph (`NOTIFY_PROVIDER=microsoft`) — Phase 9, not yet built
Implement `MicrosoftNotifier.ts` using MS Graph: `POST /me/sendMail` for email + Teams Graph endpoints for channel posts. Requires an Entra app registration with `Mail.Send` and `ChannelMessage.Send` application permissions. Bypasses the SMTP-disabled-tenant problem entirely. Not currently a blocker — `composite` with Outlook SMTP + Teams Workflow webhook covers most needs.

## Auth setup (Phase 4)

### Supabase Auth (free MVP)
1. Create a project at https://supabase.com (free tier — no card)
2. Dashboard → Project Settings → API → copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY` (frontend)
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (backend, optional — only needed for admin API)
3. Dashboard → Project Settings → API → **JWT Settings** → copy:
   - **JWT Secret** → `SUPABASE_JWT_SECRET` (backend — required for token verification)
4. Set `AUTH_PROVIDER=supabase` in `backend/.env`
5. Invite users via Dashboard → Authentication → Users → Invite. **Set `app_metadata.client_id`** to the user's tenant UUID when inviting (otherwise the user has no tenant assignment and the backend rejects their requests).
6. For dev only, set `DEMO_FALLBACK_CLIENT_ID=00000000-0000-0000-0000-000000000001` so users without a `client_id` claim still work locally.

### Frontend Supabase Auth
Set in `frontend/.env`:
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
VITE_API_URL=http://localhost:4000
```
The login form (`ViewLogin.tsx`) automatically switches from demo mode to real auth when both env vars are set.

### Switching to Azure SQL (Phase 9)
1. Change `provider = "postgresql"` → `"sqlserver"` in `backend/prisma/schema.prisma`
2. Update `DATABASE_URL` to an Azure SQL connection string
3. Run `npx prisma migrate deploy`
4. No code in `Modules/` changes — the `payload` column maps from Postgres `Text` to SQL Server `nvarchar(max)` automatically because the schema avoids `Json` / `Jsonb` types.
