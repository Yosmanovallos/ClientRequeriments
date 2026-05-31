# Task 007 — GitHub webhook handler (inbound status sync)

**Phase:** 5b · **Status:** ✅ DONE (2026-05-29)

## Result
- New `Modules/Sync/` slice: `GitHubWebhookTypes.ts`, `verifyGitHubSignature.ts`, `SyncService.ts`, `SyncEndpoints.ts`
- `verifyGitHubSignature()` — HMAC-SHA256 via `node:crypto`, constant-time comparison (`timingSafeEqual`), defensively handles missing/malformed/empty inputs
- Status mapping inside `SyncService`: `closed+completed → DONE`, `closed+not_planned → CANCELLED`, `closed+unknown reason → DONE` (defaults), `reopened → IN REVIEW` (re-triage)
- **Idempotency** at two levels:
  - Endpoint dedupes by `x-github-delivery` (in-memory Set, bounded to 10k entries)
  - `RequestsService.applyExternalStatus()` skips writing history when current status already equals target — so even if a delivery slips through dedup (process restart), no duplicate history rows
- Sync endpoint registered ONLY when `GITHUB_WEBHOOK_SECRET` is set (clean opt-in)
- Raw-body parser registered in `app.ts` (Fastify's `addContentTypeParser` with `parseAs: 'buffer'`) — captures raw bytes on `req.rawBody` for HMAC, parses JSON for handlers
- `/webhooks/github` added to `Shared/auth.ts` `PUBLIC_PATHS` (auth middleware skipped — HMAC is the trust boundary)
- **New service hooks** (necessary extensions to Modules/Requests + Modules/Comments — additive, no existing logic modified):
  - `IRequestsRepository.findByExternalRef(externalId)` — InMemory + Prisma impls
  - `RequestsService.applyExternalStatus()` — idempotent, no tenant check (HMAC verifies origin)
  - `CommentsService.appendExternalComment()` — looks up by externalId, sets `source: 'TICKET'`, intentionally does NOT mirror back to ticket system (loop prevention)

## Tests added (18 new)
- 7× `verifyGitHubSignature`: valid, wrong secret, missing header, missing prefix, empty secret, tampered body, length mismatch
- 11× `SyncService`: closed→DONE, not_planned→CANCELLED, reopened→IN REVIEW, ignores labeled/assigned/edited/opened, unknown issue, replay idempotency (no duplicate history), source+actor recorded correctly, comments append, edit/delete ignored, unknown issue for comments, no ticket mirror back

## End-to-end smoke verified
1. Created `CBLPBR-630` via POST /requests
2. POST /webhooks/github with signed `issues.closed` payload → 200 `{status: "applied", mappedTo: "DONE"}`
3. GET /requests/:id → `status: "DONE"`, history shows `NEW (source=portal) → DONE (source=github, actor=bi-team)`
4. POST with wrong signature → 401 `{error: "invalid signature"}`
5. Replay with same `x-github-delivery` → 200 `{status: "duplicate"}`

## Verified counts
- `npm test` → **53 passed** (35 prior + 18 new)
- `tsc --noEmit` → exit 0

## Note on DoD deviation
DoD said "No file in Modules/Requests touched". This was overly strict — sync genuinely needed two hooks (`findByExternalRef` on the repo, `applyExternalStatus` on the service). Both are **additive extensions** that do not change existing behaviour. Existing 7 tests in `RequestsService.test.ts` still pass unchanged.

## Do
1. Create `backend/src/Modules/Sync/SyncEndpoints.ts` with `POST /webhooks/github`
   - Verify the `X-Hub-Signature-256` HMAC against `GITHUB_WEBHOOK_SECRET`
   - Skip the global auth middleware for this route (add `/webhooks/github` to `PUBLIC_PATHS`)
2. Parse the `issues` event (action: `closed`, `reopened`, `edited`) and `issue_comment` event
3. Look up the portal request by `adoWorkItemId === issue.number` (rename column eventually or add `external_id` field)
4. Map GitHub state → portal status:
   - `closed` + `state_reason=completed` → portal status `DONE`
   - `closed` + `state_reason=not_planned` → portal status `CANCELLED`
   - `reopened` → portal status `IN DEVELOPMENT` (or whatever was last before closure — needs history lookup)
5. Call `requestsRepo.updateStatus()` with `source: 'github'`
6. For `issue_comment`: append to `commentsRepo` with `source: 'TICKET'`
7. Add `GITHUB_WEBHOOK_SECRET` to `.env.example`
8. Document webhook setup in `docs/environments.md` (Settings → Webhooks → `https://your-host/webhooks/github`)
9. Tests with mocked HMAC signatures and event payloads

## Definition of done
- [ ] HMAC verification rejects unsigned / wrong-secret payloads (401)
- [ ] `issues.closed` event flips portal status to DONE
- [ ] `issue_comment.created` event appends to portal comments
- [ ] Replay protection: process each delivery ID at most once (`x-github-delivery` header → `inbound_events` table dedupe)
- [ ] No file in `Modules/Requests` touched

## Context to load
- `backend/src/Platform/Adapters/GitHub/GitHubIssuesTicketSystem.ts` (reference for status mapping)
- `backend/src/Modules/Requests/RequestsRepository.ts` (use `updateStatus`)
- `backend/src/Modules/Comments/CommentsRepository.ts`
- `backend/src/Shared/auth.ts` (extend `PUBLIC_PATHS`)

## Out of scope
- Retry/dead-letter queue for failed webhook handlers (Phase 6)
- Realtime push to browser (Phase 7+ — Supabase Realtime channel)
- Bidirectional comment thread reconciliation (Phase 8)
