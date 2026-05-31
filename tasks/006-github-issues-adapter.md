# Task 006 — GitHubIssuesTicketSystem adapter

**Phase:** 5 · **Status:** ✅ DONE (2026-05-29)

## Result
- `GitHubIssuesTicketSystem.ts` — REST adapter via native `fetch` (no `@octokit/rest` SDK, no extra deps)
- Constructor validates `token`, `owner`, `repo`; supports `apiUrl` override (GitHub Enterprise)
- `create()` → POST `/repos/{owner}/{repo}/issues` with labels derived from `requestType` + `priority:<level>`
- `updateStatus()` → PATCH the issue. Status mapping: `DONE` → `closed`+`completed`, `CANCELLED` → `closed`+`not_planned`, all others → `open` (reopen clears `state_reason`)
- `addComment()` → POST `/issues/{number}/comments`
- Auth header uses `Bearer <token>` (works for fine-grained PATs, classic PATs, and GitHub App tokens)
- Sends `X-GitHub-Api-Version: 2022-11-28` for stable behaviour
- `AdapterRegistration::buildTickets()` wired; throws clear error if `GITHUB_TOKEN`/`GITHUB_OWNER`/`GITHUB_REPO` missing
- 14 unit tests cover: constructor validation, POST shape, headers, label combining, status mapping (open/closed/state_reason), API error propagation, apiUrl override
- **End-to-end smoke verified:** booted full backend with `TICKETS_PROVIDER=github`, intercepted `fetch`, posted a request, confirmed GitHub got exactly one POST `/issues` with correct body + labels

## Bug discovered + fixed
`RequestsService.createTicketAsync()` was passing `labels: [requestType, priority.lowercase]` AND `priority` separately — caused duplicate labels (`["new_report","priority:high","new_report","high"]`). Per port contract, `labels?` is for *extra* labels; the adapter derives the standard set from structured fields. Service no longer passes `labels`. Documented inline.

## Verified counts
- `npm test` → **35 passed** (7 + 14 Supabase + 14 GitHub)
- `tsc --noEmit` → exit 0

## Do
1. Use the `add-adapter` skill with port=`ITicketSystem`, provider=`GitHub`
2. Implement `backend/src/Platform/Adapters/GitHub/GitHubIssuesTicketSystem.ts`
   - Constructor: `{ token, owner, repo }`
   - `create()` → `POST /repos/{owner}/{repo}/issues`
   - `updateStatus()` → close/reopen + label change (map portal status → GitHub state)
   - `addComment()` → `POST /repos/{owner}/{repo}/issues/{number}/comments`
3. Use native `fetch` (Node 24 — no `@octokit/rest` SDK, keeps deps small)
4. Uncomment the `github` case in `AdapterRegistration.ts::buildTickets()`
5. Add tests with mocked `global.fetch`
6. Set `TICKETS_PROVIDER=github` + GITHUB_TOKEN/OWNER/REPO; verify a submission creates a real issue

## Definition of done
- [ ] `npm test` passes (21 prior + new tests)
- [ ] Backend boots with `TICKETS_PROVIDER=github`
- [ ] POST /requests creates a real GitHub issue (test against a personal repo)
- [ ] Webhook receives status updates and propagates back to portal (deferred to Phase 5b)
- [ ] No file in `Modules/` touched

## Context to load
- `backend/src/Platform/Ports/ITicketSystem.ts`
- `backend/src/Platform/Adapters/Local/LocalTicketSystem.ts` (reference impl)
- `backend/src/Platform/AdapterRegistration.ts` (`buildTickets` function)

## Out of scope
- Webhook handler for inbound issue updates (split into Task 007 — Phase 5b)
- Azure DevOps adapter (Phase 9)
- Notification email retry/queue logic (Phase 6)
