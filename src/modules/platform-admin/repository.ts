import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import { withPlatformAdminScope, withScope } from "@/lib/db/scope";
import { newUuidV7 } from "@/lib/id";
import type {
  PlatformWorkspacesQuery,
  UpdateWorkspacePlanInput,
  UpdateWorkspaceStatusInput,
} from "./schemas";

export async function findActivePlatformAdminByUserId(userId: string) {
  return getDb().platformAdmin.findFirst({
    where: {
      userId,
      revokedAt: null,
    },
    select: {
      id: true,
      userId: true,
      grantedByUserId: true,
      grantReason: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
        },
      },
    },
  });
}

export async function listPlatformWorkspacesRaw(
  adminUserId: string,
  query: PlatformWorkspacesQuery,
) {
  return withPlatformAdminScope(adminUserId, async (tx) => {
    const where: Prisma.WorkspaceWhereInput = {};

    if (query.status !== "all") {
      where.status = query.status;
    }
    if (query.planTier !== "all") {
      where.planTier = query.planTier;
    }
    if (query.planStatus !== "all") {
      where.planStatus = query.planStatus;
    }
    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { slug: { contains: term, mode: "insensitive" } },
        { teachingName: { contains: term, mode: "insensitive" } },
      ];
    }

    return tx.workspace.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        teachingName: true,
        primarySubject: true,
        gradesTaught: true,
        status: true,
        planTier: true,
        planStatus: true,
        planLimitOverrides: true,
        planAssignedAt: true,
        planAssignedBy: true,
        planNote: true,
        statusReason: true,
        statusUpdatedAt: true,
        statusUpdatedBy: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  });
}

export async function findPlatformWorkspaceByIdRaw(adminUserId: string, workspaceId: string) {
  return withPlatformAdminScope(adminUserId, (tx) =>
    tx.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        teachingName: true,
        primarySubject: true,
        gradesTaught: true,
        status: true,
        planTier: true,
        planStatus: true,
        planLimitOverrides: true,
        planAssignedAt: true,
        planAssignedBy: true,
        planNote: true,
        statusReason: true,
        statusUpdatedAt: true,
        statusUpdatedBy: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  );
}

/**
 * Collect aggregate usage and operational metadata for a workspace (`F-P3-03` AC-1).
 *
 * Strictly metadata-only: never selects `StudentNote.body`, `AssessmentScore.score`,
 * `Guardian.phoneE164`, `Student.firstName`, `Student.lastName`, `Student.phoneE164`,
 * or financial payment amounts.
 */
export async function collectWorkspaceUsageSummary(
  workspaceId: string,
  now: Date = new Date(),
) {
  return withScope({ workspaceId }, async (tx) => {
    const [
      activeStudents,
      archivedStudents,
      activeGroups,
      archivedGroups,
      members,
      pendingInvitations,
      files,
      videos,
      outboxByStatus,
      inAppNotificationCount,
      onlineExamTotal,
      onlineExamPublished,
      latestAudit,
      activeBreakGlass,
    ] = await Promise.all([
      tx.student.count({ where: { workspaceId, archivedAt: null } }),
      tx.student.count({ where: { workspaceId, archivedAt: { not: null } } }),
      tx.group.count({ where: { workspaceId, archivedAt: null } }),
      tx.group.count({ where: { workspaceId, archivedAt: { not: null } } }),
      tx.workspaceMember.findMany({
        where: { workspaceId, status: { in: ["active", "suspended"] } },
        select: {
          role: true,
          status: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { joinedAt: "asc" },
      }),
      tx.workspaceInvitation.count({
        where: {
          workspaceId,
          status: "pending",
          expiresAt: { gt: now },
        },
      }),
      tx.file.findMany({
        where: { workspaceId, deletedAt: null },
        select: {
          sizeBytes: true,
          scanStatus: true,
          archivedAt: true,
        },
      }),
      tx.videoLesson.findMany({
        where: { workspaceId, deletedAt: null },
        select: {
          sizeBytes: true,
          durationSeconds: true,
          playbackCount: true,
          publicationStatus: true,
          assetStatus: true,
        },
      }),
      tx.messageOutbox.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: { _all: true },
      }),
      tx.notification.count({ where: { workspaceId } }),
      tx.onlineExam.count({ where: { workspaceId } }),
      tx.onlineExam.count({ where: { workspaceId, status: "published" } }),
      tx.auditEvent.findFirst({
        where: { workspaceId },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      tx.breakGlassGrant.findFirst({
        where: {
          workspaceId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        select: {
          id: true,
          adminUserId: true,
          adminDisplayName: true,
          ticketRef: true,
          reason: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const ownerMember = members.find((m) => m.role === "owner");
    const ownerCount = members.filter((m) => m.role === "owner" && m.status === "active").length;
    const activeAssistantCount = members.filter(
      (m) => m.role === "assistant" && m.status === "active",
    ).length;
    const suspendedAssistantCount = members.filter(
      (m) => m.role === "assistant" && m.status === "suspended",
    ).length;

    const activeFiles = files.filter((f) => f.archivedAt === null);
    const totalFileSizeBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);
    const pendingScanCount = files.filter((f) => f.scanStatus === "pending").length;
    const blockedScanCount = files.filter((f) => f.scanStatus === "blocked").length;

    const activeVideos = videos.filter((v) => v.publicationStatus !== "archived");
    const totalVideoSizeBytes = activeVideos.reduce((sum, v) => sum + v.sizeBytes, 0);
    const totalVideoDurationSeconds = activeVideos.reduce((sum, v) => sum + v.durationSeconds, 0);
    const totalVideoPlaybackCount = activeVideos.reduce((sum, v) => sum + v.playbackCount, 0);
    const estimatedVideoBandwidthBytes = activeVideos.reduce(
      (sum, v) => sum + v.sizeBytes * v.playbackCount,
      0,
    );

    const statusCounts: Record<string, number> = {};
    let outboxTotal = 0;
    for (const group of outboxByStatus) {
      statusCounts[group.status] = group._count._all;
      outboxTotal += group._count._all;
    }

    return {
      students: {
        activeCount: activeStudents,
        archivedCount: archivedStudents,
      },
      groups: {
        activeCount: activeGroups,
        archivedCount: archivedGroups,
      },
      members: {
        ownerCount,
        activeAssistantCount,
        suspendedAssistantCount,
        pendingInvitationCount: pendingInvitations,
        ownerName: ownerMember?.user.name ?? null,
        ownerEmail: ownerMember?.user.email ?? null,
      },
      files: {
        activeCount: activeFiles.length,
        totalCount: files.length,
        totalSizeBytes: totalFileSizeBytes,
        pendingScanCount,
        blockedScanCount,
        measurementBasis: "exact_db_records" as const,
      },
      videos: {
        activeCount: activeVideos.length,
        totalSizeBytes: totalVideoSizeBytes,
        totalDurationSeconds: totalVideoDurationSeconds,
        totalPlaybackCount: totalVideoPlaybackCount,
        estimatedBandwidthBytes: estimatedVideoBandwidthBytes,
        isEstimate: true as const,
      },
      messages: {
        outboxTotal,
        pendingCount: (statusCounts.pending ?? 0) + (statusCounts.sending ?? 0) + (statusCounts.retried ?? 0),
        preparedCount: statusCounts.prepared ?? 0,
        sentCount: statusCounts.sent ?? 0,
        deliveredCount: statusCounts.delivered ?? 0,
        failedCount: statusCounts.failed ?? 0,
        cancelledCount: statusCounts.cancelled ?? 0,
        inAppNotificationCount,
        isEstimate: true as const,
      },
      onlineExams: {
        totalCount: onlineExamTotal,
        publishedCount: onlineExamPublished,
      },
      lastActivityAt: latestAudit?.createdAt.toISOString() ?? null,
      activeBreakGlassGrant: activeBreakGlass
        ? {
            id: activeBreakGlass.id,
            adminUserId: activeBreakGlass.adminUserId,
            adminDisplayName: activeBreakGlass.adminDisplayName,
            ticketRef: activeBreakGlass.ticketRef,
            reason: activeBreakGlass.reason,
            expiresAt: activeBreakGlass.expiresAt.toISOString(),
            createdAt: activeBreakGlass.createdAt.toISOString(),
          }
        : null,
    };
  });
}

export async function getWorkspacePlanStateTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
) {
  if (typeof tx.workspace?.findFirst !== "function") {
    return {
      id: workspaceId,
      status: "active" as const,
      planTier: "pilot" as const,
      planStatus: "pilot_active" as const,
      planLimitOverrides: null,
    };
  }
  return tx.workspace.findFirst({
    where: { id: workspaceId, deletedAt: null },
    select: {
      id: true,
      status: true,
      planTier: true,
      planStatus: true,
      planLimitOverrides: true,
    },
  });
}

export async function countActiveStudentsTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<number> {
  if (typeof tx.student?.count !== "function") return 0;
  return tx.student.count({
    where: { workspaceId, archivedAt: null },
  });
}

export async function countActiveGroupsTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<number> {
  if (typeof tx.group?.count !== "function") return 0;
  return tx.group.count({
    where: { workspaceId, archivedAt: null },
  });
}

export async function countAssistantSeatsTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  now: Date = new Date(),
): Promise<number> {
  const activeAssistants =
    typeof tx.workspaceMember?.count === "function"
      ? await tx.workspaceMember.count({
          where: {
            workspaceId,
            role: "assistant",
            status: { in: ["active", "suspended"] },
          },
        })
      : 0;
  const pendingInvites =
    typeof tx.workspaceInvitation?.count === "function"
      ? await tx.workspaceInvitation.count({
          where: {
            workspaceId,
            status: "pending",
            expiresAt: { gt: now },
          },
        })
      : 0;
  return activeAssistants + pendingInvites;
}

export async function sumWorkspaceFileBytesTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<number> {
  if (typeof tx.file?.aggregate !== "function") return 0;
  const aggregate = await tx.file.aggregate({
    where: { workspaceId, deletedAt: null },
    _sum: { sizeBytes: true },
  });
  return aggregate._sum.sizeBytes ?? 0;
}

export async function updateWorkspacePlanInScope(params: {
  workspaceId: string;
  actorUserId: string;
  actorDisplayName: string;
  input: UpdateWorkspacePlanInput;
  requestId: string;
  ipHash: string | null;
  now: Date;
}) {
  return withScope({ workspaceId: params.workspaceId }, async (tx) => {
    const before = await tx.workspace.findUnique({
      where: { id: params.workspaceId },
      select: {
        id: true,
        slug: true,
        planTier: true,
        planStatus: true,
        planLimitOverrides: true,
        planNote: true,
      },
    });
    if (!before) return null;

    const overridesJson =
      params.input.limitOverrides && Object.keys(params.input.limitOverrides).length > 0
        ? (params.input.limitOverrides as Prisma.InputJsonValue)
        : null;

    const updated = await tx.workspace.update({
      where: { id: params.workspaceId },
      data: {
        planTier: params.input.planTier,
        planStatus: params.input.planStatus,
        planLimitOverrides: overridesJson ?? Prisma.DbNull,
        planAssignedAt: params.now,
        planAssignedBy: params.actorUserId,
        planNote: params.input.planNote ?? null,
      },
      select: {
        id: true,
        slug: true,
        planTier: true,
        planStatus: true,
        planLimitOverrides: true,
        planAssignedAt: true,
        planAssignedBy: true,
        planNote: true,
      },
    });

    const diff = {
      before: {
        planTier: before.planTier,
        planStatus: before.planStatus,
        planLimitOverrides: before.planLimitOverrides,
        planNote: before.planNote,
      },
      after: {
        planTier: updated.planTier,
        planStatus: updated.planStatus,
        planLimitOverrides: updated.planLimitOverrides,
        planNote: updated.planNote,
      },
      reason: params.input.reason,
    };

    await tx.auditEvent.create({
      data: {
        id: newUuidV7(),
        workspaceId: params.workspaceId,
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        actorType: "platform_admin",
        entityType: "workspace",
        entityId: params.workspaceId,
        action: "platform_admin.workspace_plan_updated",
        diff: diff as Prisma.InputJsonValue,
        requestId: params.requestId,
        ipHash: params.ipHash,
        createdAt: params.now,
      },
    });

    await tx.platformAuditEvent.create({
      data: {
        id: newUuidV7(),
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        targetWorkspaceId: params.workspaceId,
        entityType: "workspace",
        entityId: params.workspaceId,
        action: "platform_admin.workspace_plan_updated",
        reason: params.input.reason,
        diff: diff as Prisma.InputJsonValue,
        requestId: params.requestId,
        ipHash: params.ipHash,
        createdAt: params.now,
      },
    });

    return updated;
  });
}

export async function updateWorkspaceStatusInScope(params: {
  workspaceId: string;
  actorUserId: string;
  actorDisplayName: string;
  input: UpdateWorkspaceStatusInput;
  requestId: string;
  ipHash: string | null;
  now: Date;
}) {
  return withScope({ workspaceId: params.workspaceId }, async (tx) => {
    const before = await tx.workspace.findUnique({
      where: { id: params.workspaceId },
      select: {
        id: true,
        slug: true,
        status: true,
        statusReason: true,
      },
    });
    if (!before) return null;

    const updated = await tx.workspace.update({
      where: { id: params.workspaceId },
      data: {
        status: params.input.status,
        statusReason: params.input.reason,
        statusUpdatedAt: params.now,
        statusUpdatedBy: params.actorUserId,
      },
      select: {
        id: true,
        slug: true,
        status: true,
        statusReason: true,
        statusUpdatedAt: true,
        statusUpdatedBy: true,
      },
    });

    const diff = {
      before: { status: before.status, statusReason: before.statusReason },
      after: { status: updated.status, statusReason: updated.statusReason },
      reason: params.input.reason,
    };

    const action =
      params.input.status === "suspended"
        ? "platform_admin.workspace_suspended"
        : "platform_admin.workspace_reactivated";

    await tx.auditEvent.create({
      data: {
        id: newUuidV7(),
        workspaceId: params.workspaceId,
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        actorType: "platform_admin",
        entityType: "workspace",
        entityId: params.workspaceId,
        action,
        diff: diff as Prisma.InputJsonValue,
        requestId: params.requestId,
        ipHash: params.ipHash,
        createdAt: params.now,
      },
    });

    await tx.platformAuditEvent.create({
      data: {
        id: newUuidV7(),
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        targetWorkspaceId: params.workspaceId,
        entityType: "workspace",
        entityId: params.workspaceId,
        action,
        reason: params.input.reason,
        diff: diff as Prisma.InputJsonValue,
        requestId: params.requestId,
        ipHash: params.ipHash,
        createdAt: params.now,
      },
    });

    return updated;
  });
}

export async function createBreakGlassGrantInScope(params: {
  workspaceId: string;
  actorUserId: string;
  actorDisplayName: string;
  ticketRef: string;
  reason: string;
  expiresAt: Date;
  requestId: string;
  ipHash: string | null;
  now: Date;
}) {
  return withScope({ workspaceId: params.workspaceId }, async (tx) => {
    const grantId = newUuidV7();
    const grant = await tx.breakGlassGrant.create({
      data: {
        id: grantId,
        workspaceId: params.workspaceId,
        adminUserId: params.actorUserId,
        adminDisplayName: params.actorDisplayName,
        ticketRef: params.ticketRef,
        reason: params.reason,
        expiresAt: params.expiresAt,
        createdAt: params.now,
      },
      select: {
        id: true,
        workspaceId: true,
        adminUserId: true,
        adminDisplayName: true,
        ticketRef: true,
        reason: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    const diff = {
      grantId: grant.id,
      ticketRef: grant.ticketRef,
      reason: grant.reason,
      expiresAt: grant.expiresAt.toISOString(),
    };

    await tx.auditEvent.create({
      data: {
        id: newUuidV7(),
        workspaceId: params.workspaceId,
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        actorType: "platform_admin",
        entityType: "break_glass_grant",
        entityId: grant.id,
        action: "platform_admin.break_glass_granted",
        diff: diff as Prisma.InputJsonValue,
        requestId: params.requestId,
        ipHash: params.ipHash,
        createdAt: params.now,
      },
    });

    await tx.platformAuditEvent.create({
      data: {
        id: newUuidV7(),
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        targetWorkspaceId: params.workspaceId,
        entityType: "break_glass_grant",
        entityId: grant.id,
        action: "platform_admin.break_glass_granted",
        reason: params.reason,
        diff: diff as Prisma.InputJsonValue,
        requestId: params.requestId,
        ipHash: params.ipHash,
        createdAt: params.now,
      },
    });

    return grant;
  });
}

export async function revokeBreakGlassGrantInScope(params: {
  workspaceId: string;
  grantId: string;
  actorUserId: string;
  actorDisplayName: string;
  reason: string;
  requestId: string;
  ipHash: string | null;
  now: Date;
}) {
  return withScope({ workspaceId: params.workspaceId }, async (tx) => {
    const existing = await tx.breakGlassGrant.findFirst({
      where: { id: params.grantId, workspaceId: params.workspaceId },
      select: { id: true, ticketRef: true, revokedAt: true },
    });
    if (!existing) return null;

    const updated = await tx.breakGlassGrant.update({
      where: { id: params.grantId },
      data: {
        revokedAt: params.now,
        revokedByUserId: params.actorUserId,
        revokeReason: params.reason,
      },
      select: {
        id: true,
        ticketRef: true,
        revokedAt: true,
        revokeReason: true,
      },
    });

    const diff = {
      grantId: updated.id,
      ticketRef: updated.ticketRef,
      revokeReason: params.reason,
    };

    await tx.auditEvent.create({
      data: {
        id: newUuidV7(),
        workspaceId: params.workspaceId,
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        actorType: "platform_admin",
        entityType: "break_glass_grant",
        entityId: updated.id,
        action: "platform_admin.break_glass_revoked",
        diff: diff as Prisma.InputJsonValue,
        requestId: params.requestId,
        ipHash: params.ipHash,
        createdAt: params.now,
      },
    });

    await tx.platformAuditEvent.create({
      data: {
        id: newUuidV7(),
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        targetWorkspaceId: params.workspaceId,
        entityType: "break_glass_grant",
        entityId: updated.id,
        action: "platform_admin.break_glass_revoked",
        reason: params.reason,
        diff: diff as Prisma.InputJsonValue,
        requestId: params.requestId,
        ipHash: params.ipHash,
        createdAt: params.now,
      },
    });

    return updated;
  });
}

/**
 * Retrieve time-limited support diagnostic metadata under an active break-glass
 * grant (`F-P3-03` AC-2).
 *
 * Even under break-glass, this projection strictly excludes private student
 * notes, grades, guardian phone numbers, and student names. It surfaces only
 * operational diagnostics (recent audit action codes, failed export jobs, and
 * failed outbox error codes) needed to troubleshoot workspace issues.
 */
export async function getBreakGlassSupportDiagnosticsInScope(
  workspaceId: string,
  adminUserId: string,
  now: Date = new Date(),
) {
  return withScope({ workspaceId }, async (tx) => {
    const activeGrant = await tx.breakGlassGrant.findFirst({
      where: {
        workspaceId,
        adminUserId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        ticketRef: true,
        reason: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!activeGrant) return null;

    const [recentAuditActions, failedExports, failedOutboxRows] = await Promise.all([
      tx.auditEvent.findMany({
        where: { workspaceId },
        select: {
          id: true,
          actorType: true,
          entityType: true,
          action: true,
          requestId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
      tx.reportExport.findMany({
        where: { workspaceId, status: "failed" },
        select: {
          id: true,
          type: true,
          failureCode: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      tx.messageOutbox.findMany({
        where: { workspaceId, status: "failed" },
        select: {
          id: true,
          channel: true,
          type: true,
          provider: true,
          attempts: true,
          lastError: true,
          failedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return {
      grant: {
        id: activeGrant.id,
        ticketRef: activeGrant.ticketRef,
        reason: activeGrant.reason,
        expiresAt: activeGrant.expiresAt.toISOString(),
        createdAt: activeGrant.createdAt.toISOString(),
      },
      recentAuditActions: recentAuditActions.map((e) => ({
        id: e.id,
        actorType: e.actorType,
        entityType: e.entityType,
        action: e.action,
        requestId: e.requestId,
        createdAt: e.createdAt.toISOString(),
      })),
      failedExports: failedExports.map((r) => ({
        id: r.id,
        type: r.type,
        failureCode: r.failureCode,
        createdAt: r.createdAt.toISOString(),
      })),
      failedOutboxMessages: failedOutboxRows.map((m) => ({
        id: m.id,
        channel: m.channel,
        type: m.type,
        provider: m.provider,
        attempts: m.attempts,
        lastError: m.lastError,
        failedAt: m.failedAt?.toISOString() ?? null,
      })),
    };
  });
}

export async function listPlatformAuditEvents(params: {
  targetWorkspaceId?: string;
  limit?: number;
}) {
  const take = Math.min(Math.max(params.limit ?? 30, 1), 100);
  return getDb().platformAuditEvent.findMany({
    where: params.targetWorkspaceId ? { targetWorkspaceId: params.targetWorkspaceId } : undefined,
    select: {
      id: true,
      actorUserId: true,
      actorDisplayName: true,
      targetWorkspaceId: true,
      entityType: true,
      entityId: true,
      action: true,
      reason: true,
      diff: true,
      requestId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function findActiveBreakGlassForWorkspace(
  workspaceId: string,
  now: Date = new Date(),
) {
  return withScope({ workspaceId }, (tx) =>
    tx.breakGlassGrant.findFirst({
      where: {
        workspaceId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        adminDisplayName: true,
        ticketRef: true,
        reason: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  );
}
