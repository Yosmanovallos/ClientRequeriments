import { describe, it, expect, vi } from 'vitest';
import { CompositeNotifier } from './CompositeNotifier.js';
import type { INotifier, EmailPayload } from '../../Ports/INotifier.js';

function makeMockNotifier(): INotifier & { sendEmail: ReturnType<typeof vi.fn>; sendChannelMessage: ReturnType<typeof vi.fn> } {
  return {
    sendEmail:          vi.fn(async () => undefined),
    sendChannelMessage: vi.fn(async () => undefined),
  };
}

const PAYLOAD: EmailPayload = { to: ['a@b.com'], subject: 's', htmlBody: 'b' };

describe('CompositeNotifier', () => {
  it('routes sendEmail to the email delegate only', async () => {
    const email   = makeMockNotifier();
    const channel = makeMockNotifier();
    const c = new CompositeNotifier({ email, channel });

    await c.sendEmail(PAYLOAD);

    expect(email.sendEmail).toHaveBeenCalledWith(PAYLOAD);
    expect(channel.sendEmail).not.toHaveBeenCalled();
    expect(channel.sendChannelMessage).not.toHaveBeenCalled();
  });

  it('routes sendChannelMessage to the channel delegate only', async () => {
    const email   = makeMockNotifier();
    const channel = makeMockNotifier();
    const c = new CompositeNotifier({ email, channel });

    await c.sendChannelMessage('hello');

    expect(channel.sendChannelMessage).toHaveBeenCalledWith('hello');
    expect(email.sendChannelMessage).not.toHaveBeenCalled();
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('no-ops sendEmail when email delegate is null', async () => {
    const channel = makeMockNotifier();
    const c = new CompositeNotifier({ email: null, channel });
    await expect(c.sendEmail(PAYLOAD)).resolves.toBeUndefined();
    expect(channel.sendChannelMessage).not.toHaveBeenCalled();
  });

  it('no-ops sendChannelMessage when channel delegate is null', async () => {
    const email = makeMockNotifier();
    const c = new CompositeNotifier({ email, channel: null });
    await expect(c.sendChannelMessage('x')).resolves.toBeUndefined();
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('handles fully empty configuration (both delegates null)', async () => {
    const c = new CompositeNotifier({});
    await expect(c.sendEmail(PAYLOAD)).resolves.toBeUndefined();
    await expect(c.sendChannelMessage('x')).resolves.toBeUndefined();
  });
});
