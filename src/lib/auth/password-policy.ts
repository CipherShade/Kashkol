/**
 * Password policy beyond the library's length check.
 *
 * Better Auth performs the hashing and enforces the configured minimum length
 * (10 characters). This module adds the product rules: a small local list of
 * the most common passwords, and a rejection of passwords that simply repeat
 * the account's own name or email local part.
 *
 * The public breached-password list integration is NOT implemented yet. This
 * list is honest about what it is: a local denylist, not a live breach check.
 */

const COMMON_PASSWORDS = new Set([
  "12345678910",
  "1234567890",
  "password123",
  "password1234",
  "qwertyuiop",
  "qwerty12345",
  "1111111111",
  "0000000000",
  "iloveyou123",
  "admin12345",
  "welcome1234",
  "letmein1234",
  "kashkol1234",
  "kashkol2026",
  "changeme123",
  "passw0rd123",
  "abcdefghij",
  "1q2w3e4r5t",
  "egypt12345",
  "cairo12345",
]);

export type PasswordRejection = "tooShort" | "tooLong" | "common" | "containsIdentity";

export type PasswordEvaluation = { ok: true } | { ok: false; reason: PasswordRejection };

export type PasswordIdentity = {
  email?: string;
  name?: string;
};

const MIN_LENGTH = 10;
const MAX_LENGTH = 128;

function identityTokens(identity: PasswordIdentity): string[] {
  const tokens: string[] = [];
  const emailLocal = identity.email?.split("@")[0]?.trim().toLowerCase();
  if (emailLocal && emailLocal.length >= 4) tokens.push(emailLocal);
  for (const part of identity.name?.toLowerCase().split(/\s+/) ?? []) {
    if (part.length >= 4) tokens.push(part);
  }
  return tokens;
}

export function evaluatePassword(
  password: string,
  identity: PasswordIdentity = {},
): PasswordEvaluation {
  if (password.length < MIN_LENGTH) return { ok: false, reason: "tooShort" };
  if (password.length > MAX_LENGTH) return { ok: false, reason: "tooLong" };

  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return { ok: false, reason: "common" };

  for (const token of identityTokens(identity)) {
    if (lower.includes(token)) return { ok: false, reason: "containsIdentity" };
  }

  return { ok: true };
}

export function passwordRejectionKey(reason: PasswordRejection): string {
  return `auth.errors.password.${reason}`;
}

export const PASSWORD_LENGTH = { min: MIN_LENGTH, max: MAX_LENGTH } as const;
