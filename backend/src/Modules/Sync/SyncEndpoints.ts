import type { FastifyInstance } from 'fastify';
import type { SyncService } from './SyncService.js';
import { verifyGitHubSignature } from './verifyGitHubSignature.js';
import { verifyBasicAuth }        from './verifyBasicAuth.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export interface GitHubWebhookConfig {
  /** GitHub webhook signing secret (Settings → Webhooks → Secret) */
  webhookSecret: string;
}

export interface AzureDevOpsWebhookConfig {
  /** Basic-auth user configured on the ADO Service Hook subscription */
  user: string;
  /** Basic-auth password configured on the ADO Service Hook subscription */
  pass: string;
}

/**
 * In-memory dedup of GitHub `x-github-delivery` IDs.
 * Bounded to keep memory predictable; on overflow we drop everything (worst case:
 * one duplicate gets processed, which is fine because applyExternalStatus is idempotent).
 *
 * Phase 6: move to an `inbound_events` table for restart-resilient dedup.
 */
const processedDeliveries = new Set<string>();
const MAX_DEDUP_SIZE = 10_000;

function rememberDelivery(id: string): void {
  if (processedDeliveries.size >= MAX_DEDUP_SIZE) processedDeliveries.clear();
  processedDeliveries.add(id);
}

export function registerGitHubWebhook(
  app: FastifyInstance,
  service: SyncService,
  config: GitHubWebhookConfig,
): void {
  app.post('/webhooks/github', async (req, reply) => {
    // 1. Raw body is required for HMAC. If it's missing the JSON parser wasn't wired.
    if (!req.rawBody) {
      req.log.error('Raw body not captured — content-type parser missing');
      return reply.status(500).send({ error: 'server misconfigured' });
    }

    // 2. Verify HMAC. Constant-time comparison inside verifyGitHubSignature.
    const sigHeader = req.headers['x-hub-signature-256'];
    const sigStr    = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    if (!verifyGitHubSignature(config.webhookSecret, req.rawBody, sigStr ?? null)) {
      req.log.warn({ ip: req.ip }, 'GitHub webhook signature verification failed');
      return reply.status(401).send({ error: 'invalid signature' });
    }

    // 3. Dedup on delivery id (best-effort; in-memory)
    const delivery = req.headers['x-github-delivery'];
    const deliveryId = (Array.isArray(delivery) ? delivery[0] : delivery) ?? '';
    if (deliveryId && processedDeliveries.has(deliveryId)) {
      return reply.status(200).send({ status: 'duplicate', deliveryId });
    }
    if (deliveryId) rememberDelivery(deliveryId);

    // 4. Dispatch by event name
    const eventName = (req.headers['x-github-event'] ?? '') as string;
    const body = req.body as Record<string, unknown>;

    if (eventName === 'ping') {
      return reply.status(200).send({ status: 'pong' });
    }

    try {
      if (eventName === 'issues') {
        const result = await service.handleIssueEvent(body as never);
        return reply.status(200).send({ event: 'issues', ...result });
      }
      if (eventName === 'issue_comment') {
        const result = await service.handleCommentEvent(body as never);
        return reply.status(200).send({ event: 'issue_comment', ...result });
      }
      // Unknown event — log + 200 so GitHub doesn't retry forever
      req.log.info({ event: eventName }, 'Unhandled GitHub event');
      return reply.status(200).send({ status: 'ignored', event: eventName });
    } catch (err) {
      // Any handler exception → 500 so GitHub retries. Log full error for debugging.
      req.log.error({ err, event: eventName, deliveryId }, 'Webhook handler threw');
      return reply.status(500).send({ status: 'error', detail: (err as Error).message });
    }
  });
}

/**
 * Azure DevOps Service Hooks webhook. ADO does NOT sign deliveries (no HMAC) — instead the
 * subscription is configured with HTTP Basic auth credentials, which we verify here.
 *
 * Dispatch is by `payload.eventType` (not a header like GitHub). Same delivery-id dedup Set
 * is reused — `payload.id` is a UUID per delivery, can't collide with GitHub's UUIDs.
 */
export function registerAzureDevOpsWebhook(
  app: FastifyInstance,
  service: SyncService,
  config: AzureDevOpsWebhookConfig,
): void {
  app.post('/webhooks/azuredevops', async (req, reply) => {
    // 1. Verify Basic Auth (constant-time inside verifyBasicAuth)
    const authHeader = req.headers['authorization'];
    const authStr    = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (!verifyBasicAuth(authStr ?? null, config.user, config.pass)) {
      req.log.warn({ ip: req.ip }, 'Azure DevOps webhook Basic Auth verification failed');
      return reply.header('WWW-Authenticate', 'Basic realm="azuredevops-webhook"').status(401).send({ error: 'invalid credentials' });
    }

    const body = req.body as Record<string, unknown> & { id?: string; eventType?: string };

    // 2. Dedup on payload.id (UUID per Service Hook delivery)
    const deliveryId = typeof body.id === 'string' ? body.id : '';
    if (deliveryId && processedDeliveries.has(deliveryId)) {
      return reply.status(200).send({ status: 'duplicate', deliveryId });
    }
    if (deliveryId) rememberDelivery(deliveryId);

    // 3. Dispatch by eventType
    const eventType = typeof body.eventType === 'string' ? body.eventType : '';
    try {
      if (eventType === 'workitem.updated') {
        const result = await service.handleAdoWorkItemUpdated(body as never);
        return reply.status(200).send({ event: eventType, ...result });
      }
      if (eventType === 'workitem.commented') {
        const result = await service.handleAdoWorkItemCommented(body as never);
        return reply.status(200).send({ event: eventType, ...result });
      }
      // workitem.created / .deleted / .restored — log and 200 (no retry)
      req.log.info({ event: eventType }, 'Unhandled Azure DevOps event');
      return reply.status(200).send({ status: 'ignored', event: eventType });
    } catch (err) {
      req.log.error({ err, event: eventType, deliveryId }, 'ADO webhook handler threw');
      return reply.status(500).send({ status: 'error', detail: (err as Error).message });
    }
  });
}

/** @deprecated Use `registerGitHubWebhook` directly. Kept temporarily for backward-compat. */
export function registerSyncEndpoints(
  app: FastifyInstance,
  service: SyncService,
  config: { githubWebhookSecret: string },
): void {
  registerGitHubWebhook(app, service, { webhookSecret: config.githubWebhookSecret });
}

/** Test-only: clear the dedup cache between tests. */
export function _clearProcessedDeliveriesForTest(): void {
  processedDeliveries.clear();
}
