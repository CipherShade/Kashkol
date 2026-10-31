import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { getServerEnv } from "@/lib/config/env";
import { writeAuditEvent } from "@/modules/audit/service";
import type { PortalContext } from "@/modules/identity/session";
import { resolvePortalPermissions } from "@/modules/portals/tokens";
import { authorize, type Scope } from "@/modules/tenancy/types";
import { getVideoProviderAdapter } from "./adapters";
import {
  applyVideoWebhookStateInScope,
  findAuthorizedPortalVideo,
  findVideoLesson,
  getWorkspaceVideoUsage,
  incrementVideoPlaybackCountTx,
  listVideoLessonRows,
} from "./repository";
import type {
  CreateVideoLessonInput,
  UpdateVideoLessonInput,
  VideosQuery,
} from "./schemas";

const PLAYBACK_TOKEN_TTL_SECONDS = 900; // 15 minutes

type RequestContext = { requestId?: string; ipHash?: string | null };
const contextId = (request?: RequestContext) => request?.requestId ?? newRequestId();

export type VideoProviderStatus = {
  configured: boolean;
  driver: "none" | "cloudflare_stream" | "fake";
  requiredEnvKeys: string[];
  limits: {
    maxVideoCount: number;
    maxStorageBytes: number;
    maxBandwidthBytesPerMonth: number;
  };
};

export function getVideoProviderStatus(): VideoProviderStatus {
  const env = getServerEnv();
  const adapter = getVideoProviderAdapter();
  return {
    configured: adapter.isConfigured,
    driver: adapter.providerName,
    requiredEnvKeys: [
      "VIDEO_PROVIDER_DRIVER",
      "VIDEO_PROVIDER_ACCOUNT_ID",
      "VIDEO_PROVIDER_API_TOKEN",
      "VIDEO_PROVIDER_SIGNING_SECRET",
      "VIDEO_PROVIDER_WEBHOOK_SECRET",
    ],
    limits: {
      maxVideoCount: env.VIDEO_MAX_COUNT_PER_WORKSPACE,
      maxStorageBytes: env.VIDEO_MAX_STORAGE_BYTES_PER_WORKSPACE,
      maxBandwidthBytesPerMonth: env.VIDEO_MAX_BANDWIDTH_BYTES_PER_MONTH,
    },
  };
}

export async function listVideoLessons(scope: Scope, query: VideosQuery) {
  authorize(scope, "files", "read");
  const providerStatus = getVideoProviderStatus();
  const [rows, usage] = await Promise.all([
    listVideoLessonRows(scope, query),
    getWorkspaceVideoUsage(scope),
  ]);

  return {
    providerStatus,
    usage: {
      ...usage,
      limits: providerStatus.limits,
    },
    items: rows.map((video) => ({
      id: video.id,
      scope: video.scope,
      publicationStatus: video.publicationStatus,
      title: video.title,
      description: video.description,
      topic: video.topic,
      subject: video.subject,
      provider: video.provider,
      providerAssetId: video.providerAssetId,
      assetStatus: video.assetStatus,
      durationSeconds: video.durationSeconds,
      sizeBytes: video.sizeBytes,
      thumbnailPath: video.thumbnailPath,
      requireSignedPlayback: video.requireSignedPlayback,
      playbackCount: video.playbackCount,
      estimatedBandwidthBytes: video.sizeBytes * video.playbackCount,
      lastVerifiedAt: video.lastVerifiedAt?.toISOString() ?? null,
      publishedAt: video.publishedAt?.toISOString() ?? null,
      archivedAt: video.archivedAt?.toISOString() ?? null,
      createdAt: video.createdAt.toISOString(),
      updatedAt: video.updatedAt.toISOString(),
      groups: video.groupAccesses.map(({ group }) => ({
        id: group.id,
        name: group.name,
        archived: group.archivedAt !== null,
      })),
      students: video.studentAccesses.map(({ student }) => ({
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        archived: student.archivedAt !== null,
      })),
    })),
  };
}

export async function createVideoLesson(
  scope: Scope,
  input: CreateVideoLessonInput,
  request?: RequestContext,
  now: Date = new Date(),
) {
  authorize(scope, "files", "write");
  if (input.scope === "groups") authorize(scope, "groups", "read");
  if (input.scope === "students") authorize(scope, "students", "read");

  const adapter = getVideoProviderAdapter();
  if (!adapter.isConfigured || adapter.providerName === "none") {
    throw new AppError("CONFLICT", { messageKey: "errors.videoProviderNotConfigured" });
  }

  const env = getServerEnv();
  const currentUsage = await getWorkspaceVideoUsage(scope);
  if (currentUsage.videoCount >= env.VIDEO_MAX_COUNT_PER_WORKSPACE) {
    throw new AppError("CONFLICT", { messageKey: "errors.videoCountLimitReached" });
  }

  const inspected = await adapter.inspectAsset(input.providerAssetId);
  if (
    currentUsage.storageBytes + inspected.sizeBytes >
    env.VIDEO_MAX_STORAGE_BYTES_PER_WORKSPACE
  ) {
    throw new AppError("CONFLICT", { messageKey: "errors.videoStorageLimitReached" });
  }

  if (input.publicationStatus === "published" && inspected.assetStatus !== "ready") {
    throw new AppError("CONFLICT", { messageKey: "errors.videoNotReadyForPublish" });
  }

  const id = newUuidV7();
  return withScope(scope, async (tx) => {
    const duplicate = await tx.videoLesson.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        provider: inspected.provider,
        providerAssetId: inspected.providerAssetId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppError("CONFLICT", { messageKey: "errors.videoAssetAlreadyAttached" });
    }

    if (input.groupIds.length > 0) {
      const count = await tx.group.count({
        where: {
          workspaceId: scope.workspaceId,
          id: { in: input.groupIds },
          archivedAt: null,
        },
      });
      if (count !== input.groupIds.length) throw new AppError("NOT_FOUND");
    }

    if (input.studentIds.length > 0) {
      const count = await tx.student.count({
        where: {
          workspaceId: scope.workspaceId,
          id: { in: input.studentIds },
          archivedAt: null,
        },
      });
      if (count !== input.studentIds.length) throw new AppError("NOT_FOUND");
    }

    if (input.subjectId) {
      const subject = await tx.subject.findFirst({
        where: { id: input.subjectId, workspaceId: scope.workspaceId, archivedAt: null },
        select: { id: true },
      });
      if (!subject) throw new AppError("NOT_FOUND");
    }

    const created = await tx.videoLesson.create({
      data: {
        id,
        workspaceId: scope.workspaceId,
        groupId: input.scope === "groups" ? (input.groupIds[0] ?? null) : null,
        subjectId: input.subjectId ?? null,
        title: input.title,
        description: input.description ?? null,
        topic: input.topic ?? null,
        scope: input.scope,
        publicationStatus: input.publicationStatus,
        provider: inspected.provider,
        providerAssetId: inspected.providerAssetId,
        assetStatus: inspected.assetStatus,
        durationSeconds: inspected.durationSeconds,
        sizeBytes: inspected.sizeBytes,
        thumbnailPath: inspected.thumbnailPath,
        requireSignedPlayback: true,
        lastVerifiedAt: now,
        publishedAt: input.publicationStatus === "published" ? now : null,
        createdByUserId: scope.actorUserId,
        groupAccesses: {
          createMany: {
            data: input.groupIds.map((groupId) => ({
              workspaceId: scope.workspaceId,
              groupId,
            })),
          },
        },
        studentAccesses: {
          createMany: {
            data: input.studentIds.map((studentId) => ({
              workspaceId: scope.workspaceId,
              studentId,
            })),
          },
        },
      },
      select: {
        id: true,
        title: true,
        provider: true,
        providerAssetId: true,
        assetStatus: true,
        publicationStatus: true,
        durationSeconds: true,
        sizeBytes: true,
      },
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "video_lesson",
      entityId: id,
      action: "video.attached",
      diff: {
        provider: inspected.provider,
        providerAssetId: inspected.providerAssetId,
        assetStatus: inspected.assetStatus,
        publicationStatus: input.publicationStatus,
        scope: input.scope,
        durationSeconds: inspected.durationSeconds,
        sizeBytes: inspected.sizeBytes,
        groupCount: input.groupIds.length,
        studentCount: input.studentIds.length,
      },
      requestId: contextId(request),
      ipHash: request?.ipHash ?? null,
    });

    return created;
  });
}

export async function refreshVideoAssetMetadata(
  scope: Scope,
  videoId: string,
  request?: RequestContext,
  now: Date = new Date(),
) {
  authorize(scope, "files", "write");
  const adapter = getVideoProviderAdapter();
  if (!adapter.isConfigured) {
    throw new AppError("CONFLICT", { messageKey: "errors.videoProviderNotConfigured" });
  }

  const existing = await findVideoLesson(scope, videoId);
  if (!existing) throw new AppError("NOT_FOUND");

  const inspected = await adapter.inspectAsset(existing.providerAssetId);
  return withScope(scope, async (tx) => {
    const updated = await tx.videoLesson.update({
      where: { id: existing.id },
      data: {
        assetStatus: inspected.assetStatus,
        durationSeconds:
          inspected.durationSeconds > 0 ? inspected.durationSeconds : existing.durationSeconds,
        sizeBytes: inspected.sizeBytes > 0 ? inspected.sizeBytes : existing.sizeBytes,
        thumbnailPath: inspected.thumbnailPath ?? existing.thumbnailPath,
        lastVerifiedAt: now,
      },
      select: {
        id: true,
        assetStatus: true,
        durationSeconds: true,
        sizeBytes: true,
        lastVerifiedAt: true,
      },
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "video_lesson",
      entityId: existing.id,
      action: "video.verified",
      diff: {
        oldAssetStatus: existing.assetStatus,
        newAssetStatus: updated.assetStatus,
      },
      requestId: contextId(request),
      ipHash: request?.ipHash ?? null,
    });

    return updated;
  });
}

export async function updateVideoLesson(
  scope: Scope,
  videoId: string,
  input: UpdateVideoLessonInput,
  request?: RequestContext,
  now: Date = new Date(),
) {
  authorize(scope, "files", "write");
  if (input.scope === "groups" || (input.groupIds && input.groupIds.length > 0)) {
    authorize(scope, "groups", "read");
  }
  if (input.scope === "students" || (input.studentIds && input.studentIds.length > 0)) {
    authorize(scope, "students", "read");
  }

  return withScope(scope, async (tx) => {
    const existing = await tx.videoLesson.findFirst({
      where: { id: videoId, workspaceId: scope.workspaceId, deletedAt: null },
      select: {
        id: true,
        scope: true,
        publicationStatus: true,
        assetStatus: true,
        publishedAt: true,
        archivedAt: true,
      },
    });
    if (!existing) throw new AppError("NOT_FOUND");

    if (input.publicationStatus === "published" && existing.assetStatus !== "ready") {
      throw new AppError("CONFLICT", { messageKey: "errors.videoNotReadyForPublish" });
    }

    if (input.subjectId) {
      const subject = await tx.subject.findFirst({
        where: { id: input.subjectId, workspaceId: scope.workspaceId, archivedAt: null },
        select: { id: true },
      });
      if (!subject) throw new AppError("NOT_FOUND");
    }

    const nextScope = input.scope ?? existing.scope;
    if (input.groupIds !== undefined) {
      if (input.groupIds.length > 0) {
        const count = await tx.group.count({
          where: {
            workspaceId: scope.workspaceId,
            id: { in: input.groupIds },
            archivedAt: null,
          },
        });
        if (count !== input.groupIds.length) throw new AppError("NOT_FOUND");
      }
      await tx.videoGroupAccess.deleteMany({
        where: { workspaceId: scope.workspaceId, videoId },
      });
      if (nextScope === "groups" && input.groupIds.length > 0) {
        await tx.videoGroupAccess.createMany({
          data: input.groupIds.map((groupId) => ({
            workspaceId: scope.workspaceId,
            videoId,
            groupId,
          })),
        });
      }
    }

    if (input.studentIds !== undefined) {
      if (input.studentIds.length > 0) {
        const count = await tx.student.count({
          where: {
            workspaceId: scope.workspaceId,
            id: { in: input.studentIds },
            archivedAt: null,
          },
        });
        if (count !== input.studentIds.length) throw new AppError("NOT_FOUND");
      }
      await tx.videoStudentAccess.deleteMany({
        where: { workspaceId: scope.workspaceId, videoId },
      });
      if (nextScope === "students" && input.studentIds.length > 0) {
        await tx.videoStudentAccess.createMany({
          data: input.studentIds.map((studentId) => ({
            workspaceId: scope.workspaceId,
            videoId,
            studentId,
          })),
        });
      }
    }

    const nextPubStatus = input.publicationStatus ?? existing.publicationStatus;
    const publishedAt =
      nextPubStatus === "published"
        ? (existing.publishedAt ?? now)
        : existing.publishedAt;
    const archivedAt =
      nextPubStatus === "archived"
        ? (existing.archivedAt ?? now)
        : input.publicationStatus !== undefined
          ? null
          : existing.archivedAt;

    const updated = await tx.videoLesson.update({
      where: { id: videoId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.topic !== undefined ? { topic: input.topic } : {}),
        ...(input.subjectId !== undefined ? { subjectId: input.subjectId } : {}),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.groupIds !== undefined
          ? { groupId: nextScope === "groups" ? (input.groupIds[0] ?? null) : null }
          : {}),
        publicationStatus: nextPubStatus,
        publishedAt,
        archivedAt,
      },
      select: {
        id: true,
        title: true,
        scope: true,
        publicationStatus: true,
        publishedAt: true,
        archivedAt: true,
      },
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "video_lesson",
      entityId: videoId,
      action:
        input.publicationStatus === "published" && existing.publicationStatus !== "published"
          ? "video.published"
          : input.publicationStatus === "archived" && existing.publicationStatus !== "archived"
            ? "video.archived"
            : "video.updated",
      diff: {
        changedFields: Object.keys(input),
        oldPublicationStatus: existing.publicationStatus,
        newPublicationStatus: updated.publicationStatus,
        oldScope: existing.scope,
        newScope: updated.scope,
      },
      requestId: contextId(request),
      ipHash: request?.ipHash ?? null,
    });

    return updated;
  });
}

export async function deleteVideoLesson(
  scope: Scope,
  videoId: string,
  request?: RequestContext,
  now: Date = new Date(),
) {
  authorize(scope, "files", "write");
  return withScope(scope, async (tx) => {
    const existing = await tx.videoLesson.findFirst({
      where: { id: videoId, workspaceId: scope.workspaceId, deletedAt: null },
      select: { id: true, provider: true, providerAssetId: true },
    });
    if (!existing) throw new AppError("NOT_FOUND");

    await tx.videoLesson.update({
      where: { id: videoId },
      data: { deletedAt: now },
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "video_lesson",
      entityId: videoId,
      action: "video.deleted",
      diff: {
        provider: existing.provider,
        providerAssetId: existing.providerAssetId,
      },
      requestId: contextId(request),
      ipHash: request?.ipHash ?? null,
    });

    return { id: videoId, deleted: true };
  });
}

export async function issueStaffVideoPlayback(
  scope: Scope,
  videoId: string,
  request?: RequestContext,
  now: Date = new Date(),
) {
  authorize(scope, "files", "read");
  const adapter = getVideoProviderAdapter();
  if (!adapter.isConfigured) {
    throw new AppError("CONFLICT", { messageKey: "errors.videoProviderNotConfigured" });
  }

  const video = await findVideoLesson(scope, videoId);
  if (!video) throw new AppError("NOT_FOUND");
  if (video.assetStatus !== "ready") {
    throw new AppError("CONFLICT", { messageKey: "errors.videoNotReadyForPlayback" });
  }

  const env = getServerEnv();
  const usage = await getWorkspaceVideoUsage(scope);
  if (
    usage.estimatedBandwidthBytes + video.sizeBytes >
    env.VIDEO_MAX_BANDWIDTH_BYTES_PER_MONTH
  ) {
    throw new AppError("CONFLICT", { messageKey: "errors.videoBandwidthLimitReached" });
  }

  const descriptor = await adapter.createSignedPlaybackDescriptor({
    providerAssetId: video.providerAssetId,
    workspaceId: scope.workspaceId,
    videoId: video.id,
    viewerKey: `staff:${scope.actorUserId}`,
    ttlSeconds: PLAYBACK_TOKEN_TTL_SECONDS,
    durationSeconds: video.durationSeconds,
    now,
  });

  await withScope(scope, async (tx) => {
    await incrementVideoPlaybackCountTx(tx, scope.workspaceId, video.id);
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "video_lesson",
      entityId: video.id,
      action: "video.playback_authorized",
      diff: {
        viewerKind: "staff",
        expiresAt: descriptor.expiresAt,
      },
      requestId: contextId(request),
      ipHash: request?.ipHash ?? null,
    });
  });

  return {
    video: {
      id: video.id,
      title: video.title,
      description: video.description,
      topic: video.topic,
      durationSeconds: video.durationSeconds,
    },
    playback: descriptor,
  };
}

export async function issuePortalVideoPlayback(
  portal: PortalContext,
  videoId: string,
  request?: RequestContext,
  now: Date = new Date(),
) {
  const adapter = getVideoProviderAdapter();
  if (!adapter.isConfigured) {
    throw new AppError("CONFLICT", { messageKey: "errors.videoProviderNotConfigured" });
  }

  const env = getServerEnv();

  for (const workspaceId of portal.workspaceIds) {
    const allowedGrants = portal.grants.filter(
      (grant) =>
        grant.workspaceId === workspaceId &&
        resolvePortalPermissions(grant.kind, grant.permissions).showResources,
    );
    if (allowedGrants.length === 0) continue;

    const studentIds = allowedGrants.map((grant) => grant.studentId);
    const video = await findAuthorizedPortalVideo({
      workspaceId,
      videoId,
      studentIds,
    });
    if (!video) continue;

    if (video.assetStatus !== "ready") {
      throw new AppError("CONFLICT", { messageKey: "errors.videoNotReadyForPlayback" });
    }

    const usage = await getWorkspaceVideoUsage({ workspaceId });
    if (
      usage.estimatedBandwidthBytes + video.sizeBytes >
      env.VIDEO_MAX_BANDWIDTH_BYTES_PER_MONTH
    ) {
      throw new AppError("CONFLICT", { messageKey: "errors.videoBandwidthLimitReached" });
    }

    const primaryGrant = allowedGrants[0]!;
    const descriptor = await adapter.createSignedPlaybackDescriptor({
      providerAssetId: video.providerAssetId,
      workspaceId,
      videoId: video.id,
      viewerKey: `portal:${primaryGrant.kind}:${portal.userId}`,
      ttlSeconds: PLAYBACK_TOKEN_TTL_SECONDS,
      durationSeconds: video.durationSeconds,
      now,
    });

    await withScope({ workspaceId }, async (tx) => {
      await incrementVideoPlaybackCountTx(tx, workspaceId, video.id);
      await writeAuditEvent(tx, {
        workspaceId,
        actorUserId: portal.userId,
        actorDisplayName: portal.user?.name ?? primaryGrant.kind,
        actorType: "user",
        entityType: "video_lesson",
        entityId: video.id,
        action: "video.portal_playback_authorized",
        diff: {
          viewerKind: primaryGrant.kind,
          studentId: primaryGrant.studentId,
          expiresAt: descriptor.expiresAt,
        },
        requestId: contextId(request),
        ipHash: request?.ipHash ?? null,
      });
    });

    return {
      video: {
        id: video.id,
        title: video.title,
        description: video.description,
        topic: video.topic,
        durationSeconds: video.durationSeconds,
      },
      playback: descriptor,
    };
  }

  throw new AppError("NOT_FOUND");
}

export async function consumeVideoProviderWebhook(input: {
  workspaceId: string;
  rawBody: string;
  signatureHeader: string | null;
  now?: Date;
}) {
  const adapter = getVideoProviderAdapter();
  if (!adapter.isConfigured) {
    throw new AppError("CONFLICT", { messageKey: "errors.videoProviderNotConfigured" });
  }

  const verified = adapter.verifyWebhook({
    rawBody: input.rawBody,
    signatureHeader: input.signatureHeader,
    now: input.now,
  });
  if (!verified) {
    throw new AppError("UNAUTHORIZED", { messageKey: "errors.invalidWebhookSignature" });
  }

  const updated = await applyVideoWebhookStateInScope(
    input.workspaceId,
    verified,
    input.now ?? new Date(),
  );
  return {
    accepted: true,
    updated: Boolean(updated),
    assetStatus: updated?.assetStatus ?? verified.state,
  };
}
