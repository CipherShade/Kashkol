import { AppError } from "@/lib/http/errors";

/**
 * A same-origin check for mutating server actions and route handlers.
 *
 * Next.js already validates the Origin header for server actions. This is the
 * explicit application-level check the security specification requires, so the
 * rule is visible and unit-tested rather than implicit in framework behaviour.
 *
 * A missing Origin header is accepted only because non-browser callers (health
 * probes, tests, server-to-server requests) do not send one; they cannot ride a
 * victim's cookies, which is what the cookie SameSite protection covers.
 */
export function assertTrustedOrigin(headers: Headers, baseUrl: string): void {
  const origin = headers.get("origin");
  if (!origin) return;

  let allowed: string;
  try {
    allowed = new URL(baseUrl).origin;
  } catch {
    throw new AppError("INTERNAL");
  }

  if (origin !== allowed) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.originRejected" });
  }
}

/**
 * A stable, non-secret fingerprint of the client address for audit records.
 * The raw address is never stored in the tenant-visible audit log.
 */
export function firstForwardedIp(headers: Headers): string | null {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return null;
  // Only a single-value header is trusted; a comma-separated chain is
  // client-controlled on the left and is not used here (SECURITY §3.3).
  return forwarded.includes(",") ? null : forwarded.trim();
}
