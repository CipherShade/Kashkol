import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import { withScope, withUserScope } from "@/lib/db/scope";

export type MembershipRow = {
  id: string;
  workspaceId: string;
  role: "owner" | "assistant";
  joinedAt: Date;
};

/** The signed-in user's own active memberships. SELECT-only self policy. */
export async function findActiveMemberships(userId: string): Promise<MembershipRow[]> {
  return withUserScope(userId, (tx) =>
    tx.workspaceMember.findMany({
      where: { userId, status: "active" },
      select: { id: true, workspaceId: true, role: true, joinedAt: true },
      orderBy: { joinedAt: "asc" },
    }),
  );
}

export async function findGrantedPermissions(workspaceId: string, memberId: string) {
  return withScope({ workspaceId }, (tx) =>
    tx.permissionGrant.findMany({
      where: { workspaceId, memberId },
      select: { resource: true, action: true },
    }),
  );
}

export async function findWorkspaceState(workspaceId: string) {
  return withScope({ workspaceId }, (tx) =>
    tx.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { id: true, status: true, name: true, slug: true },
    }),
  );
}

export async function findWorkspaceTheme(
  workspaceId: string,
): Promise<"light" | "dark" | "system" | null> {
  return withScope({ workspaceId }, async (tx) => {
    const settings = await tx.workspaceSettings.findUnique({
      where: { workspaceId },
      select: { theme: true },
    });
    return settings?.theme ?? null;
  });
}

export async function upsertUserPreference(
  userId: string,
  preference: { locale: "ar" | "en"; theme: "light" | "dark" | "system" },
) {
  return getDb().userPreference.upsert({
    where: { userId },
    create: { userId, locale: preference.locale, theme: preference.theme },
    update: { locale: preference.locale, theme: preference.theme },
  });
}

export async function findUserPreference(userId: string) {
  return getDb().userPreference.findUnique({
    where: { userId },
    select: { locale: true, theme: true },
  });
}

export async function findUser(userId: string) {
  return getDb().user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, emailVerified: true },
  });
}

export async function findSessionActivity(sessionId: string) {
  return getDb().sessionActivity.findUnique({
    where: { sessionId },
    select: { lastSeenAt: true },
  });
}

export async function touchSessionActivity(sessionId: string, now: Date): Promise<void> {
  await getDb().sessionActivity.upsert({
    where: { sessionId },
    create: { sessionId, lastSeenAt: now },
    update: { lastSeenAt: now },
  });
}

export async function deleteSessionActivity(sessionId: string): Promise<void> {
  await getDb().sessionActivity.deleteMany({ where: { sessionId } });
}

/** Revoke one session server-side. The cookie is cleared by the caller. */
export async function deleteSessionById(sessionId: string): Promise<void> {
  await getDb().session.deleteMany({ where: { id: sessionId } });
}

/** Sign-out everywhere: every session row for the user, immediately. */
export async function deleteSessionsForUser(userId: string): Promise<number> {
  const result = await getDb().session.deleteMany({ where: { userId } });
  return result.count;
}

/**
 * Revoke every session for a user inside the caller's transaction, so a
 * membership removal and the revocation commit together (`F-P2-01` AC-6).
 */
export async function deleteSessionsForUserTx(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<number> {
  const result = await tx.session.deleteMany({ where: { userId } });
  return result.count;
}

export async function insertAuthEvent(data: {
  userId?: string | null;
  identifierHash?: string | null;
  event: string;
  ipHash?: string | null;
  userAgentHash?: string | null;
  requestId: string;
  createdAt?: Date;
}): Promise<void> {
  await getDb().authEvent.create({
    data: {
      userId: data.userId ?? null,
      identifierHash: data.identifierHash ?? null,
      event: data.event,
      ipHash: data.ipHash ?? null,
      userAgentHash: data.userAgentHash ?? null,
      requestId: data.requestId,
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    },
  });
}

export async function countAuthEventsSince(
  identifierHash: string,
  event: string,
  since: Date,
): Promise<number> {
  return getDb().authEvent.count({
    where: { identifierHash, event, createdAt: { gte: since } },
  });
}

export type PortalGrantRow = {
  id?: string;
  workspaceId: string;
  studentId: string;
  guardianId?: string | null;
  kind: "parent" | "student";
  permissions?: unknown;
  expiresAt: Date | null;
};

/** The signed-in user's own active portal links. SELECT-only self policy. */
export async function findActivePortalGrants(userId: string, now: Date): Promise<PortalGrantRow[]> {
  return withUserScope(userId, (tx) =>
    tx.portalGrant.findMany({
      where: {
        portalUserId: userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        workspaceId: true,
        studentId: true,
        guardianId: true,
        kind: true,
        permissions: true,
        expiresAt: true,
      },
      orderBy: { issuedAt: "asc" },
    }),
  );
}

export async function findStudentInWorkspace(workspaceId: string, studentId: string) {
  return withScope({ workspaceId }, (tx) =>
    tx.student.findFirst({
      where: { id: studentId, workspaceId, archivedAt: null },
      select: { id: true, workspaceId: true },
    }),
  );
}

export async function findPortalStudentProjection(workspaceId: string, studentId: string) {
  return withScope({ workspaceId }, (tx) =>
    tx.student.findFirst({
      where: { id: studentId, workspaceId, archivedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        grade: true,
        enrollments: {
          where: { leftAt: null },
          select: { group: { select: { id: true, name: true } } },
        },
      },
    }),
  );
}
