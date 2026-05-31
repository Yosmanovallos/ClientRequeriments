import nodemailer, { type Transporter } from 'nodemailer';
import type { INotifier, EmailPayload } from '../../Ports/INotifier.js';

/**
 * SMTP-based email notifier (Resend, SendGrid, Mailgun, Amazon SES, or plain SMTP).
 *
 * All SMTP-specific knowledge (transport options, retry semantics, error mapping)
 * lives in THIS file. Modules/ never sees nodemailer.
 *
 * Best-effort guarantee (per INotifier contract):
 *   sendEmail() catches all transport errors and logs them — never throws.
 *   A flaky email server must not fail a request submission.
 *
 * `sendChannelMessage` is a no-op; pair this with SlackNotifier via CompositeNotifier
 * when you need both channels.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  /** Defaults to true for port 465, false otherwise (STARTTLS). */
  secure?: boolean;
}

export class SmtpNotifier implements INotifier {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    if (!config.host) throw new Error('SmtpNotifier: host is required');
    if (!config.from) throw new Error('SmtpNotifier: from is required');

    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host:   config.host,
      port:   config.port,
      secure: config.secure ?? config.port === 465,
      auth:   config.user || config.pass ? { user: config.user, pass: config.pass } : undefined,
    });
  }

  async sendEmail(payload: EmailPayload): Promise<void> {
    if (payload.to.length === 0) return;   // nothing to do
    try {
      await this.transporter.sendMail({
        from:    this.from,
        to:      payload.to.join(', '),
        subject: payload.subject,
        html:    payload.htmlBody,
      });
    } catch (err) {
      // Best-effort: log and continue. Returns void either way.
      console.error('[SmtpNotifier] sendEmail failed (non-fatal):', (err as Error).message);
    }
  }

  async sendChannelMessage(_message: string): Promise<void> {
    // Intentional no-op — channel delivery belongs to SlackNotifier / CompositeNotifier.
  }
}
