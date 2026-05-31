# Architecture — CLIENTREQUIREMENTS

```
[ Browser ] React/Vite SPA ─── OIDC/JWT ──▶ Auth (Supabase now → Entra later)
     │  HTTPS  (frontend/src/api/client.ts — one fn per endpoint)
     ▼
[ Backend API ] Node.js/Fastify on Render (now) → Azure App Service (later)
   Shared: auth middleware | errors → problem+json | logging (Pino / OTel-ready)
   ┌─────────────┬──────────────┬─────────────┐
   │  Requests   │   Comments   │  Attachments│   ← Modules (vertical slices)
   └──────┬──────┴──────┬───────┴──────┬──────┘
          │             │              │
          └─────────────┴──────────────┘
                        │
                 Platform/Ports (interfaces)
          ┌─────────────┼──────────────────────┐
          │             │                      │
   IIdentityProvider  IFileStorage       ITicketSystem
          │             │                      │
   Supabase Auth    Supabase/R2          GitHub Issues
   (now) → Entra    (now) → Azure Blob   (now) → Azure DevOps
                                               │
                                        outbox worker (code)
                                               │
                                        INotifier
                                         Resend/Slack (now)
                                         → Outlook + Teams (later)

[ Database ]  Postgres via Prisma (Neon/Supabase now → Azure SQL later)
              Schema: clients, requests, status_history, comments,
                      outbox_events, client_ref_counters
              Portability: payload stored as Text (JSON string), not JSONB
```

## Key decisions
- Ports/adapters for the 5 things that change in migration (see `docs/decisions/001-ports-adapters.md`)
- `payload` column is `String @db.Text` (JSON) not Prisma `Json` → portable to SQL Server `nvarchar(max)`
- Outbox pattern (DB table) instead of a message broker — right-sized for 5–8 requests/day
- OpenTelemetry-ready logging — swap the exporter to Azure Monitor in Phase 9, no code change
