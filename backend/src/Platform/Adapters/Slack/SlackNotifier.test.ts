import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SlackNotifier } from './SlackNotifier.js';

const WEBHOOK_URL = 'https://hooks.slack.com/services/T000/B000/XXX';

describe('SlackNotifier', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  describe('constructor', () => {
    it('throws when webhookUrl is missing', () => {
      expect(() => new SlackNotifier({ webhookUrl: '' })).toThrow(/webhookUrl is required/);
    });
  });

  describe('sendChannelMessage()', () => {
    it('POSTs to the webhook with { text } body', async () => {
      fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
      const notifier = new SlackNotifier({ webhookUrl: WEBHOOK_URL });

      await notifier.sendChannelMessage('📋 New request CBLPBR-630');

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(WEBHOOK_URL);
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body)).toEqual({ text: '📋 New request CBLPBR-630' });
    });

    it('does nothing when message is empty', async () => {
      const notifier = new SlackNotifier({ webhookUrl: WEBHOOK_URL });
      await notifier.sendChannelMessage('');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does NOT throw when Slack returns 4xx (best-effort)', async () => {
      fetchMock.mockResolvedValueOnce(new Response('invalid_token', { status: 403 }));
      const notifier = new SlackNotifier({ webhookUrl: WEBHOOK_URL });

      await expect(notifier.sendChannelMessage('hi')).resolves.toBeUndefined();
    });

    it('does NOT throw when fetch rejects (network failure)', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ENOTFOUND'));
      const notifier = new SlackNotifier({ webhookUrl: WEBHOOK_URL });

      await expect(notifier.sendChannelMessage('hi')).resolves.toBeUndefined();
    });

    it('does NOT throw on 500 (Slack outage)', async () => {
      fetchMock.mockResolvedValueOnce(new Response('server_error', { status: 500 }));
      const notifier = new SlackNotifier({ webhookUrl: WEBHOOK_URL });

      await expect(notifier.sendChannelMessage('hi')).resolves.toBeUndefined();
    });
  });

  describe('sendEmail()', () => {
    it('is a no-op (does not call fetch)', async () => {
      const notifier = new SlackNotifier({ webhookUrl: WEBHOOK_URL });
      await expect(
        notifier.sendEmail({ to: ['a@b.com'], subject: 's', htmlBody: 'b' })
      ).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
