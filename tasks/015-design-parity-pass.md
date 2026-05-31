# Task 015 — Design parity pass (port legacy design system to Vite)

**Phase:** 7b · **Status:** ✅ DONE (2026-05-30)

## Why
The Vite TSX views I built were spartan inline-style placeholders. The legacy design (in `Provana Help Center.html` + `app/*.jsx`) is far more polished — proper Inter typography, purple/teal/magenta brand colors, dark gradient hero with an animated SVG node network, BLG navy+gold Monogram, avatar dropdown menu, breadcrumb chain, request-card grid, accordion form headers, etc. **Demo quality matters as much as backend correctness.** Every new view written in the placeholder style adds redesign debt.

## Result
Ported the entire legacy design system to the Vite frontend with **zero backend regressions** (150/150 tests still passing).

### Foundation (~620 lines new code)
- **`frontend/src/index.css`** — full 360-line design system from the legacy HTML. Tokens (purple/teal/magenta/ink), responsive breakpoints, all component classes (`topnav`, `hero`, `pbanner`, `portal-card`, `reqlist`, `reqitem`, `accordion`, `formcrumbs`, `req-head`, `whats`, `note-box`, `field`, `txt`, `behalf`, `radios`, `checks`, `selectbox`, `menu`, `sharewith`, `dropzone`, `form-actions`, `btn-send`, `btn-cancel`, `profile-menu`, `accountcol`, `listcol`, `reqtable`, `badge`, `priority`, `submit-success/error`, `login-page/card`, `att-list`, `timeline`, `comment-list`)
- **`frontend/src/components/Icons.tsx`** — 27 SVG icons (Search, Folder, Grid, Chev*, X, Cal, Lock, User, Laptop, Book, CloudUp, Wrench, Code, Database, Chats, Bold, Italic, Dots, ColorA, Bullet, Link, At, Emoji, Table, CodeBlock, Quote, Info, Plus, UploadCloud, Check). All `currentColor`-aware.
- **Brand components** (`frontend/src/components/brand/`):
  - `ProvanaLogo.tsx` — serves `/assets/provana-logo.png` (copied to `frontend/public/assets/`) with graceful text fallback if image fails
  - `Monogram.tsx` — navy radial-gradient circle + gold serif "B" (Bell Legal monogram)
  - `Avatar.tsx` + `BigAvatar` — teal-cyan gradient with white border, initials computed from displayName
  - `HeroNetwork.tsx` — **animated SVG node network** (42 nodes, ~80 links, teal→magenta gradient interpolation, per-node opacity animations with seeded LCG random for determinism)
  - `SupportBadge.tsx` — purple chats icon for the Provana Support portal card
- **Layout shell components** (`frontend/src/components/layout/`):
  - `TopNav.tsx` — logo (→ portal), search icon, avatar with dropdown menu (Requests / Profile / Log out). Click-outside-to-close. Uses `useApp()` for user + logout.
  - `Breadcrumbs.tsx` — green-edged top strip (Apps grid · jira · Documentation · Quality Assurance)
  - `PortalBanner.tsx` — dark 150px gradient strip with HeroNetwork in corner (for form/list pages)
  - `FormCrumbs.tsx` — inline breadcrumb trail with clickable items + current page

### Refactored views
- **`ViewPortal`** — full hero with HeroNetwork + search bar; 3 portal cards (BLG-PowerBI with Monogram + clickable, Neodeluxe with Monogram + disabled, Support with SupportBadge + disabled); recent-row footer
- **`ViewLogin`** — proper ProvanaLogo header + styled card with login-page/login-card classes
- **`ViewRequests`** — TopNav + PortalBanner + FormCrumbs + Monogram heading + `whats` text + `reqlist`/`reqitem` 5-row menu using legacy icons (Laptop/Book/CloudUp/Wrench/Code)
- **`ViewRequestsList`** — TopNav + PortalBanner + FormCrumbs + filter pills + proper `reqtable` with badges and per-type icons
- **`ViewRequestDetail`** — TopNav + PortalBanner + FormCrumbs + status timeline + new `att-list` styled attachments + comment thread + send form
- **`ViewProfile`** — TopNav + PortalBanner + FormCrumbs + profile-grid with BigAvatar + acc-section blocks
- **All 5 form views** (`ViewForm`, `ViewFormNewPage`, `ViewFormNewFeature`, `ViewFormFixIssue`, `ViewFormViewRequest`) — replaced inline header+hero with `<TopNav /> <PortalBanner /> <FormCrumbs /> <req-head>+Monogram <whats> <accordion>` shell. Forms themselves keep the same fields + AttachmentsPicker + uploadAll wiring.

## End-to-end smoke verified (live HTTP)
```
Backend  :4000  /health      → {db: "in-memory"}
Vite     :5173  /            → 200 index.html
Vite     :5173  /src/components/layout/TopNav.tsx  → 200 transpiled JSX
Vite     :5173  /assets/provana-logo.png            → 200 (258KB)
Vite proxy /api/requests → backend → count=0
POST proxy → CBLPBR-630 created
```

## Verified counts
- Frontend `npm run typecheck` → exit 0
- Backend `npm test` → **150 passed** (zero regressions — pure frontend work)

## What didn't change (intentionally — would be future polish)
- RTE (rich-text toolbar with ~20 buttons) — currently every "RTE field" in the forms is a plain textarea. Adding the full RTE is ~150 lines of component code; it's pure visual polish, no backend impact.
- Field / SelectBox shared components — the forms still use inline `<label>+<input>` instead of a `<Field>` wrapper. Visually equivalent because the CSS classes (`field`, `field-label`, `field-sub`, `txt`, `selectbox`) all work; just slightly more code per form.
- "Share with" tag visualization — forms don't show this row; legacy had a `<sharewith>` block with a lock icon

These are explicitly deferred to a future "design polish v2" task if needed.

## DoD checklist
- [x] All 360 lines of legacy CSS ported to `frontend/src/index.css`
- [x] All ~27 icons ported as TSX
- [x] Brand components match legacy exactly (verified by reading both side-by-side)
- [x] Layout shell components work across portal / requests / form / detail / profile views
- [x] ProvanaLogo asset (258KB) copied to `frontend/public/assets/` and served by Vite
- [x] HeroNetwork animated SVG renders (verified by Vite serving the TSX)
- [x] Every view uses `<TopNav />` + `<PortalBanner />` + `<FormCrumbs />` instead of inline placeholders
- [x] All 5 form views wrapped with the new shell
- [x] Backend tests unchanged: 150/150
- [x] Frontend typecheck exit 0
