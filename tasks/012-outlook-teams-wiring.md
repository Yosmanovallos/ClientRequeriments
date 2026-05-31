# Task 012 — Outlook + Teams wiring (no Power Automate Premium)

**Phase:** 6b · **Status:** ✅ DONE (2026-05-30)

## Result

### Code
- **`TeamsNotifier.ts`** (`Adapters/Teams/`) — POSTs an **Adaptive Card** envelope to a Teams **Workflow** webhook ("Post to a channel when a webhook request is received" template). Uses native fetch, no SDK. Same best-effort guarantee as SlackNotifier — every transport error logged and swallowed.
- **`AdapterRegistration::buildNotifier()`** extended:
  - New `'teams'` case → `TeamsNotifier` only (channel-only, email no-op)
  - `'composite'` case updated: now picks **Teams over Slack** when both `TEAMS_WEBHOOK_URL` and `SLACK_WEBHOOK_URL` are set (with a console warning so the misconfig is visible)
  - `'microsoft'` case still stubbed but error message now points users at `composite` as the immediate workaround
- New helper `buildTeamsFromEnv()` mirrors the SMTP/Slack helpers
- `.env.example` — `NOTIFY_PROVIDER` options now include `teams`; SMTP block annotated with Outlook-specific values (`smtp.office365.com:587`, app password requirement); `TEAMS_WEBHOOK_URL` moved next to Slack with priority note

### Tests
- 8 new tests in `TeamsNotifier.test.ts`:
  - Constructor validation (missing URL)
  - POST shape: top-level `message` envelope + `vnd.microsoft.card.adaptive` attachment + `AdaptiveCard 1.4` + TextBlock body
  - Empty message no-op
  - **Best-effort failure modes** (3 explicit tests): 4xx response, network reject, 5xx outage — none throw
  - Adaptive Card preserves special characters (`<script>`, `&`, `"`, newlines) via JSON.stringify
  - `sendEmail` no-op

### Docs (`docs/environments.md`)
Three new walkthroughs replace the old "Slack-only" example:
1. **Teams-only setup** — exact click path: channel `⋯` → Workflows → template name → copy URL
2. **Outlook SMTP setup** — explicit 2FA + app password steps, the `smtp.office365.com:587` correct values, the "SmtpClientAuthentication is disabled for the Tenant" error pointer for blocked tenants
3. **Composite for Microsoft stack** — recommended config combining both (full `.env` block ready to copy)

Explicit note that **Power Automate Premium is NOT required** for any of this; the Teams Workflow webhook is a free template available to all M365 accounts.

## End-to-end smoke verified (live HTTP)
Booted backend with `NOTIFY_PROVIDER=composite + Outlook SMTP + Teams webhook URL`, mocked nodemailer and fetch. Single POST `/requests`:
- **Outlook**: `nodemailer.sendMail({from: demo@outlook.com, to: yosman.ovallos@provana.com, subject: "Request CBLPBR-630 received — BC Missing on dual-rep page"})`
- **Teams**: `POST` to Workflow URL with full Adaptive Card payload — envelope type `message`, attachment `application/vnd.microsoft.card.adaptive`, card version `1.4`, message text `📋 New request CBLPBR-630: "BC Missing on dual-rep page" [High] → ...`

## Verified counts
- `npm test` → **102 passed** (94 prior + 8 new TeamsNotifier)
- `tsc --noEmit` → exit 0

## What the user can do today (no more code)
1. Get an Outlook **app password** (Account → Security → App passwords; requires 2FA on)
2. Create a Teams **Workflow webhook** in the BI channel (`⋯` → Workflows → "Post to a channel when a webhook request is received")
3. Set `.env`:
   ```
   NOTIFY_PROVIDER=composite
   SMTP_HOST=smtp.office365.com
   SMTP_PORT=587
   SMTP_USER=<their email>
   SMTP_PASS=<app password>
   NOTIFY_FROM=<same email>
   TEAMS_WEBHOOK_URL=<copied URL>
   ```
4. Restart the backend → next request submission emails Outlook + posts to Teams.

## Out of scope (deferred)
- Full Microsoft Graph adapter (`NOTIFY_PROVIDER=microsoft`) — needs Entra app registration; only useful if their tenant disables SMTP AUTH. Phase 9.
- Power Automate Premium orchestrator (`IWorkflowOrchestrator` port) — not needed at current volume.