# Enhanced Comments System — Design Spec

**Status:** Ready for review — not yet implemented  
**Proposed phase:** 8d (ships before Phase 9 / Microsoft migration)  
**Estimated tasks:** 3 task files (020-a backend, 020-b frontend, 020-c security + polish)

---

## 1. Current Architecture Analysis

### What exists today

| Layer | Current state |
|-------|--------------|
| DB model | `Comment { id, requestId, body: Text, author: VarChar(128), visibility, source, createdAt }` |
| Backend | `GET/POST /requests/:id/comments` — plain-text `body`, max 10 000 chars |
| Frontend | `<textarea>` form; renders `c.body` as raw text inside `<div className="comment-body">` |
| Attachments | Separate module (`POST/GET/DELETE /requests/:id/attachments`); already abstracted behind `IFileStorage` |
| Auth | `req.user.displayName` captured from token; stored as free-form `author` string |
| Ticket sync | `CommentsService.add()` mirrors body verbatim to GitHub/Azure on write |

### What is missing

- Timestamps displayed to the user (field exists: `createdAt`, never shown in UI)
- Rich-text formatting (bold, lists, links, headings, tables, code blocks, blockquotes)
- Inline image rendering + click-to-expand lightbox
- Comment-scoped file attachments (PDFs, DOCX, etc.)
- Trustworthy author attribution (`author` is a mutable free-form string, no FK)
- XSS protection on stored HTML (body is printed verbatim — safe today only because `body` is text, not HTML)
- MIME-type and magic-byte validation for uploads
- HTML→Markdown transformation before ticket-system sync

---

## 2. Key Design Decisions

### 2.1 Rich-text storage format: **HTML**

The `body` column stores sanitized HTML (e.g., `<p>Hello <strong>world</strong></p>`).

**Why not JSON (TipTap/ProseMirror JSON)?**  
JSON is structure-preserving and intrinsically XSS-safe, but the ticket-system sync (`ITicketSystem.addComment`) expects Markdown. Converting JSON→Markdown requires a round-trip through the editor library at sync time. HTML→Markdown (via `turndown`) is a well-trodden, library-level operation. Keeping HTML also means server-side sanitization is trivially composable with standard `sanitize-html` allowlists.

**Security boundary:** sanitize on **server write**, not client. Client-side sanitization is UX only.

### 2.2 Inline image URLs: **backend proxy**

Stored signed URLs from Supabase expire in ≤1 hour. Embedding a signed URL inside the saved HTML body means the HTML rots.

**Solution:** store `<img src="/api/comment-files/{storageKey}">` in the body. The backend proxy endpoint:
- Verifies the caller's JWT and `clientId`
- Resolves the storage key to a fresh signed URL (or streams directly)
- Returns `302 Found` to the signed URL (or proxies the bytes)

This maintains tenant isolation, avoids URL expiry in stored HTML, and works across storage providers.

**Rejected alternatives:**
- Re-fetch and rewrite image URLs on every list call — complex, expensive
- Public-with-unguessable-key — breaks tenant isolation

### 2.3 Ticket-system sync transformation

When a portal comment is mirrored to GitHub Issues or Azure DevOps (both accept Markdown), `CommentsService.add()` calls `turndown` to convert the sanitized HTML body to Markdown before calling `ITicketSystem.addComment`.

For inline images (`<img>` tags) in the mirrored comment, replace with `[image attached in portal]` — GitHub Issues comments do not support programmatic attachment uploads via API.

### 2.4 Attachments: extend existing module, don't duplicate

The existing `Attachment` model (and `IFileStorage` port) handles request-scoped uploads. We add an optional `commentId` FK so attachments can be optionally scoped to a comment.

```
Attachment {
  ...existing fields...
  commentId  String? @map("comment_id") @db.Uuid   ← NEW (nullable)
}
```

A new endpoint `POST /requests/:id/comments/:cid/attachments` uploads directly against the comment. The storage key gains a `comments/{commentId}/` path segment.

The existing `GET /requests/:id/attachments` endpoint continues to return all request attachments (both request-scoped and comment-scoped), but adds a `commentId` field in the response so the UI can group them correctly.

### 2.5 Author attribution: add `authorUserId` FK

Add `authorUserId String? @db.Uuid` to `Comment`. Populated from `req.user.userId` on portal writes. `author` string field is kept as the denormalized display-name fallback (needed for `source='TICKET'` comments that originate externally and have no portal user).

### 2.6 Legacy plain-text bodies

Existing comments stored before this feature are plain text. On render, the frontend detects whether a body starts with `<` (HTML) or not. Plain-text bodies are escaped and wrapped in `<p>` before display. No database migration needed.

### 2.7 Comment mutability

**Open question for the client before implementation:**

> The requirements mention "comment versioning." Does this mean:
> - (A) Comments are **immutable** — no edit, versioning was speculative — or
> - (B) Users can **edit** their comments, and a version history must be kept?
>
> Option B requires an `updatedAt` column and an audit table (`comment_versions`), which is substantial schema work. Option A is the default unless explicitly requested.

**This spec assumes Option A (immutable comments) until confirmed otherwise.**

---

## 3. Required Backend Changes

### 3.1 New dependencies

```json
// backend/package.json
"sanitize-html": "^2.x",         // server-side HTML sanitization
"@types/sanitize-html": "^2.x",
"turndown": "^7.x",              // HTML → Markdown for ticket sync
"@types/turndown": "^5.x",
"file-type": "^19.x"             // magic-byte MIME sniffing (ESM-only, needs dynamic import)
```

### 3.2 New port: `ISanitizer`

```
backend/src/Platform/Ports/ISanitizer.ts
backend/src/Platform/Adapters/SanitizeHtml/SanitizeHtmlSanitizer.ts
```

```typescript
export interface ISanitizer {
  sanitize(html: string): string;
}
```

Allowlist for `SanitizeHtmlSanitizer`:
- Tags: `p`, `br`, `strong`, `em`, `u`, `s`, `ul`, `ol`, `li`, `h1`–`h4`, `a`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `blockquote`, `pre`, `code`, `img`
- Attributes on `a`: `href` (must be `http://` or `https://`; no `javascript:`)
- Attributes on `img`: `src` (must start with `/api/comment-files/`; blocks data URIs and external hotlinks), `alt`, `width`, `height`
- All other attributes stripped

Wire in `AdapterRegistration.ts`:
```typescript
container.sanitizer = new SanitizeHtmlSanitizer();
```

### 3.3 Schema changes

```prisma
// backend/prisma/schema.prisma

model Comment {
  id            String   @id @default(uuid()) @db.Uuid
  requestId     String   @map("request_id") @db.Uuid
  body          String   @db.Text            // now stores sanitized HTML
  author        String?  @db.VarChar(128)    // denormalized display name (unchanged)
  authorUserId  String?  @map("author_user_id") @db.Uuid  // NEW — FK to portal_users
  visibility    String   @default("public") @db.VarChar(16)
  source        String   @default("PORTAL") @db.VarChar(16)
  createdAt     DateTime @default(now()) @map("created_at")

  request    Request     @relation(fields: [requestId], references: [id])
  authorUser PortalUser? @relation(fields: [authorUserId], references: [id])

  @@map("comments")
}

model Attachment {
  // ...existing fields...
  commentId   String?  @map("comment_id") @db.Uuid   // NEW — nullable
  // ...rest unchanged...
}
```

Migration: additive only — both new columns are nullable, no data loss.

### 3.4 Updated `AddCommentCmd`

```typescript
export interface AddCommentCmd {
  requestId:    string;
  body:         string;   // raw HTML from client; service sanitizes before persist
  author:       string;
  authorUserId: string;   // from req.user.userId
  clientId:     string;
}
```

### 3.5 Updated `CommentsService.add()`

```
1. Access check (request exists, belongs to clientId)
2. Sanitize body: container.sanitizer.sanitize(cmd.body)
3. Size guard: sanitized body > 100 000 chars → reject (413)
4. Save to DB with authorUserId
5. Build markdown for ticket sync: turndown(sanitizedBody), replace <img> with [image attached in portal]
6. Mirror markdown to ITicketSystem (non-fatal)
7. Return saved comment
```

### 3.6 Updated body validation (Zod)

```typescript
body: z.string().min(1).max(100_000)   // was max(10_000)
```

### 3.7 New endpoint: comment-file proxy

```
GET /api/comment-files/:storageKey
```

- Requires valid JWT (auth middleware)
- Extracts `clientId` prefix from storage key; must match `req.user.clientId`
- Calls `container.storage.getSignedUrl(key, 3600)`
- Returns `302` redirect to signed URL

This endpoint is registered outside the requests router (no `:id` prefix needed) and is called by `<img src>` attributes in rendered comment bodies.

### 3.8 New endpoint: comment-scoped attachment upload

```
POST /requests/:id/comments/:cid/attachments
```

- Validates `cid` comment belongs to `req.params.id` request
- Runs MIME magic-byte check (see §5.2)
- Stores file with key `{clientId}/{requestId}/comments/{commentId}/{sanitized-filename}`
- Saves `Attachment` record with `commentId` set
- Returns `AttachmentView` (same shape as existing endpoint)

### 3.9 Updated `GET /requests/:id/attachments` response

Add `commentId: string | null` field to `AttachmentView` so the frontend can group comment attachments under their comments.

---

## 4. Required Frontend Changes

### 4.1 New dependency: TipTap editor

```json
// frontend/package.json
"@tiptap/react": "^2.x",
"@tiptap/starter-kit": "^2.x",     // bold, italic, lists, heading, blockquote, code, pre
"@tiptap/extension-underline": "^2.x",
"@tiptap/extension-strike": "^2.x",  // already in StarterKit but explicit
"@tiptap/extension-link": "^2.x",
"@tiptap/extension-table": "^2.x",
"@tiptap/extension-table-row": "^2.x",
"@tiptap/extension-table-header": "^2.x",
"@tiptap/extension-table-cell": "^2.x",
"@tiptap/extension-image": "^2.x",   // for inline image rendering
```

No CDN. All bundled via Vite.

### 4.2 New component: `CommentEditor`

```
frontend/src/components/CommentEditor.tsx
```

- Wraps TipTap `<EditorContent>` with a toolbar
- Toolbar buttons: Bold · Italic · Underline · Strikethrough · | · H1 · H2 · H3 · | · Bullet list · Ordered list · | · Blockquote · Code block · | · Link · Table · | · Attach file
- "Attach file" button triggers hidden `<input type="file">` picker (not inline data URI — file is uploaded via API and the returned proxy URL is inserted as `<img>` or a download link)
- `onChange(html: string)` callback with editor's `getHTML()`
- Controlled: `initialValue?: string` for future edit support

### 4.3 New component: `CommentAttachmentUploader`

```
frontend/src/components/CommentAttachmentUploader.tsx
```

- Encapsulates the file-picker + progress + error for comment-scoped uploads
- Accepts `requestId` and `commentId`; calls new API endpoint
- On success, returns `AttachmentView` to parent so editor inserts `<img>` (images) or download link (documents)

### 4.4 New component: `CommentBody`

```
frontend/src/components/CommentBody.tsx
```

- Receives `body: string` and `isLegacy: boolean` (detected by whether body starts with `<`)
- Legacy path: `<p>{escapeHtml(body)}</p>`
- Rich-text path: `<div dangerouslySetInnerHTML={{ __html: body }} />`
  - Body is already server-sanitized; no client re-sanitization needed
- Registers click handlers on `<img>` elements to open lightbox

### 4.5 Lightbox for inline images

No heavyweight library. Implement a simple `ImageLightbox` component:
- Renders a full-screen overlay with the image
- Click outside or Esc to close
- Activated by `CommentBody` click handler on `img` elements

### 4.6 Updated `ViewRequestDetail.tsx`

Comment list section changes:
- Replace `<div className="comment-body">{c.body}</div>` with `<CommentBody body={c.body} />`
- Display `createdAt` as `"Aug 31, 2026 at 2:45 PM"` (use existing `fmtDate` helper or extend it)
- Display `c.author ?? 'Provana Team'` (unchanged label, already there)
- Show comment-scoped attachments grouped under each comment

Comment form section changes:
- Replace `<textarea>` with `<CommentEditor onChange={setComment} />`
- After successful POST, reset editor via ref (`editor.commands.clearContent()`)

### 4.7 Updated API client

```typescript
// frontend/src/api/requests.ts
addComment(requestId: string, body: string): Promise<Comment>
// body is now HTML string from TipTap getHTML()

// frontend/src/api/attachments.ts  (new overload)
uploadCommentAttachment(requestId: string, commentId: string, file: File): Promise<AttachmentView>
```

### 4.8 Comment timestamp formatting

```typescript
// Extend frontend/src/lib/formatDate.ts (or equivalent)
export function fmtCommentDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  }).format(new Date(date));
}
// → "Aug 31, 2026 at 2:45 PM"
```

---

## 5. Security Considerations

### 5.1 XSS protection

| Vector | Mitigation |
|--------|-----------|
| Script injection via `body` | `sanitize-html` on server write; strict tag/attribute allowlist |
| `javascript:` in href | `allowedSchemes: ['http', 'https']` in sanitizer config |
| Data URI images | `img.src` must start with `/api/comment-files/` — all others stripped |
| External image hotlinking | Same rule; prevents SSRF-style exfiltration via `<img src="http://attacker/...">` |
| HTML in legacy plain-text bodies | Client escapes before setting `innerHTML` |

### 5.2 File validation

All uploads (both request-scoped and comment-scoped) must pass:

1. **Extension allowlist** (server-side): `.png .jpg .jpeg .gif .webp .pdf .docx .xlsx .txt .zip`
2. **Size limit**: 25 MiB (already enforced by `@fastify/multipart`)
3. **Magic-byte MIME check** (server-side, using `file-type`):
   - Read first 4 096 bytes of the upload stream
   - Reject if `file-type` result doesn't match allowed MIME types
   - Reject if `file-type` returns `undefined` (unknown binary)
4. **Content-Disposition**: `attachment` on download responses (prevents browser auto-execution)

Supported MIME types to allowlist:
```
image/png  image/jpeg  image/gif  image/webp
application/pdf
application/vnd.openxmlformats-officedocument.wordprocessingml.document  (docx)
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet        (xlsx)
text/plain
application/zip
```

### 5.3 Comment-file proxy tenant isolation

Storage key format: `{clientId}/{requestId}/...`

The proxy endpoint (`GET /api/comment-files/:storageKey`) extracts the first path segment and compares it to `req.user.clientId`. Mismatch → 403. This prevents a user from one tenant accessing another tenant's comment images.

### 5.4 Virus scanning (deferred)

Current posture: extension + MIME allowlist + size cap is the realistic security baseline for Phase 8d.

Phase 9+ options:
- **ClamAV** (self-hosted, free): run in a sidecar container; scan buffer before storing
- **Azure Defender for Storage** (Phase 9 / Azure Blob): automatic malware scan on blob write, emits Event Grid events
- **Supabase edge function with VirusTotal API**: viable on free tier

Recommend deferring to Phase 9 alongside Azure Blob migration, where Azure Defender handles this automatically.

### 5.5 Rate limiting

Comments endpoint: consider adding a per-user rate limit (e.g., 20 comments/minute) to prevent spam. Can be done with `@fastify/rate-limit` keyed on `req.user.userId`. Out of scope for Phase 8d but flagged here.

---

## 6. Database Migration Plan

### Migration: `0002_enhanced_comments`

**Operations (additive only — no destructive changes):**

```sql
-- Add authorUserId to comments
ALTER TABLE comments
  ADD COLUMN author_user_id UUID REFERENCES portal_users(id);

-- Add commentId to attachments
ALTER TABLE attachments
  ADD COLUMN comment_id UUID REFERENCES comments(id);

-- Index for comment-attachment lookups
CREATE INDEX idx_attachments_comment_id ON attachments(comment_id);
```

**Safety:**
- Both new columns are nullable → zero downtime, no backfill required
- Existing comments keep `authorUserId = NULL` — displayed as `author` string fallback
- Existing attachments keep `commentId = NULL` — still displayed in the request's attachment list

**Body column:** `body` stays `String @db.Text` (maps to `nvarchar(max)` for SQL Server Phase 9). No change to column type — HTML is just richer text content.

### Storage strategy

No new storage buckets needed. Comment attachments use the same Supabase/Azure Blob bucket with a different key prefix:
```
{clientId}/{requestId}/comments/{commentId}/{sanitized-filename}
```

This keeps the `IFileStorage` port interface unchanged.

---

## 7. Recommended Libraries / Packages

| Package | Purpose | Where |
|---------|---------|-------|
| `@tiptap/react` + extensions | Rich text editor | frontend |
| `sanitize-html` | Server-side HTML sanitization | backend |
| `turndown` | HTML → Markdown for ticket sync | backend |
| `file-type` | Magic-byte MIME detection | backend |
| No lightbox library | Custom `ImageLightbox` component (simple) | frontend |

---

## 8. Step-by-Step Implementation Plan

### Phase A — Backend (Task 020-a)

1. Add `sanitize-html`, `turndown`, `file-type` to `backend/package.json`
2. Create `ISanitizer` port and `SanitizeHtmlSanitizer` adapter
3. Wire `container.sanitizer` in `AdapterRegistration.ts`
4. Write Prisma migration `0002_enhanced_comments` (adds `author_user_id`, `comment_id`)
5. Regenerate Prisma client
6. Update `Comment` entity and `AddCommentCmd` to include `authorUserId`
7. Update `CommentsService.add()`: sanitize body, update Zod max to 100k, populate `authorUserId`, transform HTML→Markdown for sync
8. Update `CommentsRepository` (Prisma + InMemory) for new fields
9. Update `CommentsEndpoints.ts`: pass `req.user.userId` as `authorUserId`
10. Add comment-file proxy endpoint `GET /api/comment-files/:storageKey`
11. Add comment-scoped attachment upload `POST /requests/:id/comments/:cid/attachments`
12. Update `AttachmentView` to include `commentId`
13. Add magic-byte validation to both attachment upload endpoints (extract to shared util)
14. Write/update unit tests

### Phase B — Frontend (Task 020-b)

1. Add TipTap packages to `frontend/package.json`
2. Create `CommentEditor.tsx` (TipTap + toolbar)
3. Create `CommentAttachmentUploader.tsx`
4. Create `CommentBody.tsx` (legacy detection, `dangerouslySetInnerHTML`, img click handler)
5. Create `ImageLightbox.tsx`
6. Add `fmtCommentDate()` to date utility
7. Update `frontend/src/api/requests.ts` — `addComment` sends HTML body
8. Update `frontend/src/api/attachments.ts` — add `uploadCommentAttachment`
9. Update `ViewRequestDetail.tsx`:
   - Replace `<textarea>` → `<CommentEditor>`
   - Replace comment body render → `<CommentBody>`
   - Add `createdAt` timestamp display
   - Group comment attachments under each comment
10. Add CSS for editor toolbar, comment metadata, attachment chips, lightbox overlay

### Phase C — Security + Polish (Task 020-c)

1. End-to-end test: upload malicious file (test magic-byte rejection)
2. End-to-end test: XSS payload in comment body (verify sanitization strips it)
3. End-to-end test: cross-tenant image access via proxy (verify 403)
4. Verify legacy plain-text comments render as expected (no HTML interpretation)
5. Verify ticket-system sync sends Markdown (check GitHub issue comment content)
6. Visual review of editor toolbar on mobile viewports
7. Confirm `Content-Disposition: attachment` on download responses
8. Update `docs/architecture.md`
9. Run `session-recap` skill

---

## 9. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| TipTap HTML output changes between minor versions | Low | Pin exact `@tiptap/*` versions; test output in CI |
| `sanitize-html` allowlist too tight (strips valid content) | Medium | Integration tests with known HTML payloads; allowlist is code-reviewed |
| `sanitize-html` allowlist too loose (XSS escapes) | Low | Follow OWASP recommendations; second-pair-eyes review on allowlist |
| Comment-file proxy adds latency (302 redirect) | Low | Redirect is immediate; browser follows in <1 ms; no streaming overhead |
| `file-type` (ESM-only) build incompatibility | Medium | Use dynamic `await import('file-type')` in ESM-compatible wrapper; test in CI |
| Ticket-system sync breaks on HTML → Markdown edge cases | Medium | `turndown` is battle-tested; add smoke test that syncs a rich comment to dev issue |
| Large attachments in comments slow initial load | Low | Attachment list is lazy-loaded per comment; not preloaded with comment list |
| Legacy comments display incorrectly after deploy | Low | Client-side legacy detection is based on `body[0] === '<'`; plain-text bodies never start with `<` after proper escaping |

---

## 10. Open Questions (Needs Client Confirmation Before Task 020-a)

1. **Comment mutability**: Are comments immutable (no edit/delete by users), or do users need to edit their own comments? Versioning is out of scope unless explicitly requested.
2. **Internal comments**: The schema supports `visibility='internal'` but the current UI only shows `public` comments. Should the enhanced editor allow staff to post internal-only comments? If so, this is a separate toggle, not part of this spec.
3. **Phase slot**: Does this go in as Phase 8d (before shipping), or is it deferred to Phase 9+ (post-deployment)?
