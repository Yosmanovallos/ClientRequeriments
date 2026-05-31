import type { IIdentityProvider } from './Ports/IIdentityProvider';
import type { IFileStorage }       from './Ports/IFileStorage';
import type { ITicketSystem }      from './Ports/ITicketSystem';
import type { INotifier }          from './Ports/INotifier';
import type { IClock }             from './Ports/IClock';

import { LocalIdentityProvider }    from './Adapters/Local/LocalIdentityProvider.js';
import { LocalJwtIdentityProvider } from './Adapters/Local/LocalJwtIdentityProvider.js';
import { LocalFileStorage }      from './Adapters/Local/LocalFileStorage.js';
import { LocalTicketSystem }     from './Adapters/Local/LocalTicketSystem.js';
import { LocalNotifier }         from './Adapters/Local/LocalNotifier.js';
import { LocalClock }            from './Adapters/Local/LocalClock.js';
import { SupabaseIdentityProvider } from './Adapters/Supabase/SupabaseIdentityProvider.js';
import { SupabaseFileStorage }     from './Adapters/Supabase/SupabaseFileStorage.js';
import { GitHubIssuesTicketSystem } from './Adapters/GitHub/GitHubIssuesTicketSystem.js';
import { AzureDevOpsTicketSystem }  from './Adapters/Azure/AzureDevOpsTicketSystem.js';
import { SmtpNotifier }             from './Adapters/Smtp/SmtpNotifier.js';
import { SlackNotifier }            from './Adapters/Slack/SlackNotifier.js';
import { TeamsNotifier }            from './Adapters/Teams/TeamsNotifier.js';
import { CompositeNotifier }        from './Adapters/Composite/CompositeNotifier.js';

export interface Container {
  identity:    IIdentityProvider;
  storage:     IFileStorage;
  tickets:     ITicketSystem;
  notifier:    INotifier;
  clock:       IClock;
  /** Set only when AUTH_PROVIDER=local-jwt — used by AuthEndpoints to sign tokens. */
  localJwt?:   LocalJwtIdentityProvider;
}

/**
 * Reads the AUTH_PROVIDER / STORAGE_PROVIDER / TICKETS_PROVIDER / NOTIFY_PROVIDER
 * env vars and returns concrete adapter instances.
 *
 * Migration day = write a new adapter class, add a case here, flip the env var.
 * Business logic (Modules/) never changes.
 */
export function buildContainer(env: NodeJS.ProcessEnv): Container {
  const identityResult = buildIdentity(env);
  return {
    identity:  identityResult.provider,
    storage:   buildStorage(env),
    tickets:   buildTickets(env),
    notifier:  buildNotifier(env),
    clock:     new LocalClock(),
    localJwt:  identityResult.localJwt,
  };
}

// ── per-port factories ──────────────────────────────────────────────────────

type IdentityResult = { provider: IIdentityProvider; localJwt?: LocalJwtIdentityProvider };

function buildIdentity(env: NodeJS.ProcessEnv): IdentityResult {
  switch (env['AUTH_PROVIDER']) {
    case 'local-jwt': {
      const secret = env['LOCAL_JWT_SECRET'];
      if (!secret) throw new Error('AUTH_PROVIDER=local-jwt requires LOCAL_JWT_SECRET');
      const localJwt = new LocalJwtIdentityProvider({ secret });
      return { provider: localJwt, localJwt };
    }
    case 'supabase': {
      const jwtSecret = env['SUPABASE_JWT_SECRET'];
      if (!jwtSecret) {
        throw new Error('AUTH_PROVIDER=supabase requires SUPABASE_JWT_SECRET (Supabase Dashboard → API → JWT Secret)');
      }
      return { provider: new SupabaseIdentityProvider({ jwtSecret, fallbackClientId: env['DEMO_FALLBACK_CLIENT_ID'] }) };
    }
    case 'entra': {
      // Phase 9: return { provider: new EntraIdentityProvider({ tenantId: env.ENTRA_TENANT_ID!, ... }) };
      throw new Error('Entra adapter not yet implemented — set AUTH_PROVIDER=local-jwt or local');
    }
    default:
      return { provider: new LocalIdentityProvider() };
  }
}

function buildStorage(env: NodeJS.ProcessEnv): IFileStorage {
  switch (env['STORAGE_PROVIDER']) {
    case 'supabase': {
      const supabaseUrl    = env['SUPABASE_URL'];
      const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];
      const bucket         = env['SUPABASE_STORAGE_BUCKET'] ?? 'attachments';
      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('STORAGE_PROVIDER=supabase requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
      }
      return new SupabaseFileStorage({ supabaseUrl, serviceRoleKey, bucket });
    }
    case 'azureblob': {
      // Phase 9: const { BlobFileStorage } = require('./Adapters/Azure/BlobFileStorage');
      // return new BlobFileStorage({ connectionString: env.AZURE_STORAGE_CONNECTION_STRING!, container: env.AZURE_STORAGE_CONTAINER! });
      throw new Error('Azure Blob adapter not yet implemented — set STORAGE_PROVIDER=local');
    }
    default:
      return new LocalFileStorage();
  }
}

function buildTickets(env: NodeJS.ProcessEnv): ITicketSystem {
  switch (env['TICKETS_PROVIDER']) {
    case 'github': {
      const token = env['GITHUB_TOKEN'];
      const owner = env['GITHUB_OWNER'];
      const repo  = env['GITHUB_REPO'];
      if (!token || !owner || !repo) {
        throw new Error('TICKETS_PROVIDER=github requires GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO');
      }
      return new GitHubIssuesTicketSystem({ token, owner, repo });
    }
    case 'azuredevops': {
      const org     = env['ADO_ORG'];
      const project = env['ADO_PROJECT'];
      const pat     = env['ADO_PAT'];
      if (!org || !project || !pat) {
        throw new Error('TICKETS_PROVIDER=azuredevops requires ADO_ORG, ADO_PROJECT, ADO_PAT');
      }

      // Optional overrides
      const workItemType = env['ADO_WORK_ITEM_TYPE'];   // defaults to "Task" inside the adapter
      const apiUrl       = env['ADO_API_URL'];          // defaults to https://dev.azure.com (override for ADO Server on-prem)

      // Optional state-map override — JSON: { "DONE": { "state": "Done", "reason": "Completed" }, ... }
      let stateMap: Record<string, { state: string; reason?: string }> | undefined;
      const stateMapJson = env['ADO_STATE_MAP_JSON'];
      if (stateMapJson) {
        try { stateMap = JSON.parse(stateMapJson); }
        catch (err) { throw new Error(`ADO_STATE_MAP_JSON is not valid JSON: ${(err as Error).message}`); }
      }

      return new AzureDevOpsTicketSystem({ org, project, pat, workItemType, apiUrl, stateMap });
    }
    default:
      return new LocalTicketSystem();
  }
}

function buildNotifier(env: NodeJS.ProcessEnv): INotifier {
  switch (env['NOTIFY_PROVIDER']) {
    case 'smtp':
      return buildSmtpFromEnv(env);
    case 'slack':
      return buildSlackFromEnv(env);
    case 'teams':
      return buildTeamsFromEnv(env);
    case 'composite': {
      // Email via SMTP + channel via Teams (preferred) or Slack.
      // Either side may be missing — composite no-ops the absent half.
      const email = env['SMTP_HOST'] && env['NOTIFY_FROM'] ? buildSmtpFromEnv(env) : null;

      let channel: INotifier | null = null;
      if (env['TEAMS_WEBHOOK_URL']) {
        channel = buildTeamsFromEnv(env);
        if (env['SLACK_WEBHOOK_URL']) {
          // Both set — Teams wins; warn so misconfiguration is visible
          console.warn('[AdapterRegistration] Both TEAMS_WEBHOOK_URL and SLACK_WEBHOOK_URL set — using Teams. Unset one to silence this warning.');
        }
      } else if (env['SLACK_WEBHOOK_URL']) {
        channel = buildSlackFromEnv(env);
      }

      if (!email && !channel) {
        throw new Error('NOTIFY_PROVIDER=composite requires at least one of SMTP_HOST/NOTIFY_FROM, TEAMS_WEBHOOK_URL, or SLACK_WEBHOOK_URL');
      }
      return new CompositeNotifier({ email, channel });
    }
    case 'microsoft': {
      // Phase 9 (full Graph API): new MicrosoftNotifier({ tenantId, clientId, clientSecret })
      // — server-to-server OAuth, app permissions Mail.Send + ChannelMessage.Send.
      // For now, NOTIFY_PROVIDER=composite + Outlook SMTP + Teams webhook covers 90% of the value with zero app-registration overhead.
      throw new Error('Microsoft (Graph) adapter not yet implemented — use NOTIFY_PROVIDER=composite with Outlook SMTP + Teams webhook instead');
    }
    default:
      return new LocalNotifier();
  }
}

function buildSmtpFromEnv(env: NodeJS.ProcessEnv) {
  const host = env['SMTP_HOST'];
  const from = env['NOTIFY_FROM'];
  if (!host || !from) {
    throw new Error('SMTP requires SMTP_HOST + NOTIFY_FROM (and usually SMTP_PORT/SMTP_USER/SMTP_PASS)');
  }
  return new SmtpNotifier({
    host,
    port: Number(env['SMTP_PORT'] ?? 587),
    user: env['SMTP_USER'] ?? '',
    pass: env['SMTP_PASS'] ?? '',
    from,
  });
}

function buildSlackFromEnv(env: NodeJS.ProcessEnv) {
  const webhookUrl = env['SLACK_WEBHOOK_URL'];
  if (!webhookUrl) throw new Error('Slack notifier requires SLACK_WEBHOOK_URL');
  return new SlackNotifier({ webhookUrl });
}

function buildTeamsFromEnv(env: NodeJS.ProcessEnv) {
  const webhookUrl = env['TEAMS_WEBHOOK_URL'];
  if (!webhookUrl) throw new Error('Teams notifier requires TEAMS_WEBHOOK_URL (Teams channel → ⋯ → Workflows → "Post to a channel when a webhook request is received")');
  return new TeamsNotifier({ webhookUrl });
}
