import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { getServerEnv } from "@/lib/config/env";
import { writeAuditEvent } from "@/modules/audit/service";
import { authorize, type Scope } from "@/modules/tenancy/types";
import type { PortalContext } from "@/modules/identity/session";
import { getFileStorageAdapter, getMalwareScanAdapter } from "./adapters";
import { DOWNLOAD_URL_TTL_SECONDS } from "./constants";
import { findMaterial, getWorkspaceStorageUsage, listMaterialRows } from "./repository";
import type { CreateMaterialInput, FilesQuery, UpdateMaterialInput } from "./schemas";
import { safeDownloadFilename } from "./validation";

type RequestContext = { requestId?: string };
const contextId = (request?: RequestContext) => request?.requestId ?? newRequestId();

export function isStorageConfigured(): boolean {
  const env = getServerEnv();
  return env.FILE_STORAGE_DRIVER === "local" || Boolean(env.S3_BUCKET && env.S3_REGION);
}

export function isScannerConfigured(): boolean {
  return Boolean(getServerEnv().CLAMAV_HOST);
}

export async function listMaterials(scope: Scope, query: FilesQuery) {
  authorize(scope, "files", "read");
  const [rows, usedBytes] = await Promise.all([
    listMaterialRows(scope, query),
    getWorkspaceStorageUsage(scope),
  ]);
  return {
    usedBytes,
    items: rows.map((file) => ({
      id: file.id,
      scope: file.scope,
      title: file.title,
      description: file.description,
      topic: file.topic,
      subject: file.subject,
      sizeBytes: file.sizeBytes,
      mime: file.mime,
      scanStatus: file.scanStatus,
      ownerId: file.uploadedBy,
      archivedAt: file.archivedAt,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      groups: file.groupAccesses.map(({ group }) => ({
        id: group.id,
        name: group.name,
        archived: group.archivedAt !== null,
      })),
      students: file.studentAccesses.map(({ student }) => ({
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        archived: student.archivedAt !== null,
      })),
    })),
  };
}

export async function getMaterialDownloadUrl(scope: Scope, fileId: string) {
  authorize(scope, "files", "read");
  const file = await findMaterial(scope, fileId);
  if (!file) throw new AppError("NOT_FOUND");
  if (file.scanStatus !== "clean") {
    throw new AppError("CONFLICT", { messageKey: "errors.fileNotScanned" });
  }
  const extension = file.storageKey.split(".").pop() ?? "pdf";
  return getFileStorageAdapter().signDownload({
    key: file.storageKey,
    ttlSeconds: DOWNLOAD_URL_TTL_SECONDS,
    filename: safeDownloadFilename(file.title, extension),
    contentType: file.mime,
  });
}

export async function createMaterial(
  scope: Scope,
  input: CreateMaterialInput,
  upload: { body: Buffer; mime: string; extension: string; sizeBytes: number },
  request?: RequestContext,
) {
  authorize(scope, "files", "write");
  if (input.scope === "groups") authorize(scope, "groups", "read");
  if (input.scope === "students") authorize(scope, "students", "read");
  if (!isScannerConfigured())
    throw new AppError("CONFLICT", { messageKey: "errors.fileScannerUnavailable" });
  if (!isStorageConfigured())
    throw new AppError("CONFLICT", { messageKey: "errors.fileStorageUnavailable" });

  const id = newUuidV7();
  const storageKey = `ws/${scope.workspaceId}/${id}.${upload.extension}`;
  const storage = getFileStorageAdapter();
  await storage.put({ key: storageKey, body: upload.body, contentType: upload.mime });

  try {
    return await withScope(scope, async (tx) => {
      if (input.groupIds.length) {
        const count = await tx.group.count({
          where: {
            workspaceId: scope.workspaceId,
            id: { in: input.groupIds },
            archivedAt: null,
          },
        });
        if (count !== input.groupIds.length) throw new AppError("NOT_FOUND");
      }
      if (input.studentIds.length) {
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

      const file = await tx.file.create({
        data: {
          id,
          workspaceId: scope.workspaceId,
          scope: input.scope,
          groupId: input.scope === "groups" ? (input.groupIds[0] ?? null) : null,
          studentId: input.scope === "students" ? (input.studentIds[0] ?? null) : null,
          title: input.title,
          description: input.description,
          topic: input.topic,
          subjectId: input.subjectId,
          storageKey,
          sizeBytes: upload.sizeBytes,
          mime: upload.mime,
          scanStatus: "pending",
          uploadedBy: scope.actorUserId,
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
        select: { id: true, scanStatus: true },
      });

      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "file",
        entityId: id,
        action: "file.uploaded",
        diff: {
          scope: input.scope,
          sizeBytes: upload.sizeBytes,
          mime: upload.mime,
          groupCount: input.groupIds.length,
          studentCount: input.studentIds.length,
        },
        requestId: contextId(request),
      });
      return file;
    });
  } catch (error) {
    await storage.delete(storageKey);
    throw error;
  }
}

export async function scanMaterial(scope: Scope, fileId: string, request?: RequestContext) {
  authorize(scope, "files", "write");
  const file = await findMaterial(scope, fileId);
  if (!file) throw new AppError("NOT_FOUND");
  if (file.scanStatus !== "pending") return { id: file.id, scanStatus: file.scanStatus };

  const body = await getFileStorageAdapter().get(file.storageKey);
  const result = await getMalwareScanAdapter().scan(body);
  return withScope(scope, async (tx) => {
    const current = await tx.file.findFirst({
      where: {
        id: file.id,
        workspaceId: scope.workspaceId,
        deletedAt: null,
        scanStatus: "pending",
      },
      select: { id: true },
    });
    if (!current) throw new AppError("CONFLICT");
    const scanStatus = result.clean ? "clean" : "blocked";
    await tx.file.update({
      where: { id: file.id },
      data: { scanStatus },
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "file",
      entityId: file.id,
      action: "file.scan_result",
      diff: { scanStatus },
      requestId: contextId(request),
    });
    return { id: file.id, scanStatus };
  });
}

export async function updateMaterial(
  scope: Scope,
  fileId: string,
  input: UpdateMaterialInput,
  request?: RequestContext,
) {
  authorize(scope, "files", "write");
  return withScope(scope, async (tx) => {
    const existing = await tx.file.findFirst({
      where: { id: fileId, workspaceId: scope.workspaceId, deletedAt: null },
      select: { id: true, subjectId: true },
    });
    if (!existing) throw new AppError("NOT_FOUND");
    if (input.subjectId) {
      const subject = await tx.subject.findFirst({
        where: { id: input.subjectId, workspaceId: scope.workspaceId, archivedAt: null },
        select: { id: true },
      });
      if (!subject) throw new AppError("NOT_FOUND");
    }
    const changedFields = Object.keys(input);
    const updated = await tx.file.update({
      where: { id: existing.id },
      data: input,
      select: { id: true, title: true, description: true, topic: true, subjectId: true },
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "file",
      entityId: fileId,
      action: "file.updated",
      diff: { changedFields },
      requestId: contextId(request),
    });
    return updated;
  });
}

export async function archiveMaterial(
  scope: Scope,
  fileId: string,
  archived: boolean,
  request?: RequestContext,
) {
  authorize(scope, "files", "write");
  return withScope(scope, async (tx) => {
    const existing = await tx.file.findFirst({
      where: { id: fileId, workspaceId: scope.workspaceId, deletedAt: null },
      select: { id: true, archivedAt: true },
    });
    if (!existing) throw new AppError("NOT_FOUND");
    const archivedAt = archived ? (existing.archivedAt ?? new Date()) : null;
    await tx.file.update({ where: { id: fileId }, data: { archivedAt } });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "file",
      entityId: fileId,
      action: archived ? "file.archived" : "file.restored",
      requestId: contextId(request),
    });
    return { id: fileId, archivedAt };
  });
}

export async function deleteMaterial(scope: Scope, fileId: string, request?: RequestContext) {
  authorize(scope, "files", "write");
  const file = await findMaterial(scope, fileId);
  if (!file) throw new AppError("NOT_FOUND");
  await getFileStorageAdapter().delete(file.storageKey);
  await withScope(scope, async (tx) => {
    await tx.file.update({
      where: { id: fileId },
      data: { deletedAt: new Date() },
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "file",
      entityId: fileId,
      action: "file.deleted",
      requestId: contextId(request),
    });
  });
}

export async function getPortalMaterialDownloadUrl(portal: PortalContext, fileId: string) {
  for (const workspaceId of portal.workspaceIds) {
    const studentIds = portal.grants
      .filter((grant) => grant.workspaceId === workspaceId)
      .map((grant) => grant.studentId);
    if (studentIds.length === 0) continue;

    const file = await withScope({ workspaceId }, (tx) =>
      tx.file.findFirst({
        where: {
          id: fileId,
          workspaceId,
          deletedAt: null,
          archivedAt: null,
          scanStatus: "clean",
          OR: [
            {
              scope: "students",
              studentAccesses: {
                some: { studentId: { in: studentIds }, student: { archivedAt: null } },
              },
            },
            {
              scope: "groups",
              groupAccesses: {
                some: {
                  group: {
                    enrollments: {
                      some: {
                        studentId: { in: studentIds },
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
        select: { id: true, title: true, storageKey: true, mime: true },
      }),
    );
    if (!file) continue;
    const extension = file.storageKey.split(".").pop() ?? "pdf";
    return getFileStorageAdapter().signDownload({
      key: file.storageKey,
      ttlSeconds: DOWNLOAD_URL_TTL_SECONDS,
      filename: safeDownloadFilename(file.title, extension),
      contentType: file.mime,
    });
  }
  throw new AppError("NOT_FOUND");
}
