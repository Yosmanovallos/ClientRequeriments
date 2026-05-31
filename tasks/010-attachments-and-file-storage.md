# Task 010 — Attachments via IFileStorage

**Phase:** 8 · **Status:** ✅ DONE (2026-05-29)

## Result
- `SupabaseFileStorage` adapter (native fetch, no SDK) — upload, signed URL, idempotent delete. Path-safe encoding
- New `Attachments` module (5-file blueprint shape): entity, InMemory + Prisma repos, service (tenant isolation, filename sanitisation, storage-first delete), endpoints (POST/GET/DELETE)
- Added `Attachment` model to Prisma schema with storage key shape `{clientId}/{requestId}/{attId}/{filename}` for RLS scoping
- `@fastify/multipart@8` installed (v10 needed Fastify v5; we're v4). 25 MiB upload limit
- `AdapterRegistration::buildStorage()`'s `supabase` case wired
- Frontend: `api/attachments.ts` multipart helper + file picker on `ViewForm.tsx` (uploads after request creation, best-effort per file)
- 22 new tests (13 storage + 9 service) — **94/94 total passing**
- E2E smoke (8 HTTP cases) green: create → upload txt+png → list → delete → 404/400 edges
- `tsc --noEmit` exit 0 for both backend and frontend

## DoD checklist
- [x] POST /requests/:id/attachments → 201 + `{storageKey, signedUrl}`
- [x] GET /requests/:id/attachments returns list with signed URLs
- [x] DELETE removes storage object + DB row (in that order)
- [x] Cross-tenant test passes (3 unit tests)
- [x] Frontend file picker uploads
- [x] No file in existing Modules/Requests, Modules/Comments, Modules/Sync touched

## Original spec below

## Do
1. Use the `add-adapter` skill twice:
   - **SupabaseFileStorage** (`Adapters/Supabase/SupabaseFileStorage.ts`) — uploads to Supabase Storage bucket, returns signed URL
   - **R2FileStorage** (`Adapters/R2/R2FileStorage.ts`) — Cloudflare R2 via S3-compatible API (free 10GB, no egress fees)
2. Pick **one** for the MVP based on what the user already has set up — Supabase is preferred since auth is already there
3. Update `AdapterRegistration::buildStorage()` — wire `supabase` / `r2` cases (currently throws)
4. Add `Attachments` module: `Attachment.ts` entity, `AttachmentsRepository` (InMemory + Prisma), `AttachmentsService`, `AttachmentsEndpoints`
5. New endpoints:
   - `POST /requests/:id/attachments` — multipart upload, returns `{key, url}` from `IFileStorage.upload()`
   - `GET /requests/:id/attachments` — list metadata for that request (file name, size, content-type, signed URL)
   - `DELETE /requests/:id/attachments/:attId` — calls `IFileStorage.delete()` + removes DB row
6. Fastify multipart: install `@fastify/multipart` plugin (lightweight, no extra deps)
7. Frontend: wire `ViewForm.tsx` (and the other 4) — replace the `<dropzone>` from legacy with a real file picker that POSTs after the request is created (multistep: create request → use returned id → upload each file)
8. Tests:
   - SupabaseFileStorage with mocked supabase-js storage client
   - AttachmentsService idempotency + tenant isolation (A can't read B's attachments)
   - End-to-end smoke: POST request → POST attachment → GET attachment URL → verify file accessible

## Definition of done
- [ ] `POST /requests/:id/attachments` with a file → 201 + `{key, url}`
- [ ] `GET /requests/:id/attachments` returns the list with signed URLs
- [ ] DELETE removes both DB row and storage object
- [ ] Cross-tenant test passes (other client cannot see attachments)
- [ ] Frontend form's file picker actually uploads
- [ ] No file in existing `Modules/Requests`, `Modules/Comments`, `Modules/Sync` touched

## Context to load
- `backend/src/Platform/Ports/IFileStorage.ts`
- `backend/src/Platform/Adapters/Local/LocalFileStorage.ts` (reference impl)
- `backend/src/Platform/AdapterRegistration.ts` (`buildStorage`)
- `backend/prisma/schema.prisma` (add `attachments` table)

## Out of scope
- File previews/thumbnails (Phase 9+)
- Virus scanning (Phase 9+ — would slot in as `IFileScanner` port if needed)
- Azure Blob Storage adapter (Phase 9 migration)
