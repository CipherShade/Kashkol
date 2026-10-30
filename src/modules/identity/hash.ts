import { createHmac } from "node:crypto";

/**
 * Keyed fingerprints for security logs. An email address or IP address is
 * never written to `auth_event` or `audit_event`; a truncated HMAC is enough to
 * group attempts without storing the identifier itself.
 */
export function fingerprint(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex").slice(0, 32);
}

export function hashIdentifier(email: string, secret: string): string {
  return fingerprint(email.trim().toLowerCase(), secret);
}

export function hashIp(ip: string | null, secret: string): string | null {
  if (!ip) return null;
  return fingerprint(ip.trim(), secret);
}
