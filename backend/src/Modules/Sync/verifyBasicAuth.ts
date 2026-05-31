import { timingSafeEqual } from 'node:crypto';

/**
 * Verify an HTTP Basic Auth header against expected credentials.
 *
 * Used by the ADO Service Hooks webhook — ADO does NOT sign deliveries with HMAC
 * (like GitHub does); instead its subscriptions support an HTTP basic-auth user+pass
 * configured on the subscription itself. That credential pair is our trust boundary.
 *
 * Uses `timingSafeEqual` to prevent timing-attack leakage of the secret.
 * Returns false (never throws) on any malformed or missing input.
 */
export function verifyBasicAuth(
  authHeader: string | undefined | null,
  expectedUser: string,
  expectedPass: string,
): boolean {
  if (!expectedUser || !expectedPass) return false;
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }

  // RFC 7617: format is `user:pass` — the colon is the separator, password may contain colons
  const colon = decoded.indexOf(':');
  if (colon < 0) return false;

  const user = decoded.slice(0, colon);
  const pass = decoded.slice(colon + 1);

  // Build buffers of identical length on each side so timingSafeEqual doesn't throw.
  const userOk = constantTimeEqual(user, expectedUser);
  const passOk = constantTimeEqual(pass, expectedPass);
  return userOk && passOk;
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // If lengths differ, pad with zeros so we still do a constant-time compare,
  // then assert lengths matched. This avoids leaking length via early-return.
  const max = Math.max(ab.length, bb.length);
  const ap = Buffer.alloc(max); ab.copy(ap);
  const bp = Buffer.alloc(max); bb.copy(bp);
  const same = timingSafeEqual(ap, bp);
  return same && ab.length === bb.length;
}
