import crypto from "node:crypto";

/**
 * Verify the `X-Hub-Signature-256` header produced by Meta.
 *
 * The signature is the hex HMAC-SHA256 of the exact request body, keyed with
 * the Meta app secret. Comparing fixed-length digests in constant time avoids
 * leaking how many leading bytes matched.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const providedHex = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(providedHex)) return false;

  const provided = Buffer.from(providedHex, "hex");
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest();

  return provided.byteLength === expected.byteLength && crypto.timingSafeEqual(provided, expected);
}

/**
 * Verify Meta's `hub.mode` / `hub.verify_token` / `hub.challenge` handshake.
 *
 * Returns the challenge only when every value is present and the token matches
 * in constant time. A missing configuration can never be satisfied by an
 * attacker-supplied token.
 */
export function verifyMetaWebhookChallenge(
  searchParams: URLSearchParams,
  expectedToken: string | undefined,
): string | null {
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !challenge || !expectedToken || !token) return null;

  const supplied = Buffer.from(token);
  const expected = Buffer.from(expectedToken);
  if (supplied.byteLength !== expected.byteLength) return null;

  return crypto.timingSafeEqual(supplied, expected) ? challenge : null;
}
