import { describe, it, expect } from 'vitest';
import { verifyBasicAuth } from './verifyBasicAuth.js';

const USER = 'webhook-user';
const PASS = 'webhook-password-very-secret';

/** Helper: build an `Authorization: Basic ...` header value */
function basicHeader(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

describe('verifyBasicAuth', () => {
  it('accepts correct credentials', () => {
    expect(verifyBasicAuth(basicHeader(USER, PASS), USER, PASS)).toBe(true);
  });

  it('rejects wrong password', () => {
    expect(verifyBasicAuth(basicHeader(USER, 'wrong'), USER, PASS)).toBe(false);
  });

  it('rejects wrong user', () => {
    expect(verifyBasicAuth(basicHeader('wrong', PASS), USER, PASS)).toBe(false);
  });

  it('rejects missing or empty header', () => {
    expect(verifyBasicAuth(undefined, USER, PASS)).toBe(false);
    expect(verifyBasicAuth(null,      USER, PASS)).toBe(false);
    expect(verifyBasicAuth('',        USER, PASS)).toBe(false);
  });

  it('rejects when scheme is not Basic', () => {
    const credsB64 = Buffer.from(`${USER}:${PASS}`).toString('base64');
    expect(verifyBasicAuth(`Bearer ${credsB64}`,  USER, PASS)).toBe(false);
    expect(verifyBasicAuth(`Digest ${credsB64}`,  USER, PASS)).toBe(false);
  });

  it('rejects when payload is not valid base64 (no exception)', () => {
    // Buffer.from with base64 is forgiving — it just ignores non-base64 chars. The decoded
    // string still won't have a colon, so we reject for that reason.
    expect(verifyBasicAuth('Basic this-is-not-base64', USER, PASS)).toBe(false);
  });

  it('rejects when decoded payload has no colon (malformed)', () => {
    const noColon = Buffer.from('nocolonhere').toString('base64');
    expect(verifyBasicAuth(`Basic ${noColon}`, USER, PASS)).toBe(false);
  });

  it('rejects when expected creds are empty (defence against unset env)', () => {
    expect(verifyBasicAuth(basicHeader(USER, PASS), '', PASS)).toBe(false);
    expect(verifyBasicAuth(basicHeader(USER, PASS), USER, '')).toBe(false);
  });

  it('correctly handles passwords containing colons', () => {
    const tricky = 'pass:with:colons';
    expect(verifyBasicAuth(basicHeader(USER, tricky), USER, tricky)).toBe(true);
    // Wrong password is still rejected even though it also contains colons
    expect(verifyBasicAuth(basicHeader(USER, 'wrong:with:colons'), USER, tricky)).toBe(false);
  });

  it('runs in constant time across length differences (does not throw)', () => {
    // The helper pads buffers before timingSafeEqual; ensure no throw on length mismatches
    expect(() => verifyBasicAuth(basicHeader('a', 'b'),     USER, PASS)).not.toThrow();
    expect(() => verifyBasicAuth(basicHeader('a'.repeat(100), 'b'.repeat(100)), USER, PASS)).not.toThrow();
  });
});
