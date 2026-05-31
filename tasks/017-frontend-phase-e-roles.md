# Task 017 — Phase E: Frontend roles + pending approval + project picker

**Phase:** E · **Status:** 🔲 TODO (backend ready; UI work only)

## Why
Backend Phases A-D are done — 216 tests passing, all endpoints exposed:
- `GET /users/me` → user + role + projectIds
- `GET /projects` → filtered project list
- `GET /projects/:id/forms` → enabled templates for a project
- Role + permission enforcement on every mutation

The frontend doesn't know about any of this yet. The UI assumes everyone is a Client with universal access.

## Do
1. **Extend `AppContext`** with `role`, `projects`, `activeProject` state. Fetch `/users/me` on mount.
2. **`ViewPendingApproval`** — shown when `user.role === null`. Friendly "Waiting for an admin to assign you a role" screen with the user's email + a "log out" button.
3. **`ViewProjectPicker`** — replaces the hardcoded `ViewRequests` 5-card list. Fetches `GET /projects` and renders one card per assigned project. Click → sets `activeProject` → navigates to a project-scoped request menu.
4. **Project-scoped request menu** — once a project is picked, fetch `GET /projects/:id/forms` and render the enabled form templates as cards (Card per template, click → dynamic form view in Phase F).
5. **Role-aware nav**: TopNav avatar dropdown shows "Control Panel" link only when `role` is Admin or SuperAdmin.
6. **Auth context**: when `auth.signIn` succeeds, fetch `/users/me`, set the full user object (including role + projects).
7. **Demo role picker** — when `auth.isConfigured === false`, the login screen shows 5 buttons (SuperAdmin / Admin / Agent / Client / Pending) instead of email+password. Each sets a different demo authUserId so the backend auto-provisions different demo users.

## Definition of done
- [ ] Pending users see `ViewPendingApproval`, can log out, but can't access any other view
- [ ] After role assignment via the API (manual for now), refresh shows the right cards
- [ ] Admin+ sees "Control Panel" link in the avatar dropdown
- [ ] Project Picker shows only projects the user is a member of (or all if SuperAdmin)
- [ ] Frontend `npm run typecheck` passes
- [ ] All 216 backend tests still pass (no backend touches)
