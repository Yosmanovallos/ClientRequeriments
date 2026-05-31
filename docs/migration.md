# Migration Map — Free MVP → Microsoft

Each port migrates independently. One PR per port. Business logic and tests are untouched throughout.

| Port | Free MVP adapter | Env var to flip | Microsoft adapter (Phase 9) |
|------|-----------------|-----------------|------------------------------|
| Auth | `SupabaseIdentityProvider` | `AUTH_PROVIDER=entra` | `EntraIdentityProvider` (OIDC, same interface) |
| Storage | `SupabaseFileStorage` | `STORAGE_PROVIDER=azureblob` | `BlobFileStorage` (Azure Blob Storage) |
| Tickets | `GitHubIssuesTicketSystem` | `TICKETS_PROVIDER=azuredevops` | `AzureDevOpsTicketSystem` |
| Notifications | `SmtpNotifier` / `SlackNotifier` | `NOTIFY_PROVIDER=microsoft` | `MicrosoftNotifier` (Graph API + Teams) |
| Database | Postgres (Neon/Supabase) via Prisma | Change `datasource provider` in `schema.prisma` | Azure SQL (SQL Server provider) |
| Backend host | Render (Docker) | Re-point CI deploy step | Azure App Service (same container) |
| Frontend host | Vercel / Netlify | Re-point CI deploy step | Azure Static Web Apps (same build output) |

## Migration steps (Phase 9 — do one port per PR)

1. **DB:** change `schema.prisma` provider `"postgresql"` → `"sqlserver"`, run `prisma migrate deploy` against Azure SQL.
2. **Auth:** implement `EntraIdentityProvider.ts`, set `AUTH_PROVIDER=entra`, verify cross-tenant isolation test still passes.
3. **Storage:** implement `BlobFileStorage.ts`, set `STORAGE_PROVIDER=azureblob`, verify file upload round-trip.
4. **Tickets:** implement `AzureDevOpsTicketSystem.ts`, set `TICKETS_PROVIDER=azuredevops`, verify submit → work item created.
5. **Notifications:** implement `MicrosoftNotifier.ts`, set `NOTIFY_PROVIDER=microsoft`, verify email + Teams message.
6. **Hosting:** push same Docker image to Azure App Service; push Vite build to Azure Static Web Apps; update DNS.
7. **Telemetry (optional):** change OTel exporter endpoint from Sentry/Grafana to Azure Monitor.
