/**
 * Session lifetime policy from SECURITY_AND_PRIVACY.md §3.2 and `F-P0-02` AC-4.
 *
 * Better Auth owns the sliding `expiresIn` window. The application additionally
 * enforces the 12-hour idle timeout (from `session_activity`) and the 90-day
 * absolute cap (from `session.createdAt`), because neither is expressible as a
 * single value in the library's session configuration.
 */

export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 90 * 24 * 60 * 60 * 1000;
export const SESSION_SLIDING_DAYS = 30;

export type SessionPolicyInput = {
  createdAt: Date;
  lastSeenAt: Date;
  now: Date;
};

export type SessionPolicyResult = { valid: true } | { valid: false; reason: "idle" | "absolute" };

export function evaluateSessionPolicy({
  createdAt,
  lastSeenAt,
  now,
}: SessionPolicyInput): SessionPolicyResult {
  if (now.getTime() - createdAt.getTime() >= SESSION_ABSOLUTE_MS) {
    return { valid: false, reason: "absolute" };
  }
  if (now.getTime() - lastSeenAt.getTime() >= SESSION_IDLE_MS) {
    return { valid: false, reason: "idle" };
  }
  return { valid: true };
}

/** Activity is written at most once a minute, not on every request. */
export const SESSION_ACTIVITY_TOUCH_MS = 60 * 1000;
