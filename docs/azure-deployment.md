# Azure Deployment Guide — Provana Help Center

Full step-by-step to move from Render + Vercel to 100% Microsoft Azure.

**Stack:**
| Layer | Service |
|---|---|
| Frontend | Azure Static Web Apps |
| Backend API | Azure App Service (Linux) |
| Database | Azure Database for PostgreSQL Flexible Server |
| File Storage | Azure Blob Storage |
| Authentication | Azure Entra External ID (Phase 9) |
| Notifications | Azure Communication Services + Teams (Phase 9) |
| Secrets | Azure Key Vault (optional) |
| Monitoring | Application Insights |

---

## Part 1 — Create Azure Resources

Do all of this in the Azure Portal (`portal.azure.com`) with your Provana subscription.

### Step 1 — Resource Group

1. Search **Resource groups** → **+ Create**
2. Subscription: your Provana subscription
3. Name: `provana-helpcenter-rg`
4. Region: `East US` (or closest to your users)
5. **Review + create** → **Create**

---

### Step 2 — Azure Database for PostgreSQL

1. Search **Azure Database for PostgreSQL** → **+ Create**
2. Choose **Flexible server**
3. Settings:
   - Resource group: `provana-helpcenter-rg`
   - Server name: `provana-helpcenter-db`
   - Region: same as resource group
   - PostgreSQL version: **16**
   - Workload type: **Development** (to start, upgrades to Production later)
   - Compute: **Burstable, B1ms** (1 vCore, 2 GB RAM — $12/mo)
   - Storage: **32 GB**
   - Admin username: `provana_admin`
   - Password: generate a strong password and save it
4. **Networking tab:**
   - Connectivity method: **Public access**
   - Check **Allow public access from any Azure service** (needed for App Service)
   - Add your own IP address so you can run migrations from your laptop
5. **Review + create** → **Create** (takes ~5 min)

After it deploys, go to the resource → **Connect** and copy the connection string. It will look like:
```
postgresql://provana_admin:<password>@provana-helpcenter-db.postgres.database.azure.com:5432/postgres?sslmode=require
```

Create the app database:
1. Go to the resource → **Databases** → **+ Add**
2. Name: `provana_db`

Your final `DATABASE_URL`:
```
postgresql://provana_admin:<password>@provana-helpcenter-db.postgres.database.azure.com:5432/provana_db?sslmode=require
```

---

### Step 3 — Azure Blob Storage

1. Search **Storage accounts** → **+ Create**
2. Settings:
   - Resource group: `provana-helpcenter-rg`
   - Storage account name: `provanahelpcenter` (lowercase, no dashes, globally unique)
   - Region: same as above
   - Performance: **Standard**
   - Redundancy: **LRS** (Locally redundant — cheapest, sufficient)
3. **Review + create** → **Create**

After it deploys:
1. Go to the resource → **Containers** → **+ Container**
2. Name: `attachments`
3. Public access level: **Private** (access via SAS or connection string only)

Get the connection string:
1. Go to **Access keys** → copy **Connection string** (key1)

Save for later:
```
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=provanahelpcenter;...
AZURE_STORAGE_CONTAINER=attachments
```

---

### Step 4 — App Service Plan + App Service (Backend)

1. Search **App Service** → **+ Create** → **Web App**
2. Settings:
   - Resource group: `provana-helpcenter-rg`
   - Name: `provana-helpcenter-api` (this becomes `provana-helpcenter-api.azurewebsites.net`)
   - Publish: **Code**
   - Runtime stack: **Node 20 LTS**
   - Operating system: **Linux**
   - Region: same as above
   - Pricing plan: **Basic B1** (~$13/mo) — click **Explore pricing plans** to select it
3. **Review + create** → **Create**

After it deploys:
1. Go to the resource → **Configuration** → **Application settings**
2. Add all environment variables (see Part 2 below)
3. Go to **General settings** → set **Startup command**:
   ```
   node dist/app.js
   ```

---

### Step 5 — Azure Static Web Apps (Frontend)

1. Search **Static Web Apps** → **+ Create**
2. Settings:
   - Resource group: `provana-helpcenter-rg`
   - Name: `provana-helpcenter-web`
   - Plan type: **Standard** ($9/mo — needed for custom domains + API routes)
   - Region: **East US 2** (Static Web Apps regions differ from regular Azure regions)
   - Source: **GitHub**
   - Sign in to GitHub → select repo `ClientRequeriments`
   - Branch: `main`
   - Build presets: **Vite**
   - App location: `/frontend`
   - Output location: `dist`
3. **Review + create** → **Create**

This automatically creates a GitHub Actions workflow in your repo for CI/CD.

After it deploys:
1. Go to the resource → **Configuration** → add environment variables (see Part 2)
2. Go to **Custom domains** if you have a domain to set up

---

### Step 6 — Application Insights (Monitoring)

1. Search **Application Insights** → **+ Create**
2. Settings:
   - Resource group: `provana-helpcenter-rg`
   - Name: `provana-helpcenter-insights`
   - Region: same as above
   - Resource mode: **Workspace-based**
3. **Create**

After it deploys, copy the **Connection String** (not the Instrumentation Key).

Add to App Service env vars:
```
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=xxx;IngestionEndpoint=...
```

---

## Part 2 — Environment Variables

### Backend (App Service → Configuration → Application settings)

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `HOST` | `0.0.0.0` |
| `DATABASE_URL` | PostgreSQL connection string from Step 2 |
| `AUTH_PROVIDER` | `local-jwt` |
| `LOCAL_JWT_SECRET` | generate a 64-char random string |
| `CORS_ORIGIN` | your Static Web Apps URL, e.g. `https://provana-helpcenter-web.azurestaticapps.net` |
| `TICKETS_PROVIDER` | `azuredevops` |
| `ADO_ORG` | `provanarequeriments` |
| `ADO_PAT` | your Azure DevOps Personal Access Token |
| `ADO_WORK_ITEM_TYPE` | `Issue` |
| `ADO_STATE_MAP_JSON` | `{"NEW":{"state":"To Do"},"IN REVIEW":{"state":"To Do"},"APPROVED":{"state":"To Do"},"IN DEVELOPMENT":{"state":"Doing"},"UAT":{"state":"Doing"},"CUSTOMER FEEDBACK":{"state":"Doing"},"DONE":{"state":"Done","reason":"Fixed"},"CANCELLED":{"state":"Done","reason":"Abandoned"},"ON HOLD":{"state":"To Do"}}` |
| `ADO_WEBHOOK_USER` | `portal-webhook` |
| `ADO_WEBHOOK_PASS` | generate a random string |
| `FRONTEND_URL` | your Static Web Apps URL |
| `DEMO_FALLBACK_CLIENT_ID` | `00000000-0000-0000-0000-000000000001` |
| `STORAGE_PROVIDER` | `azure` *(requires Phase 9 adapter — see Part 4)* |
| `AZURE_STORAGE_CONNECTION_STRING` | from Step 3 |
| `AZURE_STORAGE_CONTAINER` | `attachments` |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | from Step 6 |

### Frontend (Static Web Apps → Configuration)

| Key | Value |
|---|---|
| `VITE_AUTH_PROVIDER` | `local` |
| `VITE_API_URL` | *(leave blank — Static Web Apps uses `staticwebapp.config.json` proxy)* |

---

## Part 3 — Database Migration

Run this from your laptop (your IP must be in the PostgreSQL firewall from Step 2):

```bash
cd backend

# Set the Azure DATABASE_URL temporarily
$env:DATABASE_URL="postgresql://provana_admin:<password>@provana-helpcenter-db.postgres.database.azure.com:5432/provana_db?sslmode=require"

# Apply all migrations
npm run db:migrate

# Seed demo data
npx tsx src/seed.ts
```

---

## Part 4 — Deploy Backend to App Service

### Option A — GitHub Actions (recommended)

1. In Azure Portal → App Service → **Deployment Center**
2. Source: **GitHub**
3. Sign in → select repo `ClientRequeriments`, branch `main`
4. Build provider: **GitHub Actions**
5. Save — Azure creates a workflow file in your repo

Edit the generated workflow to build correctly:
```yaml
# In the generated workflow, change the build step to:
- name: Build backend
  run: |
    cd backend
    npm ci
    npm run build
    npx prisma generate
```

### Option B — Docker (using existing Dockerfile)

The repo has a `backend/Dockerfile` already configured. In App Service:
1. Publish: **Container**
2. Source: **GitHub Container Registry** or **Azure Container Registry**
3. Build and push the image from GitHub Actions, then point App Service to it

---

## Part 5 — Configure Static Web Apps Routing

Replace `frontend/vercel.json` routing with a `frontend/staticwebapp.config.json` file:

```json
{
  "routes": [
    {
      "route": "/api/*",
      "rewrite": "https://provana-helpcenter-api.azurewebsites.net/*"
    },
    {
      "route": "/*",
      "rewrite": "/index.html"
    }
  ],
  "navigationFallback": {
    "rewrite": "/index.html"
  },
  "globalHeaders": {
    "Cache-Control": "no-cache"
  },
  "mimeTypes": {
    ".json": "text/json"
  }
}
```

Assets caching (equivalent to `vercel.json` immutable cache):
```json
{
  "routes": [
    {
      "route": "/assets/*",
      "headers": {
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    }
  ]
}
```

---

## Part 6 — ADO Service Hooks (same as current setup)

For each ADO project you connect (Bell Legal Group, stoneridge, etc.):

1. Go to ADO project → **Project Settings** → **Service hooks** → **+ Create subscription**
2. **Work item created** → Web Hooks
   - URL: `https://provana-helpcenter-api.azurewebsites.net/webhooks/azuredevops`
   - Basic auth username: value of `ADO_WEBHOOK_USER`
   - Basic auth password: value of `ADO_WEBHOOK_PASS`
3. **Work item updated** → Web Hooks (same URL and credentials)

---

## Part 7 — Phase 9 Code Changes (requires development)

These adapters do not exist yet and need to be built before the Azure services can be used:

### 7a — Azure Blob Storage adapter
- File to create: `backend/src/Platform/Adapters/Azure/AzureBlobFileStorage.ts`
- Implements: `IFileStorage` (upload, getSignedUrl, download, delete)
- Uses: `@azure/storage-blob` SDK
- Env var to add: `STORAGE_PROVIDER=azure`
- Wire in: `backend/src/Platform/AdapterRegistration.ts`

### 7b — Azure Entra External ID adapter
- File to create: `backend/src/Platform/Adapters/Azure/EntraIdentityProvider.ts`
- Implements: `IIdentityProvider`
- Uses: `@azure/msal-node` SDK
- Replaces: `local-jwt` auth
- Env vars: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`

### 7c — Azure Communication Services email adapter
- File to create: `backend/src/Platform/Adapters/Azure/AcsNotifier.ts`
- Implements: `INotifier` (sendEmail)
- Uses: `@azure/communication-email` SDK
- Env vars: `ACS_CONNECTION_STRING`, `ACS_SENDER_ADDRESS`

### 7d — Teams webhook notifier
- Already partially supported via `TEAMS_WEBHOOK_URL` env var
- Verify `INotifier.sendChannelMessage` is wired to Teams incoming webhook

---

## Migration Checklist

```
[ ] Resource group created
[ ] PostgreSQL Flexible Server created + provana_db database created
[ ] Blob Storage account created + attachments container created
[ ] App Service created (Node 20 LTS, Linux, Basic B1)
[ ] Static Web Apps created + connected to GitHub
[ ] Application Insights created
[ ] Backend env vars set in App Service Configuration
[ ] Frontend env vars set in Static Web Apps Configuration
[ ] Database migrations run from laptop
[ ] staticwebapp.config.json added to frontend/
[ ] Backend deployment pipeline configured (GitHub Actions or Docker)
[ ] ADO Service Hooks updated to point to new App Service URL
[ ] Phase 9: AzureBlobFileStorage adapter built and wired
[ ] Phase 9: EntraIdentityProvider adapter built and wired
[ ] Phase 9: AcsNotifier adapter built and wired
[ ] Old Render + Vercel services decommissioned
```

---

## Cost Reference (from proposal)

| Volume | Monthly Cost |
|---|---|
| 300 requests/mo | ~$35 |
| 1,000 requests/mo | ~$107 |
| 5,000 requests/mo | ~$191 |

Start with **Basic B1** App Service + **Burstable B1ms** PostgreSQL. Upgrade tiers only when load justifies it.
