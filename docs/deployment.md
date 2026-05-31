# Deployment Guide — Render + Vercel + GitHub Actions

End-to-end production deploy: free tier on every service, deploy in ~30 minutes total.

## Architecture

```
   User browser
        │
        ▼
   ┌─────────────────────┐
   │  Vercel (frontend)  │ ← your-app.vercel.app
   │  Static Vite build  │
   └──────────┬──────────┘
              │ /api/* rewrite (vercel.json)
              ▼
   ┌─────────────────────┐
   │  Render (backend)   │ ← clientrequirements-api.onrender.com
   │  Docker, Node 20    │
   └──────┬──────┬───────┘
          │      │
          ▼      ▼
   ┌──────────┐ ┌──────────┐
   │ Postgres │ │ Supabase │
   │ (Neon)   │ │ Storage  │
   └──────────┘ └──────────┘
```

- **Vercel** serves the Vite static bundle + rewrites `/api/*` to Render
- **Render** runs the Dockerfile — auto-applies Prisma migrations on boot
- **Neon** (or Supabase) Postgres for the database
- **GitHub Actions** runs CI on every PR + a post-deploy smoke test on every main push

---

## Prerequisites

You need free accounts at:
- **GitHub** — your repo is here
- **Neon** — https://console.neon.tech (no credit card)
- **Render** — https://render.com (no credit card for the free tier)
- **Vercel** — https://vercel.com (no credit card)
- *(Optional)* **Supabase** — for auth + storage, if not staying in local/demo mode

---

## Step 1 — Postgres on Neon (5 min)

1. https://console.neon.tech → **New project** → pick region close to where Render runs (Oregon for `us-west`, Frankfurt for `eu-central`)
2. **Connection Details** → copy the pooled URL:
   ```
   postgresql://user:pwd@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
3. Locally, drop into `backend/.env` and run:
   ```bash
   cd backend && npm run db:setup
   ```
   This runs `prisma migrate deploy` + the seed script against the live Neon DB. Verify in **Neon Tables** view that the 7 tables exist + the demo client is there.

---

## Step 2 — Backend on Render (10 min)

1. https://render.com → **New + → Web Service**
2. Connect your GitHub repo
3. Render auto-detects `render.yaml` at the repo root and pre-fills the form. Confirm:
   - **Runtime**: Docker
   - **Branch**: main
   - **Root Directory**: `backend`
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Plan**: Free (or Starter $7/mo for always-on)
4. Click **Create Web Service**. First build takes ~3-5 minutes.
5. While it builds, set the secret env vars in **Environment** tab:

   | Key | Value | Required when |
   |---|---|---|
   | `DATABASE_URL` | the Neon URL from step 1 | always |
   | `CORS_ORIGIN` | `https://your-app.vercel.app` | after step 3 (Vercel) — update later |

   Then provider-specific vars as you wire each integration (see the values you've already populated locally in `backend/.env`):

   | Integration | Set when you enable | Keys |
   |---|---|---|
   | Supabase Auth | `AUTH_PROVIDER=supabase` | `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `DEMO_FALLBACK_CLIENT_ID` |
   | Supabase Storage | `STORAGE_PROVIDER=supabase` | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` |
   | GitHub Issues | `TICKETS_PROVIDER=github` | `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_WEBHOOK_SECRET` |
   | Azure DevOps | `TICKETS_PROVIDER=azuredevops` | `ADO_ORG`, `ADO_PROJECT`, `ADO_PAT`, `ADO_WORK_ITEM_TYPE`, `ADO_WEBHOOK_USER`, `ADO_WEBHOOK_PASS` |
   | Outlook + Teams | `NOTIFY_PROVIDER=composite` | `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS` (app password), `NOTIFY_FROM`, `TEAMS_WEBHOOK_URL` |

6. After deploy completes, grab the URL — e.g. `https://clientrequirements-backend.onrender.com`. Hit `/health`:
   ```
   curl https://clientrequirements-backend.onrender.com/health
   → {"status":"ok","ts":"...","db":"prisma"}
   ```
   If `db: "prisma"` shows up, the migration ran and Prisma client connected. ✅

---

## Step 3 — Frontend on Vercel (5 min)

1. https://vercel.com → **Add New → Project** → import the same GitHub repo
2. **Configure Project**:
   - **Framework Preset**: Vite (auto-detected)
   - **Root Directory**: `frontend`
   - Leave other build settings as defaults — `vercel.json` overrides what's needed
3. **Environment Variables** (build-time, baked into the bundle):
   - `VITE_API_URL` — leave **empty** (Vercel's rewrite forwards `/api/*` to the backend)
   - `VITE_SUPABASE_URL` — only if using real auth
   - `VITE_SUPABASE_ANON_KEY` — only if using real auth
4. Click **Deploy**. First build ~1 min.
5. Copy the URL — e.g. `https://clientrequirements.vercel.app`
6. **Important**: edit `frontend/vercel.json` and replace the placeholder destination:
   ```json
   "destination": "https://YOUR-RENDER-APP.onrender.com/$1"
   ```
   with your actual Render URL. Commit + push — Vercel redeploys automatically.
7. Also update `CORS_ORIGIN` in Render to your Vercel URL.

---

## Step 4 — GitHub Actions secrets (3 min)

1. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
2. Add:
   - `BACKEND_URL` = `https://your-render-app.onrender.com`
   - `FRONTEND_URL` = `https://your-app.vercel.app`
3. CI (`.github/workflows/ci.yml`) runs automatically on every PR + main push.
4. Deploy smoke (`.github/workflows/deploy.yml`) runs after CI passes — sleeps 90s for Render/Vercel to redeploy, then hits `/health` and `/api/health` to verify.

---

## Step 5 — Smoke test live (2 min)

```bash
# Backend health
curl https://your-render-app.onrender.com/health
# → {"status":"ok","db":"prisma"}

# Frontend serves
curl -I https://your-app.vercel.app/
# → HTTP/2 200

# Proxy works
curl https://your-app.vercel.app/api/health
# → {"status":"ok","db":"prisma"}

# Create a request via the proxy (replace TOKEN with a real Supabase JWT or 'demo' if AUTH_PROVIDER=local)
curl -X POST https://your-app.vercel.app/api/requests \
  -H "Authorization: Bearer demo" \
  -H "Content-Type: application/json" \
  -d '{"requestType":"new_report","title":"Live smoke","priority":"Medium","payload":{}}'
# → {"reference":"CBLPBR-630",...}
```

Open `https://your-app.vercel.app` in a browser — log in, submit a form, see the request appear in My Requests.

---

## Things to know about the free tiers

| Service | Limit | What it means |
|---|---|---|
| Render Free | Web service sleeps after 15 min idle | First request after idle = ~30-50s cold start. Upgrade to Starter ($7/mo) for always-on. |
| Vercel Hobby | 100 GB bandwidth/mo, unlimited builds | Plenty for an internal portal. Static assets are free. |
| Neon Free | 0.5 GB storage, scale-to-zero after 5 min idle | Wakes in ~1s on first query. 10 named branches included. |
| Supabase Free | 500 MB DB, 1 GB storage, **pauses after 7 days idle** | If using Supabase Postgres instead of Neon, schedule a cron to wake it (or upgrade to Pro). |
| GitHub Actions | 2000 min/mo on private repos, unlimited on public | Our CI is ~2 min per push → ~1000 pushes/mo. |

---

## Rollback

Both Render and Vercel keep deploy history. If a bad commit lands on main:
- **Vercel** → Deployments → click any previous build → **Promote to Production**
- **Render** → Deploys → click any previous deploy → **Redeploy**

For DB rollbacks (rare, only if a migration corrupts data):
- Neon has **point-in-time restore** on the free plan (last 7 days)
- Test risky migrations on a Neon branch first

---

## Migrating to Azure (Phase 9)

Same pattern, different platforms — no business-logic changes:
- **Frontend**: Azure Static Web Apps (replaces Vercel)
- **Backend**: Azure App Service for Containers (same Dockerfile, replaces Render)
- **DB**: Azure SQL or Azure Database for PostgreSQL (replaces Neon — see "Switching to Azure SQL" in `environments.md`)
- **Storage**: Azure Blob (replaces Supabase Storage — adapter swap, env var flip)
- **Tickets**: Azure DevOps (already wired — flip `TICKETS_PROVIDER=azuredevops`)
- **CI/CD**: GitHub Actions still works → can be migrated to Azure DevOps Pipelines if desired
