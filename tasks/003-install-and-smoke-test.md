# Task 003 — Install deps and smoke-test backend in local mode

**Phase:** 2 · **Status:** ✅ DONE (2026-05-29)

## Result
- `npm install` succeeded in both backend/ and frontend/
- Backend starts cleanly on :4000 (Pino logger working after pino-pretty install)
- POST /requests → 201 with `reference: "CBLPBR-630"` (auto-incrementing per client)
- GET /requests → 200 with full list
- GET /health → 200 `{ status: "ok" }`
- LocalTicketSystem logged `LOCAL-0001` issue creation
- LocalNotifier logged EMAIL + CHANNEL messages
- Frontend TypeScript compiles clean (`tsc --noEmit` exit 0)

## Do
1. `cd backend && npm install`
2. `cd frontend && npm install`
3. Start backend in local mode: `cd backend && AUTH_PROVIDER=local TICKETS_PROVIDER=local NOTIFY_PROVIDER=local npm run dev`
4. Smoke-test: `curl -s -X POST http://localhost:4000/requests -H "Authorization: Bearer demo" -H "Content-Type: application/json" -d '{"requestType":"new_report","title":"Test Report","priority":"Medium","payload":{}}'`
5. Verify: response includes `reference: "CBLPBR-630"` (or next seq), status `201`
6. `curl -s http://localhost:4000/requests -H "Authorization: Bearer demo"` — verify list returns the request
7. `curl -s http://localhost:4000/health` — verify `{ status: "ok" }`
8. Start frontend: `cd frontend && VITE_API_URL=http://localhost:4000 npm run dev`
9. Open http://localhost:5173 — verify login page renders, demo sign-in works, requests list loads

## Definition of done
- [ ] Backend starts without TypeScript errors
- [ ] POST /requests → 201 with CBLPBR-### reference
- [ ] GET /requests → returns the request
- [ ] Frontend loads at :5173 with no console errors
- [ ] Demo login → requests list → submit form → reference shown

## Context to load
- `backend/src/app.ts`
- `backend/src/Platform/AdapterRegistration.ts`
- `backend/src/Modules/Requests/RequestsEndpoints.ts`

## Out of scope
- Real DB connection (Phase 3)
- Real auth/tickets/notifications (Phase 4–6)
