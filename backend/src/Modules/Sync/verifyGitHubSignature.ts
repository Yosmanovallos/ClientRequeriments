import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify the X-Hub-Signature-256 header GitHub sends with every webhook.
 *
 *   signature := "sha256=" + hex( HMAC-SHA256( secret, rawBody ) )
 *
 * Uses `timingSafeEqual` to prevent timing-attack leakage of the secret.
 * Returns false (never throws) on any malformed or missing input.
 *
 * Reference: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
export function verifyGitHubSignature(
  secret: string,
  rawBody: Buffer,
  signatureHeader: string | undefined | null,
): boolean {
  if (!secret || !signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);

  // timingSafeEqual requires equal-length buffers; bail early on mismatch
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
