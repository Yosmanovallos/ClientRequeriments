import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock nodemailer BEFORE importing the adapter
const sendMail = vi.fn();
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail })),
  },
}));

import { SmtpNotifier } from './SmtpNotifier.js';

const CONFIG = {
  host: 'smtp.resend.com',
  port: 465,
  user: 'resend',
  pass: 'test-api-key',
  from: 'noreply@portal.example',
};

describe('SmtpNotifier', () => {
  beforeEach(() => { sendMail.mockReset(); });

  describe('constructor', () => {
    it('throws when host is missing', () => {
      expect(() => new SmtpNotifier({ ...CONFIG, host: '' })).toThrow(/host is required/);
    });
    it('throws when from is missing', () => {
      expect(() => new SmtpNotifier({ ...CONFIG, from: '' })).toThrow(/from is required/);
    });
  });

  describe('sendEmail()', () => {
    it('calls nodemailer.sendMail with from/to/subject/html', async () => {
      sendMail.mockResolvedValueOnce({ messageId: '<x@y>' });
      const notifier = new SmtpNotifier(CONFIG);

      await notifier.sendEmail({
        to:       ['user@example.com', 'team@example.com'],
        subject:  'Test subject',
        htmlBody: '<p>hello</p>',
      });

      expect(sendMail).toHaveBeenCalledOnce();
      expect(sendMail).toHaveBeenCalledWith({
        from:    'noreply@portal.example',
        to:      'user@example.com, team@example.com',
        subject: 'Test subject',
        html:    '<p>hello</p>',
      });
    });

    it('does nothing when recipient list is empty', async () => {
      const notifier = new SmtpNotifier(CONFIG);
      await notifier.sendEmail({ to: [], subject: 's', htmlBody: 'b' });
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('does NOT throw when nodemailer fails (best-effort guarantee)', async () => {
      sendMail.mockRejectedValueOnce(new Error('connection refused'));
      const notifier = new SmtpNotifier(CONFIG);

      // The KEY test: must resolve, not reject
      await expect(
        notifier.sendEmail({ to: ['a@b.com'], subject: 's', htmlBody: 'b' })
      ).resolves.toBeUndefined();
    });

    it('does NOT throw when nodemailer throws synchronously', async () => {
      sendMail.mockImplementationOnce(() => { throw new Error('sync boom'); });
      const notifier = new SmtpNotifier(CONFIG);

      await expect(
        notifier.sendEmail({ to: ['a@b.com'], subject: 's', htmlBody: 'b' })
      ).resolves.toBeUndefined();
    });
  });

  describe('sendChannelMessage()', () => {
    it('is a no-op (resolves without calling sendMail)', async () => {
      const notifier = new SmtpNotifier(CONFIG);
      await expect(notifier.sendChannelMessage('anything')).resolves.toBeUndefined();
      expect(sendMail).not.toHaveBeenCalled();
    });
  });
});
