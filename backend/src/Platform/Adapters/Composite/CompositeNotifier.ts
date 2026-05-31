import type { INotifier, EmailPayload } from '../../Ports/INotifier.js';

/**
 * Combines two INotifier instances — typically SmtpNotifier (email) + SlackNotifier (channel).
 *
 * Why this pattern: the INotifier port has BOTH email and channel methods, but real-world
 * delivery for each is a different service. Rather than split the port (premature
 * generalisation), we let each adapter no-op the method it doesn't own and combine them here.
 *
 * Either argument can be null/undefined — the matching method becomes a no-op.
 * This means you can run SMTP-only or Slack-only without writing a new adapter class.
 *
 * Best-effort inherited from delegates — they swallow their own errors.
 */

export interface CompositeConfig {
  email?:   INotifier | null;
  channel?: INotifier | null;
}

export class CompositeNotifier implements INotifier {
  constructor(private readonly delegates: CompositeConfig) {}

  async sendEmail(payload: EmailPayload): Promise<void> {
    if (this.delegates.email) await this.delegates.email.sendEmail(payload);
  }

  async sendChannelMessage(message: string): Promise<void> {
    if (this.delegates.channel) await this.delegates.channel.sendChannelMessage(message);
  }
}
