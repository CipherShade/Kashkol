import { createHash, randomBytes } from "node:crypto";
import { portalPermissionsSchema, type PortalPermissions } from "./schemas";

/** One-time portal verification links expire after 24 hours (`F17` step 1). */
export const PORTAL_INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

/** Minimum cooldown between resending a portal invitation link. */
export const PORTAL_INVITATION_RESEND_COOLDOWN_MS = 60 * 1000;

export const DEFAULT_PARENT_PERMISSIONS: PortalPermissions = {
  showAttendance: true,
  showGrades: true,
  showHomework: true,
  showResources: true,
  showSchedule: true,
  showNotifications: true,
};

export const DEFAULT_STUDENT_PERMISSIONS: PortalPermissions = {
  showAttendance: true,
  showGrades: true,
  showHomework: true,
  showResources: true,
  showSchedule: true,
  showNotifications: true,
};

export function createPortalInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashPortalInvitationToken(token) };
}

export function hashPortalInvitationToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function normalizePortalEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function portalInvitationExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + PORTAL_INVITATION_TTL_MS);
}

/**
 * Resolve effective portal permissions for a grant or invitation.
 * The payment ledger is never exposed to portals (ADR-0028); there is no
 * permission that grants it, and previously stored `showPayments` values in
 * persisted grant JSON are stripped by the schema parse.
 */
export function resolvePortalPermissions(
  kind: "parent" | "student",
  raw?: unknown,
): PortalPermissions {
  const base = kind === "parent" ? DEFAULT_PARENT_PERMISSIONS : DEFAULT_STUDENT_PERMISSIONS;
  const parsed =
    raw && typeof raw === "object"
      ? portalPermissionsSchema.partial().safeParse(raw)
      : { success: false as const };

  return {
    ...base,
    ...(parsed.success ? parsed.data : {}),
  };
}
