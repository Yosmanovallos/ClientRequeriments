# Task 014 — Azure DevOps Service Hooks webhook (inbound status sync)

**Phase:** 5d · **Status:** ✅ DONE (2026-05-30)

## Result
- New `Modules/Sync/AzureDevOpsWebhookTypes.ts` — type defs for `workitem.updated` and `workitem.commented` payloads (accepts both `resource.workItemId` and `resource.id` field aliases ADO has used across versions; accepts `System.History` as either plain string OR diff envelope `{newValue}`)
- New `Modules/Sync/verifyBasicAuth.ts` — pure HTTP Basic Auth verifier using `node:crypto` `timingSafeEqual` (constant-time). Defensively handles missing/malformed headers, base64 with no colon, empty configured creds. Handles passwords containing colons correctly.
- `SyncService` extended with `handleAdoWorkItemUpdated` and `handleAdoWorkItemCommented`:
  - Reverse state map (ADO → portal) covering Agile, Scrum, and Basic process templates
  - `New → IN REVIEW`, `Active → IN DEVELOPMENT`, `Resolved → UAT`, `Closed → DONE`, `Removed → CANCELLED`
  - Unknown ADO states silently ignored (don't pollute portal status with custom-process noise)
  - Idempotency: reuses `applyExternalStatus` (no-op when already at target)
  - Comment author: `revisedBy.uniqueName` → `displayName` → `'Azure DevOps'` fallback
- `SyncEndpoints` refactored:
  - Renamed `registerSyncEndpoints` → `registerGitHubWebhook` (with deprecated shim for backward compat)
  - Added `registerAzureDevOpsWebhook` — Basic Auth verify, dispatch by `payload.eventType`, reuses the existing `processedDeliveries` Set for dedup (UUIDs can't collide with GitHub's UUIDs)
  - On 401: returns `WWW-Authenticate: Basic realm="azuredevops-webhook"` header (proper Basic Auth challenge)
- `app.ts` now registers EACH webhook independently — GitHub when `GITHUB_WEBHOOK_SECRET` set, ADO when both `ADO_WEBHOOK_USER` and `ADO_WEBHOOK_PASS` set. Can run with neither, either, or both. Log message reports which routes registered.
- `Shared/auth.ts` `PUBLIC_PATHS` extended with `/webhooks/azuredevops`
- `.env.example` — `ADO_WEBHOOK_USER` + `ADO_WEBHOOK_PASS` added
- `docs/environments.md` — full ADO Service Hooks setup walkthrough (8 steps from picking creds → creating subscription → testing) + reverse state mapping table

## Tests added (28 new)
- **10× verifyBasicAuth**: correct/wrong/missing/empty creds, wrong scheme (Bearer/Digest), invalid base64, no colon, passwords with colons, constant-time-no-throw on length mismatch
- **11× ADO workitem.updated**: Active→IN DEVELOPMENT, Closed→DONE, Removed→CANCELLED, Scrum (Committed, Done), Basic (Doing), no state change, unknown state, unknown workitem, missing workitem id, `resource.id` alias, source+actor recorded, replay idempotency
- **7× ADO workitem.commented**: plain-string history, diff-envelope history, missing history, unknown workitem, anonymous author fallback, no loop-back to ADO ticket system

## End-to-end smoke verified (live HTTP, 9 cases)
```
1. Created CBLPBR-630 (id=2d0c702b…)
2. External ticket id = LOCAL-0001
3. POST /webhooks/azuredevops (Active) → 200 {mappedTo: "IN DEVELOPMENT"}
4. Portal status: IN DEVELOPMENT; history: NEW (portal) → IN DEVELOPMENT (azuredevops, biteam@acme.com)
5. Close event (Closed)         → 200 {mappedTo: "DONE"}
6. Comment event                → 200 {applied}
7. Comments: 1 ("Verified and closed — fix deployed to UAT", author=BI Engineer, source=TICKET)
8. Wrong Basic Auth creds       → 401 {error: "invalid credentials"}
9. Replay (same delivery id)    → 200 {status: "duplicate"}
```

## Verified counts
- `npm test` → **150 passed** (122 prior + 28 new)
- `tsc --noEmit` → exit 0

## DoD checklist
- [x] Basic Auth rejects wrong creds (401 with `WWW-Authenticate` header)
- [x] `workitem.updated` with state change flips portal status (history `source='azuredevops'`)
- [x] `workitem.commented` appends to portal comments
- [x] Idempotent on replay (same delivery `id` → 200 duplicate)
- [x] No file in `Modules/Requests` or `Modules/Comments` touched (uses existing `applyExternalStatus` + `appendExternalComment`)

## Original spec below

## Do
1. Extend `Modules/Sync/` with ADO event handling — same shape as the GitHub webhook (Phase 5b)
2. Add `POST /webhooks/azuredevops` endpoint (PUBLIC_PATHS list updated)
3. ADO Service Hooks **does NOT use HMAC** — instead it supports HTTP **Basic Auth** on the webhook (set on the subscription) OR a query-string token. Pick basic auth:
   - User configures subscription with `username:password`
   - We verify `Authorization: Basic …` header against `ADO_WEBHOOK_USER` + `ADO_WEBHOOK_PASS` env
4. Parse the **eventType** field from payload — we care about:
   - `workitem.updated` → if `fields.System.State` changed, map ADO state → portal status (reverse of our outbound map) → `requestsSvc.applyExternalStatus()`
   - `workitem.commented` → `commentsSvc.appendExternalComment()`
   - `workitem.created` (ignored — we created it, no need to mirror back)
5. Dedup by `id` (ADO sends a UUID per delivery) — reuse the same in-memory Set pattern as GitHub
6. Build a **reverse state map**: ADO state → portal status. Same shape as outbound but inverted, with sensible defaults (e.g. `Active` → `IN DEVELOPMENT`).
7. Tests: Basic Auth verification (valid + invalid + missing), workitem.updated state translation, workitem.commented appends, replay protection, unknown eventType silently 200s
8. `docs/environments.md`: walkthrough for adding a Service Hook subscription in ADO (Project Settings → Service hooks → Web Hooks)

## Definition of done
- [ ] Basic Auth rejects wrong creds (401)
- [ ] ADO `workitem.updated` with state change flips portal status (and writes history with `source: 'azuredevops'`)
- [ ] ADO `workitem.commented` appends to portal comments
- [ ] Idempotent on replay (same delivery `id` processed once)
- [ ] No file in `Modules/Requests` or `Modules/Comments` touched (use existing `applyExternalStatus` + `appendExternalComment`)

## Context to load
- `backend/src/Modules/Sync/SyncEndpoints.ts` (GitHub webhook — reference for structure)
- `backend/src/Modules/Sync/SyncService.ts`
- `backend/src/Platform/Adapters/Azure/AzureDevOpsTicketSystem.ts` (for the outbound state map — invert it)
- `backend/src/Shared/auth.ts` (PUBLIC_PATHS list)

## Out of scope
- Mirroring portal-side comments back to ADO (already done by `CommentsService.add` when adoWorkItemId is present)
- Custom field sync (deferred; needs ADO project to have custom fields configured)
- Migrating in-memory dedup to a DB table (Phase 6/9)
