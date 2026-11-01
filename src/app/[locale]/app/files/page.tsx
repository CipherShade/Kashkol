import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffSession } from "@/modules/identity/session";
import { getGroups } from "@/modules/groups/service";
import { groupQuerySchema } from "@/modules/groups/schemas";
import { listSubjects } from "@/modules/groups/repository";
import { getStudents } from "@/modules/students/service";
import { studentQuerySchema } from "@/modules/students/schemas";
import { isAllowed } from "@/modules/tenancy/types";
import { isScannerConfigured, isStorageConfigured, listMaterials } from "@/modules/files";
import { filesQuerySchema } from "@/modules/files/schemas";
import { listVideoLessons, videosQuerySchema } from "@/modules/videos";
import { FilesClient } from "@/components/files/files-client";

export const dynamic = "force-dynamic";

export default async function FilesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { scope } = await requireStaffSession();
  const t = await getTranslations("Files");
  if (!isAllowed(scope, "files", "read")) {
    return (
      <div className="app-page">
        <PageHeader title={t("title")} />
        <Card>
          <CardBody>
            <EmptyState title={t("noPermission")} />
          </CardBody>
        </Card>
      </div>
    );
  }

  const [materials, videoData, groups, students, subjects] = await Promise.all([
    listMaterials(scope, filesQuerySchema.parse({})),
    listVideoLessons(scope, videosQuerySchema.parse({})),
    isAllowed(scope, "grades", "read")
      ? getGroups(scope, groupQuerySchema.parse({}))
      : Promise.resolve([]),
    isAllowed(scope, "students", "read")
      ? getStudents(scope, studentQuerySchema.parse({ pageSize: 100, status: "active" }))
      : Promise.resolve({ items: [] }),
    isAllowed(scope, "grades", "read") ? listSubjects(scope) : Promise.resolve([]),
  ]);
  return (
    <div className="app-page space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <FilesClient
        initialMaterials={materials.items.map((material) => ({
          ...material,
          archivedAt: material.archivedAt?.toISOString() ?? null,
          createdAt: material.createdAt.toISOString(),
        }))}
        initialUsedBytes={materials.usedBytes}
        initialVideoData={{
          providerStatus: videoData.providerStatus,
          usage: {
            videoCount: videoData.usage.videoCount,
            totalStorageBytes: videoData.usage.storageBytes,
            totalDurationSeconds: videoData.usage.totalDurationSeconds,
            totalPlaybacks: videoData.usage.totalPlaybacks,
            estimatedBandwidthBytes: videoData.usage.estimatedBandwidthBytes,
          },
          limits: {
            maxCount: videoData.usage.limits.maxVideoCount,
            maxStorageBytes: videoData.usage.limits.maxStorageBytes,
            maxBandwidthBytesPerMonth: videoData.usage.limits.maxBandwidthBytesPerMonth,
          },
          items: videoData.items.map((v) => ({
            id: v.id,
            provider: v.provider,
            externalAssetId: v.providerAssetId,
            title: v.title,
            description: v.description,
            topic: v.topic,
            subject: v.subject,
            scope: v.scope,
            publicationStatus: v.publicationStatus,
            assetStatus:
              v.assetStatus === "pending"
                ? "pending_upload"
                : v.assetStatus === "unavailable"
                  ? "failed"
                  : v.assetStatus,
            durationSeconds: v.durationSeconds,
            sizeBytes: v.sizeBytes,
            thumbnailUrl: v.thumbnailPath,
            playbackCount: v.playbackCount,
            estimatedBandwidthBytes: v.estimatedBandwidthBytes,
            ownerId: scope.actorUserId,
            publishedAt: v.publishedAt,
            archivedAt: v.archivedAt,
            createdAt: v.createdAt,
            groups: v.groups,
            students: v.students,
          })),
        }}
        groups={groups.map(({ id, name }) => ({ id, name }))}
        students={students.items.map(({ id, firstName, lastName }) => ({
          id,
          name: `${firstName} ${lastName}`,
        }))}
        subjects={subjects.map(({ id, name }) => ({ id, name }))}
        actorUserId={scope.actorUserId}
        locale={locale}
        canWrite={isAllowed(scope, "files", "write")}
        canShareGroups={isAllowed(scope, "grades", "read")}
        canShareStudents={isAllowed(scope, "students", "read")}
        storageReady={isStorageConfigured()}
        scannerReady={isScannerConfigured()}
        maxFileSizeBytes={25 * 1024 * 1024}
      />
    </div>
  );
}
