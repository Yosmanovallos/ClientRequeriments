# ADR 002 — Offline JWT verification for SupabaseIdentityProvider

**Date:** 2026-05-29
**Status:** Accepted

## Context
The task file (`tasks/005-supabase-auth-adapter.md`) proposed implementing the adapter as a wrapper around `supabase.auth.getUser(token)` from the official `@supabase/supabase-js` SDK. This would mean:
- Adding ~250 KB of SDK dependencies (fetch + realtime + storage SDK transitive deps)
- A network round-trip to Supabase Auth on **every authenticated request**
- Identical security guarantees to verifying the JWT signature locally

Supabase issues **standard HS256 JWTs** signed with the project's JWT secret. Every claim needed for our `UserIdentity` (sub, email, app_metadata, user_metadata) is already in the token payload.

## Decision
Use the already-installed `jsonwebtoken` library to verify Supabase JWTs **offline**:
- `jwt.verify(token, SUPABASE_JWT_SECRET, { algorithms: ['HS256'] })`
- Extract `clientId` from `app_metadata.client_id` (admin-set, secure) with fallback to `user_metadata.client_id` (user-modifiable, demo)
- Pin `algorithms` to `['HS256']` to defend against alg-confusion attacks (e.g. `alg: none`)

## Consequences
- **Good:** zero network calls on the hot path. Auth-only requests run in microseconds.
- **Good:** no Supabase SDK dependency in the backend. Smaller bundle, faster cold start.
- **Good:** the secret is the only required config — no admin API key needed.
- **Good:** structurally identical to how an `EntraIdentityProvider` will work in Phase 9 (Microsoft also issues standard JWTs; just JWKS instead of HS256).
- **Trade-off:** if Supabase changes its JWT format we need to update the adapter. (Unlikely — they've committed to OAuth/OIDC compatibility.)
- **Trade-off:** revocation is not real-time — a logged-out user's token is valid until expiry (default 1 hour). For sensitive operations that need real-time revocation, fall back to the SDK call. Not needed for this MVP.

## Rejected alternatives
1. **`supabase.auth.getUser(token)` SDK call per request** — adds latency and a hard dependency on Supabase being reachable, without any security benefit since we already trust the JWT signature.
2. **JWKS-based verification** — Supabase uses HS256 (symmetric), not RS256/JWKS. Asymmetric verification would require Supabase to publish a JWKS URI, which they don't.
3. **Per-request `portal_users` table lookup for clientId** — couples auth to the database. Not needed when the claim is already in the JWT.
