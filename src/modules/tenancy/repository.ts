import type { Prisma } from "@/generated/prisma/client";
import { withInvitationScope, withScope } from "@/lib/db/scope";
import type { PermissionAction, PermissionResource, Scope } from "./types";

/**
 * The only tenancy queries. Every function takes a Scope, every read happens
 * inside the tenant transaction, and no export can query across workspaces.
 *
 * Write functions receive the caller's transaction so the audit event and the
 * mutation commit or roll back together.
 */

export async function findWorkspaceSettings(scope: Scope) {
  return withScope(scope, (tx) =>
    tx.workspaceSettings.findUnique({
      where: { workspaceId: scope.workspaceId },
      select: {
        locale: true,
        theme: true,
        timezone: true,
        currency: true,
        atRiskAfter: true,
        inactiveAfter: true,
      },
    }),
  );
}

export async function findWorkspaceProfile(scope: Scope) {
  return withScope(scope, (tx) =>
    tx.workspace.findFirst({
      where: { id: scope.workspaceId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        teachingName: true,
        primarySubject: true,
        gradesTaught: true,
        status: true,
      },
    }),
  );
}

export async function findWorkspaceSubscriptionRow(scope: Scope) {
  return withScope(scope, (tx) =>
    tx.workspace.findFirst({
      where: { id: scope.workspaceId, deletedAt: null },
      select: {
        id: true,
        status: true,
        planTier: true,
        planStatus: true,
        planLimitOverrides: true,
      },
    }),
  );
}

export async function listOnboardingTasks(scope: Scope) {
  return withScope(scope, (tx) =>
    tx.onboardingTask.findMany({
      where: { workspaceId: scope.workspaceId },
      select: { key: true, completedAt: true },
      orderBy: { createdAt: "asc" },
    }),
  );
}

export async function listActiveMembers(scope: Scope) {
  return withScope(scope, (tx) =>
    tx.workspaceMember.findMany({
      where: { workspaceId: scope.workspaceId, status: "active" },
      select: {
        id: true,
        role: true,
        status: true,
        joinedAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
  );
}

// ---------------------------------------------------------------------------
// Transaction-bound writes
// ---------------------------------------------------------------------------

export async function insertWorkspace(
  tx: Prisma.TransactionClient,
  data: Prisma.WorkspaceUncheckedCreateInput,
) {
  return tx.workspace.create({
    data,
    select: { id: true, name: true, slug: true, teachingName: true },
  });
}

export async function insertWorkspaceSettings(
  tx: Prisma.TransactionClient,
  data: Prisma.WorkspaceSettingsUncheckedCreateInput,
) {
  return tx.workspaceSettings.create({ data });
}

export async function insertOwnerMembership(
  tx: Prisma.TransactionClient,
  data: Prisma.WorkspaceMemberUncheckedCreateInput,
) {
  return tx.workspaceMember.create({
    data,
    select: { id: true, workspaceId: true, userId: true, role: true },
  });
}

export async function insertOnboardingTasks(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<void> {
  await tx.onboardingTask.createMany({
    data: ["teaching_name", "grades", "first_group", "first_students"].map((key) => ({
      workspaceId,
      key,
    })),
    skipDuplicates: true,
  });
}

export async function findWorkspaceAndSettingsForUpdate(
  tx: Prisma.TransactionClient,
  workspaceId: string,
) {
  const [workspace, settings] = await Promise.all([
    tx.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        teachingName: true,
        primarySubject: true,
        gradesTaught: true,
        status: true,
        deletedAt: true,
      },
    }),
    tx.workspaceSettings.findUnique({
      where: { workspaceId },
      select: {
        locale: true,
        theme: true,
        timezone: true,
        currency: true,
        atRiskAfter: true,
        inactiveAfter: true,
      },
    }),
  ]);
  return { workspace, settings };
}

export async function updateWorkspaceRow(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  data: Prisma.WorkspaceUpdateInput,
) {
  return tx.workspace.update({ where: { id: workspaceId }, data });
}

export async function updateWorkspaceSettingsRow(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  data: Prisma.WorkspaceSettingsUpdateInput,
) {
  return tx.workspaceSettings.update({ where: { workspaceId }, data });
}

export async function listMembersWithGrants(scope: Scope) {
  return withScope(scope, (tx) =>
    tx.workspaceMember.findMany({
      where: {
        workspaceId: scope.workspaceId,
        status: { in: ["active", "invited", "suspended"] },
      },
      select: {
        id: true,
        role: true,
        status: true,
        joinedAt: true,
        user: { select: { id: true, name: true, email: true } },
        grants: { select: { resource: true, action: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
  );
}

/** The caller's own membership row: role, join date, and verification state. */
export async function findCallerMembership(scope: Scope) {
  return withScope(scope, (tx) =>
    tx.workspaceMember.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        userId: scope.actorUserId,
        status: "active",
      },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        user: {
          select: { name: true, email: true, emailVerified: true },
        },
      },
    }),
  );
}

export async function findMemberInWorkspace(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  memberId: string,
) {
  return tx.workspaceMember.findFirst({
    where: { id: memberId, workspaceId },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      grants: { select: { resource: true, action: true } },
    },
  });
}

export async function replaceMemberGrants(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  memberId: string,
  grants: Array<{ resource: PermissionResource; action: PermissionAction }>,
): Promise<void> {
  await tx.permissionGrant.deleteMany({ where: { workspaceId, memberId } });
  if (grants.length > 0) {
    await tx.permissionGrant.createMany({
      data: grants.map((grant) => ({
        workspaceId,
        memberId,
        resource: grant.resource,
        action: grant.action,
      })),
      skipDuplicates: true,
    });
  }
}

export async function markMemberRemoved(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  memberId: string,
  removedAt: Date,
): Promise<void> {
  await tx.workspaceMember.update({
    where: { id: memberId },
    data: { status: "removed", removedAt },
  });
  await tx.permissionGrant.deleteMany({ where: { workspaceId, memberId } });
}

export async function updateMemberStatus(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  memberId: string,
  status: "active" | "suspended",
): Promise<void> {
  await tx.workspaceMember.updateMany({
    where: { id: memberId, workspaceId },
    data: { status, removedAt: null },
  });
}

export async function insertAssistantMembership(
  tx: Prisma.TransactionClient,
  data: Prisma.WorkspaceMemberUncheckedCreateInput,
) {
  return tx.workspaceMember.create({
    data,
    select: { id: true, workspaceId: true, userId: true, role: true, status: true },
  });
}

export async function insertMemberGrants(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  memberId: string,
  grants: Array<{ resource: PermissionResource; action: PermissionAction }>,
): Promise<void> {
  if (grants.length === 0) return;
  await tx.permissionGrant.createMany({
    data: grants.map((grant) => ({
      workspaceId,
      memberId,
      resource: grant.resource,
      action: grant.action,
    })),
    skipDuplicates: true,
  });
}

export async function findMemberByEmail(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  email: string,
) {
  return tx.workspaceMember.findFirst({
    where: {
      workspaceId,
      status: { in: ["active", "invited", "suspended"] },
      user: { email },
    },
    select: { id: true, userId: true, role: true, status: true },
  });
}

export async function findMembershipForUser(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
) {
  return tx.workspaceMember.findFirst({
    where: { workspaceId, userId },
    select: { id: true, role: true, status: true },
  });
}

export async function listInvitations(scope: Scope) {
  return withScope(scope, (tx) =>
    tx.workspaceInvitation.findMany({
      where: { workspaceId: scope.workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        grants: true,
        status: true,
        expiresAt: true,
        lastSentAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    }),
  );
}

export async function findInvitationByTokenHash(tokenHash: string) {
  return withInvitationScope(tokenHash, (tx) =>
    tx.workspaceInvitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        role: true,
        grants: true,
        status: true,
        expiresAt: true,
      },
    }),
  );
}

export async function findInvitationInWorkspace(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  invitationId: string,
) {
  return tx.workspaceInvitation.findFirst({
    where: { id: invitationId, workspaceId },
    select: {
      id: true,
      email: true,
      tokenHash: true,
      status: true,
      expiresAt: true,
      lastSentAt: true,
      grants: true,
      role: true,
    },
  });
}

export async function findPendingInvitationForEmail(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  email: string,
) {
  return tx.workspaceInvitation.findFirst({
    where: { workspaceId, email, status: "pending" },
    select: { id: true, status: true, expiresAt: true },
  });
}

export async function insertInvitation(
  tx: Prisma.TransactionClient,
  data: {
    workspaceId: string;
    email: string;
    tokenHash: string;
    invitedByUserId: string;
    expiresAt: Date;
    lastSentAt: Date;
    grants: Array<{ resource: PermissionResource; action: PermissionAction }>;
  },
) {
  return tx.workspaceInvitation.create({
    data: {
      workspaceId: data.workspaceId,
      email: data.email,
      tokenHash: data.tokenHash,
      invitedByUserId: data.invitedByUserId,
      expiresAt: data.expiresAt,
      lastSentAt: data.lastSentAt,
      grants: data.grants as Prisma.InputJsonValue,
    },
    select: { id: true, email: true, expiresAt: true, lastSentAt: true, status: true },
  });
}

export async function rotateInvitationToken(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  invitationId: string,
  data: { tokenHash: string; expiresAt: Date; lastSentAt: Date },
): Promise<number> {
  const result = await tx.workspaceInvitation.updateMany({
    where: { id: invitationId, workspaceId, status: "pending" },
    data,
  });
  return result.count;
}

export async function markInvitationRevoked(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  invitationId: string,
  revokedAt: Date,
): Promise<number> {
  const result = await tx.workspaceInvitation.updateMany({
    where: { id: invitationId, workspaceId, status: "pending" },
    data: { status: "revoked", revokedAt },
  });
  return result.count;
}

export async function markInvitationExpired(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  invitationId: string,
): Promise<void> {
  await tx.workspaceInvitation.updateMany({
    where: { id: invitationId, workspaceId, status: "pending" },
    data: { status: "expired" },
  });
}

export async function markInvitationAccepted(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  invitationId: string,
  acceptedByUserId: string,
  acceptedAt: Date,
): Promise<number> {
  const result = await tx.workspaceInvitation.updateMany({
    where: { id: invitationId, workspaceId, status: "pending" },
    data: { status: "accepted", acceptedAt, acceptedByUserId },
  });
  return result.count;
}
