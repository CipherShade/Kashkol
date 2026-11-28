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
 *
 * Additional origins must be exact origins set by the operator in
 * `BETTER_AUTH_TRUSTED_ORIGINS`. Wildcards and URL paths are rejected: a broad
 * suffix rule would let any third party host a tunnel and pass the check.
 */
export function assertTrustedOrigin(
  headers: Headers,
  baseUrl: string,
  trustedOrigins: string | readonly string[] = process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "",
): void {
  const origin = headers.get("origin");
  if (!origin) return;

  let allowed: string;
  try {
    allowed = new URL(baseUrl).origin;
  } catch {
    throw new AppError("INTERNAL");
  }
  if (origin === allowed) return;

  for (const configuredOrigin of exactTrustedOrigins(trustedOrigins)) {
    if (configuredOrigin === origin) return;
  }

  throw new AppError("FORBIDDEN", { messageKey: "errors.originRejected" });
}

/**
 * Return only exact origins from an operator-supplied list. Wildcards, paths,
 * and malformed values are ignored rather than trusted.
 */
export function exactTrustedOrigins(values: string | readonly string[]): string[] {
  const entries = typeof values === "string" ? values.split(",") : values;
  const output: string[] = [];
  for (const entry of entries) {
    const value = entry.trim();
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (parsed.origin === value) output.push(parsed.origin);
    } catch {
      // An invalid configured origin is never trusted.
    }
  }
  return output;
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
