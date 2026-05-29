# Provana Help Center — Project Guide (CLAUDE.md)

An interactive, multi-view frontend prototype of a **Jira Service Management–style customer Help Center portal**, fully rebranded for **Provana**. Built as a single-page React app (inline JSX via Babel) with state-driven routing across **6 views**. No build step — open the HTML file directly.

> Rebranding note: this is an original, Provana-branded portal. All "Neostella"/"Jira Service Management" branding from the source references has been replaced (e.g. the footer reads "Powered by Provana Service Management").

---

## Brand & Design System

| Token | Value | Usage |
|---|---|---|
| `--purple` | `#4A2E80` | Primary brand color — titles, links, buttons, active states |
| `--purple-700` | `#3c2568` | Button hover |
| `--purple-soft` | `#6d3fb0` | Accent / gradients |
| `--teal` | `#34d6a5` | Accent (avatar, dot-network graphic, brand mark) |
| `--magenta` | `#ec4899` | Accent (dot-network graphic, brand mark) |
| `--ink` / `--ink-2` / `--muted` | `#172b4d` / `#44546f` / `#626f86` | Text hierarchy |
| `--line` / `--line-2` | `#e4e6eb` / `#dfe1e6` | Borders |

- **Font:** Inter (Google Fonts), weights 400–800.
- **Logo:** `assets/provana-logo.png` (purple wordmark + teal→magenta dot-spiral). Used in the nav.
- **Signature graphic:** an animated **teal→magenta dot-network** (`HeroNetwork`) that riffs on Provana's dot-spiral logo. Generated procedurally with a seeded RNG so it's stable. Appears in the hero (View 1) and the slim banner (Views 2/3/5/6).
- **Status badge colors:** blue (`#deebff`/`#0747a6`) for IN REVIEW / CUSTOMER FEEDBACK / IN DEVELOPMENT; green (`#d3f5e4`/`#006644`) for APPROVED / UAT.
- All colors live as CSS custom properties in the `<style>` block of `Provana Help Center.html`.

---

## File Structure

```
Provana Help Center.html      ← main shell: <style> (all CSS), font + React/Babel script tags, view includes
assets/provana-logo.png       ← Provana wordmark (transparent PNG)
app/
  icons.jsx                   ← all SVG icon components (stroke-based, currentColor)
  shared.jsx                  ← ProvanaLogo, Monogram (gold "B"), Avatar, HeroNetwork
  view-portal.jsx             ← VIEW 1 + Breadcrumbs + TopNav (hosts the profile dropdown / VIEW 4)
  view-requests.jsx           ← VIEW 2 + PortalBanner + FormCrumbs
  view-form.jsx               ← VIEW 3 (the New Report form + RTE rich-text editor)
  view-account.jsx            ← VIEW 5 (Profile) + VIEW 6 (Requests table)
  app.jsx                     ← App router + view transitions + ReactDOM mount
screenshots/                  ← scratch captures (not part of the app)
```

### Why split into files
Each `<script type="text/babel">` is transpiled in **global scope**, so top-level `function`/`const` declarations become global. Components are explicitly published via `Object.assign(window, {...})` at the end of each file so later scripts can use them. **Script load order matters** (see bottom of the HTML): `icons → shared → view-portal → view-requests → view-form → view-account → app`.

---

## Views & Routing

Routing is a single `view` string in `App` (`app.jsx`), persisted to `localStorage` under key **`provana_view`**. `go(next)` triggers a brief fade-out, swaps the view, resets scroll, then fades back in.

| `view` value | Component | Description |
|---|---|---|
| `portal` | `ViewPortal` | **VIEW 1** — Help Center: breadcrumb strip, nav, dark hero w/ dot-network + search, 3 portal cards, recent forms row |
| `requests` | `ViewRequests` | **VIEW 2** — "BLG - Power BI Requests" request-type list (7 items, distinct icons) |
| `form` | `ViewForm` | **VIEW 3** — "New Report" request form (13 fields, 2 WYSIWYG editors, dropzone, Send/Cancel) |
| `profile` | `ViewProfile` | **VIEW 5** — Profile page (avatar + Personal details + Language/time zone) |
| `myrequests` | `ViewRequestsList` | **VIEW 6** — Requests data table (8 mock rows, status badges, priority chevrons, live search) |

**VIEW 4** (profile dropdown) is not a route — it's a popover inside `TopNav` (in `view-portal.jsx`), toggled by the "YO" avatar, closes on outside-click.

### Navigation map
- View 1: "BLG - Power BI Requests" card → **View 2**; recent-forms row → **View 2**
- View 2: "New Report" list item → **View 3**
- View 3: Send / Cancel → back to **View 2**
- TopNav avatar → **View 4** dropdown → "Requests" → **View 6**, "Profile" → **View 5**, "Log out" → **View 1**
- TopNav logo & all breadcrumbs ("Provana Customer Portal") → back up the hierarchy
- The avatar dropdown, logo, and search live in the shared `TopNav` and are present on every view.

---

## Key Components & Interactivity

- **`TopNav({ go })`** (`view-portal.jsx`) — clickable logo (→ portal), search button, avatar with profile dropdown. Shared across all views.
- **`HeroNetwork`** (`shared.jsx`) — animated SVG dot constellation; deterministic via seeded RNG; teal→magenta color interpolation.
- **`Monogram`** (`shared.jsx`) — navy circular badge with gold serif "B" (BLG portals).
- **`RTE({ variant })`** (`view-form.jsx`) — contentEditable rich-text editor with a toolbar. `variant="full"` (Goal/Audience fields) vs `variant="alt"` (Additional Notes) show different toolbar buttons. Uses `document.execCommand` for bold/italic/lists.
- **`ViewForm`** — fully controlled form state: behalf-of chip (clearable ×), text inputs, radio group (Yes/No/Unsure/N/A), environment checkboxes, custom Priority & Pages dropdowns, share-with tag, native date picker (text↔date swap), drag-and-drop file dropzone with file list.
- **`ViewRequestsList`** — table data in `REQ_ROWS`; status→color map in `STATUS`; `Priority` component renders single red chevron (High) or stacked double chevron (Highest); the "Request contains…" search live-filters rows by summary/reference.

---

## Conventions

- **Canonical HTML** — explicit closing tags, double-quoted attributes (so the direct editor works).
- **Flex/grid + `gap`** for layout spacing, not inline-flow margins.
- **Icons** are stroke-based React components in `icons.jsx`, sized via `size` prop, colored via `currentColor`.
- **Styles** — one `<style>` block in the HTML using CSS custom properties; no inline styles except dynamic/computed values in `shared.jsx`/`view-account.jsx`.
- **View transitions** — resting state is always `opacity: 1` (never gate visibility on an animation completing, to avoid blank frames when the preview iframe is throttled). Only the `.out` class fades.
- **React/Babel** — pinned versions with integrity hashes in the HTML; do not bump or unpin.
- **Keep files < ~1000 lines**; add new views as their own `app/view-*.jsx` and register on `window`.

---

## How to Run / Edit
- Open `Provana Help Center.html` directly (no build).
- To reset the landing view: clear `localStorage['provana_view']` or set it to `portal`.
- Adding a view: create `app/view-x.jsx`, publish components via `Object.assign(window, …)`, add a `<script>` include (before `app.jsx`), and add a branch in the `App` router in `app.jsx`.
