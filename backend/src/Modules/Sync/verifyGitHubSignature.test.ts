import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyGitHubSignature } from './verifyGitHubSignature.js';

const SECRET = 'super-secret-webhook-key';

function sign(body: Buffer | string, secret = SECRET): string {
  return 'sha256=' + createHmac('sha256', secret).update(typeof body === 'string' ? Buffer.from(body) : body).digest('hex');
}

describe('verifyGitHubSignature', () => {
  it('accepts a correctly signed payload', () => {
    const body = Buffer.from('{"action":"closed","issue":{"number":42}}');
    expect(verifyGitHubSignature(SECRET, body, sign(body))).toBe(true);
  });

  it('rejects a payload signed with a different secret', () => {
    const body = Buffer.from('{"action":"closed"}');
    expect(verifyGitHubSignature(SECRET, body, sign(body, 'wrong-secret'))).toBe(false);
  });

  it('rejects when signature header is missing', () => {
    const body = Buffer.from('{}');
    expect(verifyGitHubSignature(SECRET, body, undefined)).toBe(false);
    expect(verifyGitHubSignature(SECRET, body, null)).toBe(false);
    expect(verifyGitHubSignature(SECRET, body, '')).toBe(false);
  });

  it('rejects when signature header lacks the sha256= prefix', () => {
    const body = Buffer.from('{}');
    const goodHex = createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifyGitHubSignature(SECRET, body, goodHex)).toBe(false);        // no prefix
    expect(verifyGitHubSignature(SECRET, body, 'sha1=' + goodHex)).toBe(false); // wrong prefix
  });

  it('rejects when secret is empty (defence against unset env)', () => {
    const body = Buffer.from('{}');
    expect(verifyGitHubSignature('', body, sign(body, ''))).toBe(false);
  });

  it('rejects when the body has been tampered with after signing', () => {
    const original = Buffer.from('{"action":"closed"}');
    const tampered = Buffer.from('{"action":"opened"}');
    expect(verifyGitHubSignature(SECRET, tampered, sign(original))).toBe(false);
  });

  it('rejects mismatched lengths without timing leak', () => {
    const body = Buffer.from('{}');
    // Crafted shorter "sha256=…" header — must not throw, just return false
    expect(verifyGitHubSignature(SECRET, body, 'sha256=tooshort')).toBe(false);
  });
});
