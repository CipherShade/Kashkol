import { getServerEnv } from "@/lib/config/env";
import { hashIdentifier } from "./hash";
import { countAuthEventsSince, insertAuthEvent } from "./repository";

export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_MAX_FAILURES = 5;

export const AUTH_EVENTS = {
  signedUp: "auth.signed_up",
  signedIn: "auth.signed_in",
  signedOut: "auth.signed_out",
  signInFailed: "auth.sign_in_failed",
  lockedOut: "auth.lockout",
  verificationSent: "auth.verification_sent",
  emailVerified: "auth.email_verified",
  resetRequested: "auth.reset_requested",
  passwordReset: "auth.password_reset",
  signUpThrottled: "auth.sign_up_throttled",
} as const;

/**
 * Account-level lockout: five failures for the same identifier in fifteen
 * minutes. The identifier is hashed, so the table cannot be used to discover
 * which email addresses have accounts, and the caller always returns the same
 * generic message.
 */
export async function isAccountLocked(email: string, now: Date = new Date()): Promise<boolean> {
  const secret = getServerEnv().BETTER_AUTH_SECRET;
  const failures = await countAuthEventsSince(
    hashIdentifier(email, secret),
    AUTH_EVENTS.signInFailed,
    new Date(now.getTime() - LOCKOUT_WINDOW_MS),
  );
  return failures >= LOCKOUT_MAX_FAILURES;
}

export async function recordSignInFailure(
  email: string,
  context: { requestId: string; ipHash: string | null; userAgentHash: string | null },
  now: Date = new Date(),
): Promise<void> {
  const secret = getServerEnv().BETTER_AUTH_SECRET;
  await insertAuthEvent({
    identifierHash: hashIdentifier(email, secret),
    event: AUTH_EVENTS.signInFailed,
    requestId: context.requestId,
    ipHash: context.ipHash,
    userAgentHash: context.userAgentHash,
    createdAt: now,
  });
}
