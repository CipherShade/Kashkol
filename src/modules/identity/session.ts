import { headers } from "next/headers";
import { getAuth } from "@/lib/auth/auth";
import { evaluateSessionPolicy, SESSION_ACTIVITY_TOUCH_MS } from "@/lib/auth/session-policy";
import { AppError } from "@/lib/http/errors";
import type { Permission } from "@/modules/tenancy/types";
import { permissionKey, type MemberRole, type Scope } from "@/modules/tenancy/types";
import {
  deleteSessionById,
  findActiveMemberships,
  findActivePortalGrants,
  findGrantedPermissions,
  findPortalStudentProjection,
  findSessionActivity,
  findStudentInWorkspace,
  findWorkspaceState,
  touchSessionActivity,
  type PortalGrantRow,
} from "./repository";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

export type StaffSession = {
  user: AuthUser;
  sessionId: string;
  scope: Scope;
};

export type StaffGate =
  | { state: "anonymous" }
  | { state: "no_workspace"; user: AuthUser; sessionId: string }
  | { state: "staff"; user: AuthUser; sessionId: string; scope: Scope };

export type PortalContext = {
  userId: string;
  grants: PortalGrantRow[];
  /** Distinct workspaces in which this user has a live portal link. */
  workspaceIds: string[];
  /** The only student records this session may ever address. */
  studentIds: Set<string>;
};

/**
 * Resolve the Better Auth session and apply the application session policy.
 *
 * The sliding 30-day window is Better Auth's. The 12-hour idle timeout and the
 * 90-day absolute cap are enforced here; an expired session is deleted from the
 * database before the request fails, so clearing the cookie is not the only
 * effect of expiry.
 */
export async function getVerifiedSession(requestHeaders?: Headers) {
  const auth = getAuth();
  const result = await auth.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });
  if (!result) return null;

  const now = new Date();
  const activity = await findSessionActivity(result.session.id);
  const lastSeenAt = activity?.lastSeenAt ?? result.session.updatedAt;
  const policy = evaluateSessionPolicy({
    createdAt: result.session.createdAt,
    lastSeenAt,
    now,
  });

  if (!policy.valid) {
    await deleteSessionById(result.session.id);
    throw new AppError("UNAUTHORIZED", { messageKey: "errors.sessionExpired" });
  }

  if (!activity || now.getTime() - activity.lastSeenAt.getTime() >= SESSION_ACTIVITY_TOUCH_MS) {
    try {
      await touchSessionActivity(result.session.id, now);
    } catch {
      // A failed activity write must not lock a valid user out of the product.
      console.error("[auth] session activity could not be recorded");
    }
  }

  return result;
}

export async function getOptionalUser(): Promise<AuthUser | null> {
  const result = await getVerifiedSession();
  return result ? toAuthUser(result.user) : null;
}

function toAuthUser(user: {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}): AuthUser {
  return { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified };
}

/**
 * Resolve the tenant scope from the session.
 *
 * The workspace id is never read from a URL, a body, or a header. It comes from
 * a membership row that the self-read policy can only expose for the signed-in
 * user. A portal-only account gets a `FORBIDDEN`, not a scope.
 */
export async function getStaffGate(requestHeaders?: Headers): Promise<StaffGate> {
  const result = await getVerifiedSession(requestHeaders);
  if (!result) return { state: "anonymous" };

  const user = toAuthUser(result.user);
  const sessionId = result.session.id;
  const memberships = await findActiveMemberships(user.id);

  if (memberships.length === 0) {
    const grants = await findActivePortalGrants(user.id, new Date());
    if (grants.length > 0) {
      throw new AppError("FORBIDDEN", { messageKey: "errors.portalActor" });
    }
    return { state: "no_workspace", user, sessionId };
  }

  // P1 has exactly one active workspace. M2 adds explicit switching; until
  // then the earliest active membership is the only one used.
  const membership = memberships[0];
  const workspace = await findWorkspaceState(membership.workspaceId);
  if (!workspace || workspace.status !== "active") {
    throw new AppError("FORBIDDEN", { messageKey: "errors.workspaceInactive" });
  }

  const grants = await findGrantedPermissions(membership.workspaceId, membership.id);
  const permissions = new Set<Permission>(
    grants.map((grant) => permissionKey(grant.resource, grant.action)),
  );

  const scope: Scope = {
    workspaceId: membership.workspaceId,
    actorUserId: user.id,
    actorDisplayName: user.name,
    role: membership.role as MemberRole,
    permissions,
  };

  return { state: "staff", user, sessionId, scope };
}

/** Server-side guard used by every private route and server action. */
export async function requireStaffSession(): Promise<StaffSession> {
  const gate = await getStaffGate();
  if (gate.state === "anonymous") {
    throw new AppError("UNAUTHORIZED");
  }
  if (gate.state === "no_workspace") {
    throw new AppError("FORBIDDEN", { messageKey: "errors.noWorkspace" });
  }
  return { user: gate.user, sessionId: gate.sessionId, scope: gate.scope };
}

export async function requireStaffScope(): Promise<Scope> {
  return (await requireStaffSession()).scope;
}

/**
 * Resolve a portal actor's links. A portal context is a *different type* from a
 * staff `Scope`: it cannot be passed to a tenancy service by accident, and it
 * carries no workspace-wide permission set.
 */
export async function getPortalContext(requestHeaders?: Headers): Promise<PortalContext> {
  const result = await getVerifiedSession(requestHeaders);
  if (!result) throw new AppError("UNAUTHORIZED");

  const userId = result.user.id;
  const grants = await findActivePortalGrants(userId, new Date());
  if (grants.length === 0) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.notPortalActor" });
  }

  return {
    userId,
    grants,
    workspaceIds: [...new Set(grants.map((grant) => grant.workspaceId))],
    studentIds: new Set(grants.map((grant) => grant.studentId)),
  };
}

/**
 * The single portal authorisation check.
 *
 * A linked student returns a projection. A student that exists in a workspace
 * the portal user is linked into, but is not one of their students, returns
 * `403` (the link is missing). An unknown or foreign id returns `404`, so the
 * portal cannot be used to discover whether a student exists elsewhere.
 */
export async function resolvePortalStudent(portal: PortalContext, studentId: string) {
  const grant = portal.grants.find((candidate) => candidate.studentId === studentId);
  if (grant) {
    const projection = await findPortalStudentProjection(grant.workspaceId, studentId);
    if (!projection) throw new AppError("NOT_FOUND");
    return { grant, student: projection };
  }

  for (const workspaceId of portal.workspaceIds) {
    const exists = await findStudentInWorkspace(workspaceId, studentId);
    if (exists) {
      throw new AppError("FORBIDDEN", { messageKey: "errors.notLinked" });
    }
  }

  throw new AppError("NOT_FOUND");
}
