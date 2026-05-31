import type { INotifier, EmailPayload } from '../../Ports/INotifier';

/**
 * LocalNotifier — logs notifications to stdout instead of sending them.
 * Notifications are fire-and-forget; implementations never throw on send failure.
 */
export class LocalNotifier implements INotifier {
  async sendEmail(payload: EmailPayload): Promise<void> {
    console.log(`[LocalNotifier] EMAIL to ${payload.to.join(', ')}: ${payload.subject}`);
  }

  async sendChannelMessage(message: string): Promise<void> {
    console.log(`[LocalNotifier] CHANNEL: ${message}`);
  }
}
