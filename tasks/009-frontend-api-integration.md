# Task 009 — Frontend API integration

**Phase:** 7 · **Status:** ✅ DONE (2026-05-29)

## Result
- All 4 stub form views migrated to real TSX (`ViewFormNewPage`, `ViewFormNewFeature`, `ViewFormFixIssue`, `ViewFormViewRequest`) — each calls `requestsApi.create()` with its own `requestType` and field-specific payload
- Submission flow: validate → POST `/api/requests` → render success/error → redirect to `myrequests` on success
- Installed `@supabase/supabase-js` in frontend (Vite needs it to resolve the dynamic import in `auth/index.ts` — only loaded at runtime when `VITE_SUPABASE_URL` is set)

## Verified end-to-end (live stack)
Backend on :4000 (Local adapters) + Vite on :5173:
- `GET http://localhost:5173/` → 200 OK with index.html
- `GET http://localhost:5173/src/main.tsx` → 200 OK with transpiled JSX
- `GET http://localhost:5173/api/health` → proxied to :4000 → `{status:"ok", db:"in-memory"}`
- `GET http://localhost:5173/api/requests` → proxied to :4000 → `count=5`

POST one request per `requestType`:
```
CBLPBR-630  new_report    "Q2 Productivity Dashboard"   [NEW]
CBLPBR-631  new_page      "Productivity — Outliers"     [NEW]
CBLPBR-632  new_feature   "Add drilldown to phase"      [NEW]
CBLPBR-633  fix_issue     "BC Missing: Outreach …"      [NEW]
CBLPBR-634  view_request  "vw_dual_rep_filtered"        [NEW]
```

## Verified counts
- `npm run typecheck` (frontend) → exit 0
- `npm test` (backend) → **72 passed** (unchanged — pure frontend changes)

## Original spec below

## Do
1. Migrate remaining form views from `app/*.jsx` (Babel-standalone legacy) to `frontend/src/views/` proper TSX:
   - `ViewFormNewPage.tsx` (currently re-exports ViewForm)
   - `ViewFormNewFeature.tsx`
   - `ViewFormFixIssue.tsx`
   - `ViewFormViewRequest.tsx`
2. Each form view calls `requestsApi.create({ requestType: '<x>', title, priority, dueDate, payload: {…} })` from `frontend/src/api/requests.ts`
3. Update `ViewRequests.tsx` to display dynamic counts from `requestsApi.list()` (currently uses static REQUEST_TYPES array)
4. Verify the full happy path in a browser:
   - Backend running on :4000 with `AUTH_PROVIDER=local` (or supabase if configured)
   - Frontend on :5173 (`npm run dev` in frontend/) — proxies `/api` to :4000
   - Login → Portal → BI Requests → New Report → fill form → Submit → see reference → land on My Requests list
5. Ensure error states surface: 400 validation errors, 401 unauthorized, 500 server errors all rendered in the form `submitMsg` div
6. Document any frontend-specific env vars in `docs/environments.md`

## Definition of done
- [ ] All 5 form views POST to real backend (no mock `db.*` calls remain)
- [ ] My Requests list pulls from `GET /requests`
- [ ] Request Detail view pulls from `GET /requests/:id` + `GET /requests/:id/comments`
- [ ] Comment submission via `POST /requests/:id/comments`
- [ ] Backend test count unchanged (72)
- [ ] `frontend && npm run typecheck` passes

## Context to load
- `frontend/src/api/requests.ts` (typed API client — already exists)
- `frontend/src/views/ViewForm.tsx` (reference impl for New Report)
- `frontend/src/views/ViewFormNewPage.tsx` and the other 3 stubs
- `app/view-form-newpage.jsx` etc. as REFERENCE only (don't modify the legacy files)

## Out of scope
- Realtime updates to the request list (Phase 8)
- File upload via attachments (Phase 8 — needs IFileStorage wired)
- Removing the legacy `app/*.jsx` files (keep until QA round)
