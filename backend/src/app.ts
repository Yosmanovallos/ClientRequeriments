import Fastify         from 'fastify';
import cors            from '@fastify/cors';
import multipart       from '@fastify/multipart';
import rateLimit       from '@fastify/rate-limit';
import { buildContainer }             from './Platform/AdapterRegistration.js';
import { authMiddleware }             from './Shared/auth.js';
import { problemJsonHandler }         from './Shared/errors.js';
import { loggerOptions }              from './Shared/logging.js';
import { isDbConfigured, getPrismaClient } from './Shared/db.js';
import { registerRequestsEndpoints }  from './Modules/Requests/RequestsEndpoints.js';
import { registerCommentsEndpoints }  from './Modules/Comments/CommentsEndpoints.js';
import { registerAttachmentsEndpoints } from './Modules/Attachments/AttachmentsEndpoints.js';
import { registerGitHubWebhook, registerAzureDevOpsWebhook } from './Modules/Sync/SyncEndpoints.js';
import { registerAuthEndpoints } from './Modules/Auth/AuthEndpoints.js';
import { SyncService }                from './Modules/Sync/SyncService.js';
import { RequestsService }            from './Modules/Requests/RequestsService.js';
import { CommentsService }            from './Modules/Comments/CommentsService.js';
import { InMemoryRequestsRepository } from './Modules/Requests/RequestsRepository.js';
import { PrismaRequestsRepository }   from './Modules/Requests/PrismaRequestsRepository.js';
import { InMemoryCommentsRepository, PrismaCommentsRepository } from './Modules/Comments/CommentsRepository.js';
import { InMemoryAttachmentsRepository, PrismaAttachmentsRepository } from './Modules/Attachments/AttachmentsRepository.js';
import { MAX_UPLOAD_BYTES }           from './Modules/Attachments/Attachment.js';
import { InMemoryUserRepository, PrismaUserRepository } from './Modules/IAM/UserRepository.js';
import { InMemoryProjectRepository, PrismaProjectRepository } from './Modules/IAM/ProjectRepository.js';
import { registerProjectEndpoints } from './Modules/IAM/ProjectEndpoints.js';
import { registerUserEndpoints } from './Modules/IAM/UserEndpoints.js';
import { InMemoryFormTemplateRepository, PrismaFormTemplateRepository } from './Modules/FormTemplates/FormTemplateRepository.js';
import { registerFormTemplateEndpoints } from './Modules/FormTemplates/FormTemplateEndpoints.js';
import { seedStandardTemplates } from './Modules/FormTemplates/standardTemplates.js';
import { InMemoryOrganizationRepository, PrismaOrganizationRepository } from './Modules/Organizations/OrganizationRepository.js';
import { registerOrganizationEndpoints } from './Modules/Organizations/OrganizationEndpoints.js';
import type { IRequestsRepository }     from './Modules/Requests/RequestsRepository.js';
import type { ICommentsRepository }     from './Modules/Comments/CommentsRepository.js';
import type { IAttachmentsRepository }  from './Modules/Attachments/AttachmentsRepository.js';
import type { IUserRepository }         from './Modules/IAM/UserRepository.js';
import type { IProjectRepository }      from './Modules/IAM/ProjectRepository.js';
import type { IFormTemplateRepository } from './Modules/FormTemplates/FormTemplateRepository.js';
import type { IOrganizationRepository } from './Modules/Organizations/OrganizationRepository.js';

async function main() {
  const app = Fastify({ logger: loggerOptions() as any });

  // ── Raw-body capture for HMAC verification (Sync endpoints) ──────────────
  // We replace Fastify's default JSON parser to keep the raw bytes around as `req.rawBody`.
  // Other routes ignore it; webhook handlers use it for signature verification.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body: Buffer, done) => {
    (req as { rawBody?: Buffer }).rawBody = body;
    if (body.length === 0) return done(null, undefined);
    try { done(null, JSON.parse(body.toString('utf8'))); }
    catch (err) { done(err as Error, undefined); }
  });

  // ── Repository selection ─────────────────────────────────────────────────
  // Prisma when DATABASE_URL is set, InMemory otherwise.
  // The endpoints accept I*Repository interfaces — they don't care which.
  let requestsRepo:    IRequestsRepository;
  let commentsRepo:    ICommentsRepository;
  let attachmentsRepo: IAttachmentsRepository;
  let userRepo:        IUserRepository;
  let projectRepo:     IProjectRepository;
  let templateRepo:    IFormTemplateRepository;
  let orgRepo:         IOrganizationRepository;
  if (isDbConfigured()) {
    const prisma     = getPrismaClient();
    requestsRepo     = new PrismaRequestsRepository(prisma);
    commentsRepo     = new PrismaCommentsRepository(prisma);
    attachmentsRepo  = new PrismaAttachmentsRepository(prisma);
    userRepo         = new PrismaUserRepository(prisma);
    projectRepo      = new PrismaProjectRepository(prisma);
    templateRepo     = new PrismaFormTemplateRepository(prisma);
    orgRepo          = new PrismaOrganizationRepository(prisma);
    app.log.info('Using Prisma repositories (DATABASE_URL set)');
  } else {
    requestsRepo     = new InMemoryRequestsRepository();
    commentsRepo     = new InMemoryCommentsRepository();
    attachmentsRepo  = new InMemoryAttachmentsRepository();
    userRepo         = new InMemoryUserRepository();
    projectRepo      = new InMemoryProjectRepository();
    templateRepo     = new InMemoryFormTemplateRepository();
    orgRepo          = new InMemoryOrganizationRepository();
    app.log.warn('Using InMemory repositories (DATABASE_URL not set — data will be lost on restart)');
  }

  // Seed standard form templates for the demo client on every boot (idempotent).
  // In production, run this once per real client via a migration / admin tool.
  const DEMO_CLIENT_ID = '00000000-0000-0000-0000-000000000001';
  try {
    const { created } = await seedStandardTemplates(DEMO_CLIENT_ID, templateRepo);
    if (created > 0) app.log.info(`Seeded ${created} standard form templates for demo client`);
  } catch (err) {
    app.log.warn({ err }, 'Standard template seeding skipped (DB may not be migrated yet)');
  }

  // Multipart for file uploads (Attachments module). limits apply per-file.
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  // Rate limiting (Bug #7 fix) — 100 req/min per IP by default.
  // Routes can opt into a stricter or laxer limit via { config: { rateLimit: {...} } } on each handler.
  // We bypass /health so platform liveness probes don't get throttled.
  await app.register(rateLimit, {
    max:        100,
    timeWindow: '1 minute',
    allowList:  (req: { url: string }) => req.url === '/health',
    addHeaders: {
      'x-ratelimit-limit':     true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset':     true,
    },
    errorResponseBuilder: (_req: unknown, ctx: { after: string }) => ({
      type:   'https://clientrequirements.provana.com/errors/rate_limited',
      title:  'RATE_LIMITED',
      status: 429,
      detail: `Too many requests. Retry after ${ctx.after}.`,
    }),
  });

  // CORS — CORS_ORIGIN=* allows any origin (dev/staging); set to exact domain in production
  const corsOrigin = process.env['CORS_ORIGIN'] || 'http://localhost:5173';
  await app.register(cors, {
    origin: corsOrigin === '*' ? true : corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Dependency container (reads AUTH_PROVIDER / TICKETS_PROVIDER / etc. from env)
  const container = buildContainer(process.env);

  // Auth middleware — verifies the token + enriches the request with role + project IDs
  // from the PortalUser table. Auto-provisions PENDING users on first sign-in.
  app.addHook('preHandler', authMiddleware(container.identity, userRepo));

  // Error handler — problem+json (RFC 9457)
  app.setErrorHandler(problemJsonHandler as any);

  // Health check (no auth — listed in PUBLIC_PATHS in auth.ts)
  app.get('/health', async () => ({
    status: 'ok',
    ts: new Date().toISOString(),
    db: isDbConfigured() ? 'prisma' : 'in-memory',
  }));

  // Module routes
  registerRequestsEndpoints(app, container, requestsRepo, orgRepo, templateRepo, projectRepo);
  registerCommentsEndpoints(app, container, commentsRepo, requestsRepo);
  registerAttachmentsEndpoints(app, container, attachmentsRepo, requestsRepo);
  registerProjectEndpoints(app, projectRepo, container.tickets);
  registerUserEndpoints(app, userRepo, projectRepo);
  registerFormTemplateEndpoints(app, templateRepo, projectRepo);
  registerOrganizationEndpoints(app, orgRepo, userRepo, projectRepo);

  // Local JWT auth endpoints — only active when AUTH_PROVIDER=local-jwt
  if (container.localJwt && isDbConfigured()) {
    const prisma = getPrismaClient();
    registerAuthEndpoints(app, {
      prisma,
      userRepo,
      jwt:             container.localJwt,
      notifier:        container.notifier,
      defaultClientId: process.env['DEMO_FALLBACK_CLIENT_ID'] ?? '00000000-0000-0000-0000-000000000001',
      frontendUrl:     process.env['FRONTEND_URL'] ?? 'http://localhost:5173',
    });
    app.log.info('Local JWT auth endpoints registered → POST /auth/register, POST /auth/login, POST /auth/forgot-password, POST /auth/reset-password');
  }

  // Sync endpoints (inbound webhooks) — each registered only when its credentials are set,
  // because each route exists only to receive authenticated deliveries.
  const githubWebhookSecret = process.env['GITHUB_WEBHOOK_SECRET'];
  const adoWebhookUser      = process.env['ADO_WEBHOOK_USER'];
  const adoWebhookPass      = process.env['ADO_WEBHOOK_PASS'];
  const adoConfigured       = !!(adoWebhookUser && adoWebhookPass);

  if (githubWebhookSecret || adoConfigured) {
    const requestsSvc = new RequestsService({
      repo: requestsRepo, tickets: container.tickets, notifier: container.notifier, clock: container.clock,
    });
    const commentsSvc = new CommentsService({
      comments:  commentsRepo,
      requests:  requestsRepo,
      tickets:   container.tickets,
      sanitizer: container.sanitizer,
      storage:   container.storage,
      notifier:  container.notifier,
    });
    const syncSvc = new SyncService({ requests: requestsSvc, comments: commentsSvc });

    if (githubWebhookSecret) {
      registerGitHubWebhook(app, syncSvc, { webhookSecret: githubWebhookSecret });
      app.log.info('GitHub webhook endpoint registered → POST /webhooks/github');
    }
    if (adoConfigured) {
      registerAzureDevOpsWebhook(app, syncSvc, { user: adoWebhookUser!, pass: adoWebhookPass! });
      app.log.info('Azure DevOps webhook endpoint registered → POST /webhooks/azuredevops');
    }
  } else {
    app.log.info('No webhook secrets set — /webhooks/* routes not registered (set GITHUB_WEBHOOK_SECRET or ADO_WEBHOOK_USER+PASS)');
  }

  // Start
  const port = Number(process.env['PORT'] || 4000);
  const host = process.env['HOST'] || '0.0.0.0';
  await app.listen({ port, host });
  app.log.info(`Backend running → http://localhost:${port}`);
}

main().catch(err => { console.error(err); process.exit(1); });
