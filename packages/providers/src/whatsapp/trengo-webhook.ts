import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify Trengo webhook signature using HMAC-SHA256.
 *
 * @param rawBody - Raw request body as string or Buffer
 * @param signature - The signature header value from Trengo
 * @param secret - TRENGO_WEBHOOK_SECRET
 * @returns true if the signature is valid
 */
export function verifyTrengoSignature(
  rawBody: string | Buffer,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expected, 'utf8'),
    );
  } catch {
    return false;
  }
}
