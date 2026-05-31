import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TeamsNotifier } from './TeamsNotifier.js';

const WEBHOOK_URL =
  'https://prod-12.westus.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?sig=xyz';

describe('TeamsNotifier', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  describe('constructor', () => {
    it('throws when webhookUrl is missing', () => {
      expect(() => new TeamsNotifier({ webhookUrl: '' })).toThrow(/webhookUrl is required/);
    });
  });

  describe('sendChannelMessage()', () => {
    it('POSTs an Adaptive Card wrapped in a Teams message envelope', async () => {
      fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
      const notifier = new TeamsNotifier({ webhookUrl: WEBHOOK_URL });

      await notifier.sendChannelMessage('📋 New request CBLPBR-630');

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(WEBHOOK_URL);
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(init.body);
      // Top-level message envelope
      expect(body.type).toBe('message');
      expect(body.attachments).toHaveLength(1);
      // Attachment is an Adaptive Card
      const att = body.attachments[0];
      expect(att.contentType).toBe('application/vnd.microsoft.card.adaptive');
      expect(att.contentUrl).toBeNull();
      // Card body has a TextBlock with our message
      expect(att.content.type).toBe('AdaptiveCard');
      expect(att.content.version).toBe('1.4');
      expect(att.content.body[0]).toMatchObject({
        type: 'TextBlock',
        text: '📋 New request CBLPBR-630',
        wrap: true,
      });
    });

    it('does nothing when message is empty', async () => {
      const notifier = new TeamsNotifier({ webhookUrl: WEBHOOK_URL });
      await notifier.sendChannelMessage('');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does NOT throw when Teams returns 4xx (best-effort)', async () => {
      fetchMock.mockResolvedValueOnce(new Response('Invalid webhook URL', { status: 400 }));
      const notifier = new TeamsNotifier({ webhookUrl: WEBHOOK_URL });

      await expect(notifier.sendChannelMessage('hi')).resolves.toBeUndefined();
    });

    it('does NOT throw when fetch rejects (network failure)', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ENOTFOUND'));
      const notifier = new TeamsNotifier({ webhookUrl: WEBHOOK_URL });

      await expect(notifier.sendChannelMessage('hi')).resolves.toBeUndefined();
    });

    it('does NOT throw on 500 (workflow service outage)', async () => {
      fetchMock.mockResolvedValueOnce(new Response('server_error', { status: 503 }));
      const notifier = new TeamsNotifier({ webhookUrl: WEBHOOK_URL });

      await expect(notifier.sendChannelMessage('hi')).resolves.toBeUndefined();
    });

    it('escapes special characters by relying on JSON.stringify (no HTML/markdown injection)', async () => {
      fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
      const notifier = new TeamsNotifier({ webhookUrl: WEBHOOK_URL });
      const evilMessage = 'test\n<script>alert(1)</script> & "quotes" \\ backslash';

      await notifier.sendChannelMessage(evilMessage);

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body.attachments[0].content.body[0].text).toBe(evilMessage);  // text preserved as-is, JSON encoding handled
    });
  });

  describe('sendEmail()', () => {
    it('is a no-op (does not call fetch)', async () => {
      const notifier = new TeamsNotifier({ webhookUrl: WEBHOOK_URL });
      await expect(
        notifier.sendEmail({ to: ['a@b.com'], subject: 's', htmlBody: 'b' })
      ).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
