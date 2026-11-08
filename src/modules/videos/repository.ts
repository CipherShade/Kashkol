import type { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";
import type { VideosQuery } from "./schemas";

const videoSelection = {
  id: true,
  workspaceId: true,
  groupId: true,
  subjectId: true,
  title: true,
  description: true,
  topic: true,
  scope: true,
  publicationStatus: true,
  provider: true,
  providerAssetId: true,
  assetStatus: true,
  durationSeconds: true,
  sizeBytes: true,
  thumbnailPath: true,
  requireSignedPlayback: true,
  playbackCount: true,
  lastVerifiedAt: true,
  publishedAt: true,
  archivedAt: true,
  deletedAt: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  subject: { select: { id: true, name: true } },
  groupAccesses: {
    select: {
      groupId: true,
      group: { select: { id: true, name: true, archivedAt: true } },
    },
  },
  studentAccesses: {
    select: {
      studentId: true,
      student: { select: { id: true, firstName: true, lastName: true, archivedAt: true } },
    },
  },
} satisfies Prisma.VideoLessonSelect;

type VideoScope = "teacher_only" | "groups" | "students" | "form_upload";

function isVideoScope(scope: string): scope is VideoScope {
  return scope === "teacher_only" || scope === "groups" || scope === "students";
}

export async function listVideoLessonRows(scope: Scope, query: VideosQuery) {
  const rows = await withScope(scope, (tx) =>
    tx.videoLesson.findMany({
      where: {
        workspaceId: scope.workspaceId,
        deletedAt: null,
        archivedAt: query.includeArchived ? undefined : null,
        publicationStatus: query.publicationStatus,
        subjectId: query.subjectId,
        // A video lesson can never use the public-form upload scope.
        scope: { not: "form_upload" },
        ...(query.groupId
          ? {
              OR: [
                { groupId: query.groupId },
                { groupAccesses: { some: { groupId: query.groupId } } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      select: videoSelection,
    }),
  );
  return rows.filter(
    (row): row is (typeof rows)[number] & { scope: VideoScope } => isVideoScope(row.scope),
  );
}

export async function findVideoLesson(scope: Pick<Scope, "workspaceId">, videoId: string) {
  return withScope(scope, (tx) =>
    tx.videoLesson.findFirst({
      where: {
        id: videoId,
        workspaceId: scope.workspaceId,
        deletedAt: null,
        scope: { not: "form_upload" },
      },
      select: videoSelection,
    }),
  );
}

export async function getWorkspaceVideoUsage(scope: Pick<Scope, "workspaceId">) {
  return withScope(scope, async (tx) => {
    const rows = await tx.videoLesson.findMany({
      where: {
        workspaceId: scope.workspaceId,
        deletedAt: null,
      },
      select: {
        sizeBytes: true,
        durationSeconds: true,
        playbackCount: true,
        publicationStatus: true,
        assetStatus: true,
      },
    });

    let storageBytes = 0;
    let totalDurationSeconds = 0;
    let totalPlaybacks = 0;
    let estimatedBandwidthBytes = 0;
    let publishedCount = 0;

    for (const row of rows) {
      storageBytes += row.sizeBytes;
      totalDurationSeconds += row.durationSeconds;
      totalPlaybacks += row.playbackCount;
      estimatedBandwidthBytes += row.sizeBytes * row.playbackCount;
      if (row.publicationStatus === "published") {
        publishedCount += 1;
      }
    }

    return {
      videoCount: rows.length,
      publishedCount,
      storageBytes,
      totalDurationSeconds,
      totalPlaybacks,
      estimatedBandwidthBytes,
    };
  });
}

export async function findAuthorizedPortalVideo(input: {
  workspaceId: string;
  videoId: string;
  studentIds: string[];
}) {
  return withScope({ workspaceId: input.workspaceId }, (tx) =>
    tx.videoLesson.findFirst({
      where: {
        id: input.videoId,
        workspaceId: input.workspaceId,
        deletedAt: null,
        archivedAt: null,
        publicationStatus: "published",
        OR: [
          {
            scope: "students",
            studentAccesses: {
              some: {
                studentId: { in: input.studentIds },
                student: { archivedAt: null },
              },
            },
          },
          {
            scope: "groups",
            groupAccesses: {
              some: {
                group: {
                  archivedAt: null,
                  enrollments: {
                    some: {
                      studentId: { in: input.studentIds },
                      leftAt: null,
                      student: { archivedAt: null },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      select: videoSelection,
    }),
  );
}

export async function incrementVideoPlaybackCountTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  videoId: string,
) {
  return tx.videoLesson.update({
    where: {
      workspaceId_id: {
        workspaceId,
        id: videoId,
      },
    },
    data: {
      playbackCount: { increment: 1 },
    },
    select: {
      id: true,
      playbackCount: true,
    },
  });
}

export async function applyVideoWebhookStateInScope(
  workspaceId: string,
  payload: {
    providerAssetId: string;
    state: "pending" | "processing" | "ready" | "failed" | "unavailable";
    durationSeconds?: number;
    sizeBytes?: number;
  },
  now: Date = new Date(),
) {
  return withScope({ workspaceId }, async (tx) => {
    const existing = await tx.videoLesson.findFirst({
      where: {
        workspaceId,
        providerAssetId: payload.providerAssetId,
        deletedAt: null,
      },
      select: {
        id: true,
        assetStatus: true,
        durationSeconds: true,
        sizeBytes: true,
      },
    });
    if (!existing) return null;

    return tx.videoLesson.update({
      where: { id: existing.id },
      data: {
        assetStatus: payload.state,
        durationSeconds: payload.durationSeconds ?? existing.durationSeconds,
        sizeBytes: payload.sizeBytes ?? existing.sizeBytes,
        lastVerifiedAt: now,
      },
      select: {
        id: true,
        assetStatus: true,
        durationSeconds: true,
        sizeBytes: true,
      },
    });
  });
}
