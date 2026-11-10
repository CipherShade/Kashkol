/**
 * Small TTL cache used by the session attendance scanner to dedupe QR re-reads:
 * the camera decodes the same printed code on every frame, and without a
 * suppression window the UI would POST the scan once per frame.
 *
 * This is a UX throttle only — the server enforces its own atomic
 * duplicate-scan rejection (409), so losing the cache never corrupts data.
 */
export class RecentTokenCache {
  private readonly entries = new Map<string, number>();
  private readonly windowMs: number;

  constructor(windowMs = 4000) {
    this.windowMs = windowMs;
  }

  /** True when the token should be processed; stamps the token as seen otherwise. */
  accept(token: string, now: number = Date.now()): boolean {
    this.prune(now);
    const seenAt = this.entries.get(token);
    if (seenAt !== undefined && now - seenAt < this.windowMs) {
      return false;
    }
    this.entries.set(token, now);
    return true;
  }

  /** Forget a token (e.g. after it was explicitly revoked or rotated). */
  forget(token: string): void {
    this.entries.delete(token);
  }

  private prune(now: number): void {
    for (const [token, seenAt] of this.entries) {
      if (now - seenAt >= this.windowMs) this.entries.delete(token);
    }
  }
}
