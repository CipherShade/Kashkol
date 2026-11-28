import { findUserPhone, upsertUserPhone } from "./repository";
import { completePhoneSchema } from "./schemas";

/**
 * Accounts created on or after this instant must have a phone (ADR-0052).
 * Earlier accounts are grandfathered and keep working: the requirement is not
 * retroactive. The instant is the migration that introduced `user_phone`.
 */
export const REQUIRED_PHONE_AFTER = new Date("2026-11-28T05:00:00.000Z");

export function phoneIsRequired(createdAt: Date | string | null | undefined): boolean {
  if (!createdAt) return false;
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return !Number.isNaN(created.getTime()) && created >= REQUIRED_PHONE_AFTER;
}

/** Validate an untrusted phone value without ever returning the raw input. */
export function normalizeTeacherPhone(value: unknown): string | null {
  const parsed = completePhoneSchema.safeParse({ phone: value });
  return parsed.success ? parsed.data.phone : null;
}

/** True when a signed-in staff account satisfies the phone requirement. */
export async function staffHasRequiredPhone(
  userId: string,
  createdAt: Date | string | null | undefined,
): Promise<boolean> {
  if (!phoneIsRequired(createdAt)) return true;
  return (await findUserPhone(userId)) !== null;
}

/**
 * Persist a new account's phone. The user id comes from a verified session or
 * from the successful account creation response, never from a form field.
 */
export async function saveTeacherPhone(userId: string, rawPhone: string): Promise<string> {
  const parsed = completePhoneSchema.parse({ phone: rawPhone });
  await upsertUserPhone(userId, parsed.phone);
  return parsed.phone;
}
