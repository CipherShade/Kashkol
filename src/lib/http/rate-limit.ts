import { NextRequest } from "next/server";
import { AppError } from "@/lib/http/errors";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitRecord>();

// Clean expired records periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (now > record.resetAt) {
      memoryStore.delete(key);
    }
  }
}, 60_000).unref?.();

/**
 * Extract client IP address from request headers.
 */
export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const ips = xff.split(",").map((ip) => ip.trim());
    if (ips[0]) return ips[0];
  }
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();

  return "127.0.0.1";
}

/**
 * Enforce rate limit for a request. Throws AppError("RATE_LIMITED") if exceeded.
 *
 * @param key Unique key for rate limiting (e.g., `public_submit:${formId}:${ip}`)
 * @param maxHits Maximum requests allowed in the window
 * @param windowMs Window duration in milliseconds (default 1 minute)
 */
export function assertRateLimit(
  key: string,
  maxHits: number,
  windowMs: number = 60_000,
): void {
  const now = Date.now();
  const record = memoryStore.get(key);

  if (!record || now > record.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (record.count >= maxHits) {
    throw new AppError("RATE_LIMITED", { messageKey: "errors.rateLimited" });
  }

  record.count += 1;
}
