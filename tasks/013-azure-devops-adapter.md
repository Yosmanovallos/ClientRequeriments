# Task 013 — AzureDevOpsTicketSystem adapter

**Phase:** 5c · **Status:** ✅ DONE (2026-05-30)

## Result
- **`AzureDevOpsTicketSystem.ts`** (`Adapters/Azure/`) — REST adapter via native fetch + JSON Patch + Basic Auth (`base64(':'+PAT)`). All ADO-specific knowledge encapsulated; no SDK
- `create()` → `POST /workitems/${workItemType}` with `application/json-patch+json` (Title + Description + Tags)
- `updateStatus()` → `PATCH /workitems/{id}` with State (+ Reason when applicable). Unknown statuses warn + skip rather than corrupt ADO state machine
- `addComment()` → `POST /workitems/{id}/comments` (api-version=7.1-preview.3) with plain JSON `{text}`
- Default state map for Agile process (`DEFAULT_STATE_MAP_AGILE` exported). DONE→Closed+Fixed, CANCELLED→Removed+Abandoned, etc. Overrideable via `ADO_STATE_MAP_JSON` env or constructor `stateMap` arg
- Configurable work item type (`ADO_WORK_ITEM_TYPE` — default `Task`). On-prem ADO Server supported via `ADO_API_URL`
- URL encoding for org/project/work item type — `My Org` / `User Story` etc. all correct
- `AdapterRegistration::buildTickets()`'s `azuredevops` case wired with full env validation
- `.env.example` updated with PAT URL + work item type + state map override examples
- `docs/environments.md` got step-by-step PAT creation + status mapping table + Scrum override example + search-by-tag tip

## Tests added (20 new)
Constructor validation (org/project/PAT). POST create: JSON Patch shape, Basic Auth header, work item type URL-encoding override, fallback URL when `_links.html` absent, error message propagation, priority-tag omission when not provided. PATCH updateStatus: non-terminal/state only, DONE/Closed+Fixed, CANCELLED/Removed+Abandoned, Scrum override, unknown status warn-and-skip (no API call), 404 throws. Regression guard: every portal status has a default mapping. POST addComment: URL + plain JSON Content-Type, 401 throws. apiUrl override for on-prem. URL-encoding for org/project with spaces.

## End-to-end smoke verified (live HTTP, mocked fetch)
Booted backend with `TICKETS_PROVIDER=azuredevops` + placeholder creds. Single POST `/requests`:
```
Backend HTTP 201 → reference CBLPBR-630
ADO API calls intercepted: 1
  POST  /acme/BLG-Reports/_apis/wit/workitems/$Task?api-version=7.1
    Content-Type: application/json-patch+json
    add /fields/System.Title       = "[CBLPBR-630] CLJ Task Productivity"
    add /fields/System.Description = "**Reference:** CBLPBR-630\n**Type:** new_report\n…"
    add /fields/System.Tags        = "CBLPBR-630; new_report; priority:high"
```

## Verified counts
- `npm test` → **122 passed** (102 prior + 20 ADO tests)
- `tsc --noEmit` → exit 0

## What the user does to flip the switch
1. PAT with **Work Items: Read, write, & manage** at `https://dev.azure.com/<org>/_usersSettings/tokens`
2. `backend/.env`:
   ```
   TICKETS_PROVIDER=azuredevops
   ADO_ORG=<your-org>
   ADO_PROJECT=<your-project>
   ADO_PAT=<the token>
   ADO_WORK_ITEM_TYPE=Task            # or User Story, Bug, etc.
   ```
3. Restart backend → next request creates a real ADO work item
4. (Optional) Override status mapping for non-Agile projects via `ADO_STATE_MAP_JSON` — see `docs/environments.md`

## Original spec below

## Do
1. Use the `add-adapter` skill with port=`ITicketSystem`, provider=`AzureDevOps`
2. Implement `backend/src/Platform/Adapters/Azure/AzureDevOpsTicketSystem.ts`
   - Constructor: `{ org, project, pat, workItemType?, stateMap? }`
   - Auth: Basic Auth header — `Authorization: Basic base64(':' + PAT)`
   - `create()` → `POST https://dev.azure.com/{org}/{project}/_apis/wit/workitems/${workItemType}?api-version=7.1` with **JSON Patch** body (`[{op:'add',path:'/fields/System.Title',value:...}]`)
   - `updateStatus()` → `PATCH workitems/{id}` with JSON Patch ops for `System.State` (mapped from portal status via config) and `System.Reason` when needed
   - `addComment()` → `POST workitems/{id}/comments?api-version=7.1-preview.3`
   - Embed `requestReference` (e.g. CBLPBR-630) in the title prefix AND as a tag for searchability
3. Native fetch, no SDK (same approach as GitHub adapter)
4. Wire `azuredevops` case in `AdapterRegistration::buildTickets()` — validate `ADO_ORG + ADO_PROJECT + ADO_PAT`
5. Add `ADO_WORK_ITEM_TYPE` (default `Task`) and `ADO_STATE_MAP_JSON` (optional override) to `.env.example`
6. Default state mapping (Agile process; override via env JSON for other processes):
   - NEW, IN REVIEW, APPROVED → `New`
   - IN DEVELOPMENT → `Active`
   - UAT, CUSTOMER FEEDBACK → `Resolved`
   - DONE → `Closed`
   - CANCELLED → `Removed` (+ `System.Reason: Abandoned`)
   - ON HOLD → `New` + tag `on-hold`
7. Tests with mocked fetch:
   - Auth header (Basic + base64 PAT)
   - JSON Patch body shape for create
   - State mapping for each portal status
   - 4xx → throws with ADO error message
   - apiUrl override (for self-hosted Azure DevOps Server / on-prem)
8. Live smoke test against real ADO if user provides creds:
   - POST `/requests` → 201
   - Verify work item exists in `https://dev.azure.com/{org}/{project}/_workitems/edit/{id}`
   - Set status to `DONE` via portal → verify work item closes

## Definition of done
- [ ] `npm test` passes (102 prior + ~12 new tests)
- [ ] Backend boots with `TICKETS_PROVIDER=azuredevops` + env vars set
- [ ] POST /requests creates a real ADO work item (live smoke with user's PAT)
- [ ] Status changes flow through correctly (state + reason fields)
- [ ] No file in `Modules/` touched

## What the user needs to provide
1. **ADO org URL** — `https://dev.azure.com/<org>` (or for older orgs: `https://<org>.visualstudio.com`)
2. **Project name** — exact case-sensitive name (e.g. `BLG-Reports`)
3. **Personal Access Token** with scopes:
   - **Work Items**: Read, write, & manage
   - Create at: `https://dev.azure.com/<org>/_usersSettings/tokens`
4. **Work item type** — default `Task`; could be `User Story`, `Bug`, `Issue` depending on project process template
5. **Project process template** — Agile, Scrum, Basic, or CMMI — determines the valid `System.State` values
6. (Optional) **State mapping override** — if your team renamed states or uses a custom workflow

## Context to load
- `backend/src/Platform/Ports/ITicketSystem.ts`
- `backend/src/Platform/Adapters/GitHub/GitHubIssuesTicketSystem.ts` (reference impl — same shape)
- `backend/src/Platform/Adapters/Local/LocalTicketSystem.ts`
- `backend/src/Platform/AdapterRegistration.ts` (`buildTickets`)

## Out of scope (split into future tasks)
- ADO Service Hooks (inbound webhooks for status sync back to portal) — Task 014 / Phase 5d
- Linking attachments to ADO work items — Phase 9
- Custom fields (`Custom.PortalRequestId` etc.) — requires user to add the fields to their ADO project first
