import type { INotifier, EmailPayload } from '../../Ports/INotifier.js';

/**
 * Slack incoming-webhook notifier. Uses native fetch — no @slack/web-api SDK.
 *
 * Webhook URL format: https://hooks.slack.com/services/T.../B.../X...
 * Payload: { "text": "..." } (simplest form; Block Kit is overkill for status pings)
 *
 * Best-effort guarantee — every error is logged and swallowed; sendChannelMessage never throws.
 * `sendEmail` is a no-op; pair with SmtpNotifier via CompositeNotifier for both channels.
 */

export interface SlackConfig {
  webhookUrl: string;
}

export class SlackNotifier implements INotifier {
  constructor(private readonly config: SlackConfig) {
    if (!config.webhookUrl) throw new Error('SlackNotifier: webhookUrl is required (set SLACK_WEBHOOK_URL)');
  }

  async sendEmail(_payload: EmailPayload): Promise<void> {
    // Intentional no-op — email belongs to SmtpNotifier / CompositeNotifier.
  }

  async sendChannelMessage(message: string): Promise<void> {
    if (!message) return;
    try {
      const res = await fetch(this.config.webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: message }),
      });
      if (!res.ok) {
        // Slack returns plain text on errors (e.g. "no_service") — log it for debugging
        const text = await res.text().catch(() => '');
        console.error(`[SlackNotifier] webhook returned ${res.status}: ${text}`);
      }
    } catch (err) {
      console.error('[SlackNotifier] sendChannelMessage failed (non-fatal):', (err as Error).message);
    }
  }
}
