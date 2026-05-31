# Task 005 — SupabaseIdentityProvider adapter

**Phase:** 4 · **Status:** ✅ DONE (2026-05-29)

## Result
- `SupabaseIdentityProvider.ts` — verifies Supabase HS256 JWTs **offline** using `jsonwebtoken` (faster + lighter than `supabase.auth.getUser()`; no SDK dep, no per-request network call)
- Extracts `clientId` from claims with precedence: `app_metadata.client_id` (admin-set, secure) → `user_metadata.client_id` (user-modifiable, demo) → `DEMO_FALLBACK_CLIENT_ID` env (dev only)
- Pinned `algorithms: ['HS256']` — prevents alg-confusion attack (`alg: none`)
- Audience check enforces `aud === "authenticated"` (rejects anon/service tokens)
- `AdapterRegistration::buildIdentity()` wired; throws clear error if `SUPABASE_JWT_SECRET` missing
- `.env.example` updated with `SUPABASE_JWT_SECRET` + `DEMO_FALLBACK_CLIENT_ID`
- 14 new unit tests covering: valid token, app_metadata precedence over user_metadata, full_name displayName, email fallback, expired token, wrong secret, garbage strings, `alg: none` rejection, wrong audience, missing client_id, fallback clientId behaviour
- **Live smoke test verified:** A and B users got separate reference series (A: CBLPBR-*, B: REQ-*), A cannot read B's request (404 NOT_FOUND — same response as nonexistent, no enumeration leak)
- **No file in `Modules/` touched** — only `Platform/` + tests

## Verified counts
- `npm test` → **21 passed** (7 prior + 14 new)
- `tsc --noEmit` → exit 0

## Do
1. Use the `add-adapter` skill with port=`IIdentityProvider`, provider=`Supabase`
2. Implement `backend/src/Platform/Adapters/Supabase/SupabaseIdentityProvider.ts`
   - Constructor: `(url: string, anonKey: string)`
   - `verify(token)`: calls `supabase.auth.getUser(token)`, returns `UserIdentity`
   - `clientId` comes from `user.user_metadata.client_id` claim (or look up `portal_users` table by `auth_user_id`)
3. Uncomment the `supabase` case in `AdapterRegistration.ts::buildIdentity()`
4. Add tests with a mocked Supabase client
5. Set `AUTH_PROVIDER=supabase` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env`; verify cross-tenant isolation test still passes

## Definition of done
- [ ] `npm test` passes (existing 7 tests + new adapter test)
- [ ] Backend starts with `AUTH_PROVIDER=supabase` without errors
- [ ] Cross-tenant test: user from client A cannot read client B's requests
- [ ] No file in `Modules/` touched (only Platform/ and tests)

## Context to load
- `backend/src/Platform/Ports/IIdentityProvider.ts`
- `backend/src/Platform/Adapters/Local/LocalIdentityProvider.ts` (reference impl)
- `backend/src/Platform/AdapterRegistration.ts`

## Out of scope
- Real Supabase project setup — user provides credentials
- Entra adapter (Phase 9)
