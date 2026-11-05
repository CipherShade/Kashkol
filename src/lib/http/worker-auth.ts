import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of a `Bearer` token used by background workers.
 *
 * A missing token, a malformed header, or a different byte length fails before
 * `timingSafeEqual` is called (it throws on length mismatch).
 */
export function hasValidWorkerBearerToken(
  authorization: string | null,
  token: string | undefined,
): boolean {
  if (!token || !authorization?.startsWith("Bearer ")) return false;

  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(token);
  return supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected);
}
