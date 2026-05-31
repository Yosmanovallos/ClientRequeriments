# ADR 001 — Ports & Adapters for the five migration-critical services

**Date:** 2026-05-29
**Status:** Accepted

## Context
The MVP runs on free services (Supabase, GitHub Issues, Resend, Neon).
After approval, the platform migrates to Microsoft (Entra, Azure DevOps, Teams, Azure SQL).
Without an abstraction, every migration would require touching business logic.

## Decision
Apply the ports & adapters pattern to exactly the five concerns that change in migration:
auth, file storage, ticket system, notifications, and clock.

Business logic (Modules/) depends only on the port interfaces.
The concrete adapter is selected by reading an env var in `AdapterRegistration.ts`.

## Consequences
- **Good:** migration = write one adapter class + flip one env var. Business logic unchanged.
- **Good:** tests inject `Local` adapters — no external service needed.
- **Good:** the pattern is applied minimally (5 ports, not everything) — no overengineering.
- **Trade-off:** one extra indirection for every external call. Acceptable given the migration benefit.

## Rejected alternatives
- Direct Supabase calls in Modules (no abstraction): would require a full rewrite to migrate.
- Full hexagonal architecture for everything: overengineered for this volume (5–8 req/day).
