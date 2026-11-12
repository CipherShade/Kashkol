import { randomInt } from "node:crypto";
import { normalizePhoneNumber } from "@/modules/students/schemas";

/**
 * The teacher-generated student password alphabet.
 *
 * Ambiguous glyphs (`0/O`, `1/I/L`) are excluded so a password can be read
 * aloud or copied from a printed card without a transcription error. Eight
 * random characters from a 31-character alphabet give roughly 40 bits of
 * entropy; the sign-in path is rate-limited and locked out per phone number.
 */
const PORTAL_PASSWORD_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** `KSH-XXXX-XXXX` is 12 characters, above Better Auth's 10-character floor. */
export const PORTAL_PASSWORD_LENGTH = 8;
export const PORTAL_PASSWORD_PREFIX = "KSH";

export function generatePortalPassword(): string {
  let body = "";
  for (let index = 0; index < PORTAL_PASSWORD_LENGTH; index++) {
    body += PORTAL_PASSWORD_ALPHABET[randomInt(PORTAL_PASSWORD_ALPHABET.length)];
  }
  return `${PORTAL_PASSWORD_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

/**
 * The Better Auth `user.email` for a teacher-provisioned student.
 *
 * The value is synthetic and non-deliverable (`.invalid` is reserved by
 * RFC 2606), globally unique, and never shown to the student. Sign-in uses the
 * phone number, not this address.
 */
export function portalUsernameEmail(portalUserId: string): string {
  return `student-${portalUserId}@students.kashkol.invalid`;
}

/** Normalise a typed phone number to the portal username, or reject it. */
export function normalizePortalPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return normalizePhoneNumber(raw);
}


