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
  portalSignInFailed: "auth.portal_sign_in_failed",
  portalSignedIn: "auth.portal_signed_in",
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

/**
 * A student signs in with a phone number, not an email. The phone is hashed
 * with a `portal:` namespace before it reaches `auth_event`, so the table
 * cannot be used to discover which phone numbers have accounts.
 */
function portalIdentifier(phone: string): string {
  return `portal:${phone}`;
}

export async function isPortalPhoneLocked(
  phone: string,
  now: Date = new Date(),
): Promise<boolean> {
  const secret = getServerEnv().BETTER_AUTH_SECRET;
  const failures = await countAuthEventsSince(
    hashIdentifier(portalIdentifier(phone), secret),
    AUTH_EVENTS.portalSignInFailed,
    new Date(now.getTime() - LOCKOUT_WINDOW_MS),
  );
  return failures >= LOCKOUT_MAX_FAILURES;
}

export async function recordPortalSignInFailure(
  phone: string,
  context: { requestId: string; ipHash: string | null; userAgentHash: string | null },
  now: Date = new Date(),
): Promise<void> {
  const secret = getServerEnv().BETTER_AUTH_SECRET;
  await insertAuthEvent({
    identifierHash: hashIdentifier(portalIdentifier(phone), secret),
    event: AUTH_EVENTS.portalSignInFailed,
    requestId: context.requestId,
    ipHash: context.ipHash,
    userAgentHash: context.userAgentHash,
    createdAt: now,
  });
}

export async function recordPortalSignInSuccess(
  phone: string,
  userId: string,
  context: { requestId: string; ipHash: string | null; userAgentHash: string | null },
  now: Date = new Date(),
): Promise<void> {
  const secret = getServerEnv().BETTER_AUTH_SECRET;
  await insertAuthEvent({
    userId,
    identifierHash: hashIdentifier(portalIdentifier(phone), secret),
    event: AUTH_EVENTS.portalSignedIn,
    requestId: context.requestId,
    ipHash: context.ipHash,
    userAgentHash: context.userAgentHash,
    createdAt: now,
  });
}
