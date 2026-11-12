import { AppError } from "@/lib/http/errors";

export const PERMISSION_RESOURCES = [
  "students",
  "portal_access",
  "grades",
  "groups",
  "sessions",
  "attendance",
  "homework",
  "files",
  "messages",
  "payments",
  "exports",
  "integrations",
  "settings",
  "team",
  "audit",
  "forms",
] as const;

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];
export type PermissionAction = "read" | "write";
export type Permission = `${PermissionResource}:${PermissionAction}`;
export type MemberRole = "owner" | "assistant";

export const GRANTABLE_ACTIONS: Record<PermissionResource, readonly PermissionAction[]> = {
  students: ["read", "write"],
  portal_access: ["read", "write"],
  grades: ["read", "write"],
  groups: ["read", "write"],
  sessions: ["read", "write"],
  attendance: ["read", "write"],
  homework: ["read", "write"],
  files: ["read", "write"],
  messages: ["read", "write"],
  payments: ["read", "write"],
  exports: ["read", "write"],
  integrations: ["read", "write"],
  settings: ["read", "write"],
  team: ["read"],
  audit: ["read"],
  forms: ["read", "write"],
};

/**
 * Capabilities that expose money, personal data, or the workspace boundary.
 *
 * The permission editor marks these explicitly so a teacher cannot grant one by
 * accident. The warning is presentation only: the server still enforces the
 * grant, and the owner can revoke it at any time.
 */
export const SENSITIVE_PERMISSIONS: ReadonlySet<Permission> = new Set([
  "students:read",
  "students:write",
  "portal_access:read",
  "portal_access:write",
  "grades:read",
  "grades:write",
  "sessions:read",
  "attendance:read",
  "attendance:write",
  "files:read",
  "files:write",
  "messages:read",
  "messages:write",
  "payments:read",
  "payments:write",
  "exports:read",
  "exports:write",
  "integrations:write",
  "settings:write",
  "audit:read",
  "forms:read",
  "forms:write",
]);

/** The safe default for a newly invited assistant: no grants at all. */
export const DEFAULT_INVITATION_GRANTS: ReadonlyArray<{
  resource: PermissionResource;
  action: PermissionAction;
}> = [];

/** An invitation link is valid for seven days (`F-P2-01`). */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A resend replaces the old token and is limited to once per minute. */
export const INVITATION_RESEND_COOLDOWN_MS = 60_000;

/**
 * Actions an assistant can never perform, even if a grant row exists.
 *
 * The owner role is the only role that can invite, remove, or change another
 * member (`F-P2-01` AC-5). `settings:write` and `payments:write` are ordinary
 * grantable permissions; billing is not modelled here and is not delegated.
 */
const ASSISTANT_ALWAYS_DENIED: ReadonlySet<Permission> = new Set(["team:write"]);

/**
 * The scope handed to every service function. `workspaceId` comes from the
 * session, never from a route parameter, a body field, or a header.
 */
export type Scope = {
  workspaceId: string;
  actorUserId: string;
  actorDisplayName: string;
  role: MemberRole;
  permissions: ReadonlySet<Permission>;
};

export function permissionKey(resource: PermissionResource, action: PermissionAction): Permission {
  return `${resource}:${action}`;
}

export function isAllowed(
  scope: Scope,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  if (scope.role === "owner") return true;
  const key = permissionKey(resource, action);
  if (ASSISTANT_ALWAYS_DENIED.has(key)) return false;
  return scope.permissions.has(key);
}

/**
 * Authorisation runs before any query. A denial is a typed FORBIDDEN error,
 * not `null`: "not allowed" must be distinguishable from "not found" on the
 * server, while both map to a non-leaking response.
 */
export function authorize(
  scope: Scope,
  resource: PermissionResource,
  action: PermissionAction,
): void {
  if (!isAllowed(scope, resource, action)) {
    throw new AppError("FORBIDDEN");
  }
}

/**
 * Owner-only operations are a small explicit set, not a permission string that
 * an assistant could hold. This is checked before any data is read.
 */
export function assertOwner(scope: Scope): void {
  if (scope.role !== "owner") {
    throw new AppError("FORBIDDEN", { messageKey: "errors.ownerOnly" });
  }
}

export function assertGrantable(resource: PermissionResource, action: PermissionAction): void {
  if (!isGrantable(resource, action)) {
    throw new AppError("VALIDATION_FAILED", { messageKey: "errors.permissionNotGrantable" });
  }
}

export function isGrantable(resource: PermissionResource, action: PermissionAction): boolean {
  return GRANTABLE_ACTIONS[resource]?.includes(action) ?? false;
}

export function isSensitivePermission(
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  return SENSITIVE_PERMISSIONS.has(permissionKey(resource, action));
}

/** Every grant the editor can offer, sorted by resource then action. */
export function grantablePermissions(): Array<{
  resource: PermissionResource;
  action: PermissionAction;
}> {
  return PERMISSION_RESOURCES.flatMap((resource) =>
    GRANTABLE_ACTIONS[resource].map((action) => ({ resource, action })),
  );
}
