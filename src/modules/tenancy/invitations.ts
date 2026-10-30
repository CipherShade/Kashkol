import { createHash, randomBytes } from "node:crypto";
import {
  INVITATION_RESEND_COOLDOWN_MS,
  INVITATION_TTL_MS,
  type PermissionAction,
  type PermissionResource,
} from "./types";

export type InvitationStatusValue = "pending" | "accepted" | "revoked" | "expired";

export type InvitationStateInput = {
  status: InvitationStatusValue;
  expiresAt: Date;
};

/** The token is 256 bits of CSPRNG output, encoded for a URL. */
export function createInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The database stores only this digest. A stolen database dump therefore does
 * not yield a usable invitation link.
 */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function invitationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITATION_TTL_MS);
}

/**
 * The effective state. `expired` is derived from the clock, so an expired
 * invitation is refused even if no background job has updated the row.
 */
export function invitationState(
  invitation: InvitationStateInput,
  now: Date = new Date(),
): InvitationStatusValue {
  if (invitation.status === "accepted" || invitation.status === "revoked") {
    return invitation.status;
  }
  if (invitation.status === "expired" || invitation.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "pending";
}

export function invitationIsOpen(
  invitation: InvitationStateInput,
  now: Date = new Date(),
): boolean {
  return invitationState(invitation, now) === "pending";
}

/** A resend replaces the token but is rate-limited to one per minute. */
export function canResendInvitation(
  lastSentAt: Date,
  now: Date = new Date(),
): boolean {
  return now.getTime() - lastSentAt.getTime() >= INVITATION_RESEND_COOLDOWN_MS;
}

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The absolute link the invitation email carries. */
export function invitationLink(baseUrl: string, locale: string, token: string): string {
  const origin = baseUrl.replace(/\/+$/, "");
  return `${origin}/${locale}/invite/${encodeURIComponent(token)}`;
}

export type InvitationGrant = {
  resource: PermissionResource;
  action: PermissionAction;
};

/**
 * Parse the permission checkboxes from the invitation form.
 *
 * The client may send anything; the server keeps only grantable keys, so an
 * unknown or owner-only pair is silently impossible to create rather than an
 * error that leaks the taxonomy.
 */
export function parseInvitationGrants(
  values: ReadonlyArray<string>,
  isGrantable: (resource: PermissionResource, action: PermissionAction) => boolean,
): InvitationGrant[] {
  const seen = new Set<string>();
  const grants: InvitationGrant[] = [];
  for (const value of values) {
    const [resource, action, ...rest] = value.split(":");
    if (rest.length > 0 || !resource || !action) continue;
    const key = `${resource}:${action}`;
    if (seen.has(key)) continue;
    if (action !== "read" && action !== "write") continue;
    if (!isGrantable(resource as PermissionResource, action)) continue;
    seen.add(key);
    grants.push({ resource: resource as PermissionResource, action });
  }
  return grants.sort((left, right) =>
    `${left.resource}:${left.action}`.localeCompare(`${right.resource}:${right.action}`),
  );
}
