export interface EmailPayload {
  to: string[];
  subject: string;
  htmlBody: string;
}

export interface INotifier {
  /** Send an email notification. Best-effort — implementations MUST NOT throw on transient failure. */
  sendEmail(payload: EmailPayload): Promise<void>;
  /** Post a message to a team channel (Slack/Teams). Best-effort. */
  sendChannelMessage(message: string): Promise<void>;
}
