import type { INotifier, EmailPayload } from '../../Ports/INotifier';

/**
 * LocalNotifier — logs notifications to stdout instead of sending them.
 * Notifications are fire-and-forget; implementations never throw on send failure.
 */
export class LocalNotifier implements INotifier {
  async sendEmail(payload: EmailPayload): Promise<void> {
    // Extract any URLs from the HTML body so reset/confirm links are visible in dev
    const links = payload.htmlBody?.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    console.log(`\n[LocalNotifier] ── EMAIL ──────────────────────────────────`);
    console.log(`  To:      ${payload.to.join(', ')}`);
    console.log(`  Subject: ${payload.subject}`);
    if (links.length) console.log(`  Links:\n${links.map(l => `    ${l}`).join('\n')}`);
    console.log(`────────────────────────────────────────────────────────\n`);
  }

  async sendChannelMessage(message: string): Promise<void> {
    console.log(`[LocalNotifier] CHANNEL: ${message}`);
  }
}
