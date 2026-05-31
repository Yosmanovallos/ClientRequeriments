import type { INotifier, EmailPayload } from '../../Ports/INotifier.js';

/**
 * Microsoft Teams notifier — posts to a channel via a Teams **Workflow** webhook
 * ("Post to a channel when a webhook request is received" template).
 *
 * This is the modern free replacement for legacy "Incoming Webhooks" (which Microsoft
 * is retiring) and crucially does NOT require Power Automate Premium.
 *
 * Payload shape: Adaptive Card wrapped in a Teams `message` envelope.
 * The Workflow connector requires this exact structure — plain `{ text: ... }` is rejected.
 *
 * Reference: https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/cards-reference
 *
 * Best-effort: every transport error is logged and swallowed; this adapter NEVER throws.
 * `sendEmail` is a no-op; pair with SmtpNotifier via CompositeNotifier for both channels.
 */

export interface TeamsConfig {
  webhookUrl: string;
}

export class TeamsNotifier implements INotifier {
  constructor(private readonly config: TeamsConfig) {
    if (!config.webhookUrl) throw new Error('TeamsNotifier: webhookUrl is required (set TEAMS_WEBHOOK_URL)');
  }

  async sendEmail(_payload: EmailPayload): Promise<void> {
    // Intentional no-op — email belongs to SmtpNotifier / CompositeNotifier.
  }

  async sendChannelMessage(message: string): Promise<void> {
    if (!message) return;
    try {
      const body = {
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl:  null,
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type:    'AdaptiveCard',
            version: '1.4',
            body: [{
              type: 'TextBlock',
              text: message,
              wrap: true,
            }],
          },
        }],
      };

      const res = await fetch(this.config.webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        // Teams Workflow returns plain text on error (e.g. "Invalid webhook URL")
        const text = await res.text().catch(() => '');
        console.error(`[TeamsNotifier] webhook returned ${res.status}: ${text}`);
      }
    } catch (err) {
      console.error('[TeamsNotifier] sendChannelMessage failed (non-fatal):', (err as Error).message);
    }
  }
}
