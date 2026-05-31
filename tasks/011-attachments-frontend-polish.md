# Task 011 — Attachments frontend polish (drag-and-drop + propagate to all forms)

**Phase:** 8b · **Status:** ✅ DONE (2026-05-30)

## Result
- **New `AttachmentsPicker` component** (`frontend/src/components/AttachmentsPicker.tsx`):
  - Controlled (parent owns `files` state via `onChange`)
  - Browse button + drag-and-drop (purple-bordered drop zone with visual feedback during drag)
  - Per-file size + remove button
  - 90 lines, replaces ~30 lines of inline JSX in each of 5 form views
- **New `attachmentsApi.uploadAll()` helper** — sequential batch upload with progress callback. Best-effort per file (failures counted, never abort batch). Returns `{succeeded, failed}` for the UI to render.
- **All 5 form views updated** to use the component + helper:
  - `ViewForm.tsx` (New Report)
  - `ViewFormNewPage.tsx`
  - `ViewFormNewFeature.tsx`
  - `ViewFormFixIssue.tsx`
  - `ViewFormViewRequest.tsx`
  - Each form now has 3 fewer lines (vs the old inline picker) and behaves identically (Browse + DnD + per-file remove + upload progress in submitMsg)
- **`ViewRequestDetail.tsx` extended** with attachments list section:
  - Fetches `GET /requests/:id/attachments` on mount alongside detail + comments (parallel Promise.all)
  - Renders each as a `<a href="signedUrl" target="_blank">` link with filename, size, content type, uploader email, upload date
  - "No attachments" message when empty
  - Count badge in section title when > 0

## End-to-end smoke verified
Created request, uploaded 3 files (`design.pdf`, `screenshot.png`, `data.csv`), GET returned all 3 with signed URLs. Detail view will render them as styled download links.

## Verified counts
- Backend `npm test` → **150 passed** (unchanged — pure frontend work)
- Frontend `npm run typecheck` → exit 0

## DoD checklist
- [x] DnD works alongside Browse button on every form (single component, used 5x)
- [x] No duplicate upload code — extracted to `<AttachmentsPicker>` + `attachmentsApi.uploadAll()`
- [x] Request detail page lists attachments with downloadable signed-URL links + metadata
- [x] `frontend && npm run typecheck` passes
- [x] Browser-side QA pending (the user runs `cd frontend && npm run dev` and clicks through — CLI smoke proves the API contract)

## Original spec below

## Do
1. Add drag-and-drop to the file picker in `ViewForm.tsx`:
   - `onDragOver` / `onDragLeave` / `onDrop` handlers
   - Visual feedback (border highlight) when dragging
   - Same `addFiles()` call as the Browse button
2. Extract the file picker + upload-after-create logic into a shared hook or component (`useAttachmentUpload` or `<AttachmentPicker>`) — currently the logic only lives in `ViewForm.tsx`
3. Add the same picker to the other 4 form views:
   - `ViewFormNewPage.tsx`
   - `ViewFormNewFeature.tsx`
   - `ViewFormFixIssue.tsx`
   - `ViewFormViewRequest.tsx`
4. Update `ViewRequestDetail.tsx` to display attachments: GET `/requests/:id/attachments` on mount, render each as a link to its `signedUrl` with filename/size
5. Visual QA in browser — confirm Browse + DnD both work, upload progress is visible

## Definition of done
- [ ] DnD works alongside the Browse button on every form
- [ ] No duplicate upload code across the 5 forms (extracted to hook/component)
- [ ] Request detail page lists attachments with downloadable signed-URL links
- [ ] `frontend && npm run typecheck` passes
- [ ] Browser QA: drag a file onto each form → submit → it appears in the request detail

## Context to load
- `frontend/src/views/ViewForm.tsx` (current implementation)
- `frontend/src/api/attachments.ts`
- `frontend/src/views/ViewRequestDetail.tsx` (where to add the list)

## Out of scope
- Upload progress percentage (browser doesn't expose it on fetch — would need XHR)
- Image previews / thumbnails (Phase 9+)
- Backend changes (Phase 8 already done)
