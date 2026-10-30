import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/http/errors";
import { disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import { resetServerEnvForTests } from "@/lib/config/env";
import type { PortalContext } from "@/modules/identity/session";
import {
  getPortalMaterialDownloadUrl,
  getMaterialDownloadUrl,
  archiveMaterial,
  deleteMaterial,
  listMaterials,
} from "@/modules/files/service";
import { getFileStorageAdapter } from "@/modules/files/adapters";
import { LocalFileStorageAdapter } from "@/modules/files/adapters/local";
import { DELTA, NILE, createStudent, ownerScope } from "./helpers";

const fileIds: Array<{ workspaceId: string; id: string; storageKey: string }> = [];
const studentIds: Array<{ workspaceId: string; id: string }> = [];

beforeAll(() => {
  process.env.FILE_STORAGE_DRIVER = "local";
  resetServerEnvForTests();
});

afterAll(async () => {
  await disconnectDb();
});

afterEach(async () => {
  for (const workspaceId of [NILE, DELTA]) {
    const ids = fileIds.filter((file) => file.workspaceId === workspaceId).map(({ id }) => id);
    await withScope({ workspaceId }, async (tx) => {
      await tx.fileGroupAccess.deleteMany({ where: { workspaceId, fileId: { in: ids } } });
      await tx.fileStudentAccess.deleteMany({ where: { workspaceId, fileId: { in: ids } } });
      await tx.file.deleteMany({ where: { workspaceId, id: { in: ids } } });
    });
  }
  for (const student of studentIds) {
    await withScope({ workspaceId: student.workspaceId }, async (tx) => {
      await tx.enrollment.deleteMany({
        where: { workspaceId: student.workspaceId, studentId: student.id },
      });
      await tx.student.deleteMany({ where: { workspaceId: student.workspaceId, id: student.id } });
    });
  }
  await Promise.all(fileIds.map(({ storageKey }) => getFileStorageAdapter().delete(storageKey)));
  fileIds.length = 0;
  studentIds.length = 0;
});

async function createFile(
  workspaceId: string,
  studentId: string,
  scope: "students" | "teacher_only",
  scanStatus: "pending" | "clean" | "blocked" = "clean",
) {
  const id = randomUUID();
  const storageKey = `ws/${workspaceId}/${randomUUID()}.pdf`;
  await withScope({ workspaceId }, async (tx) => {
    await tx.file.create({
      data: {
        id,
        workspaceId,
        scope,
        studentId: scope === "students" ? studentId : null,
        title: "Test worksheet",
        storageKey,
        sizeBytes: 8,
        mime: "application/pdf",
        scanStatus,
        uploadedBy: "10000000-0000-4000-8000-000000000001",
        ...(scope === "students"
          ? {
              studentAccesses: {
                create: { studentId },
              },
            }
          : {}),
      },
    });
  });
  fileIds.push({ workspaceId, id, storageKey });
  return id;
}

function portal(workspaceId: string, studentId: string, kind: "parent" | "student"): PortalContext {
  return {
    userId: randomUUID(),
    grants: [{ workspaceId, studentId, kind, expiresAt: null }],
    workspaceIds: [workspaceId],
    studentIds: new Set([studentId]),
  };
}

describe("learning material authorization and lifecycle", () => {
  it("denies cross-tenant staff downloads without exposing the foreign file", async () => {
    const deltaStudent = await createStudent(DELTA, `Material-${randomUUID()}`);
    studentIds.push({ workspaceId: DELTA, id: deltaStudent });
    const foreignId = await createFile(DELTA, deltaStudent, "students");

    await expect(getMaterialDownloadUrl(ownerScope(), foreignId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("denies student and parent portal access outside the selected student assignment", async () => {
    const assignedStudent = await createStudent(NILE, `Assigned-${randomUUID()}`);
    const otherStudent = await createStudent(NILE, `Other-${randomUUID()}`);
    studentIds.push(
      { workspaceId: NILE, id: assignedStudent },
      { workspaceId: NILE, id: otherStudent },
    );
    const fileId = await createFile(NILE, assignedStudent, "students");

    await expect(
      getPortalMaterialDownloadUrl(portal(NILE, otherStudent, "student"), fileId),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      getPortalMaterialDownloadUrl(portal(NILE, otherStudent, "parent"), fileId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      getPortalMaterialDownloadUrl(portal(NILE, assignedStudent, "parent"), fileId),
    ).resolves.toContain("/api/files/local-download");
  });

  it("denies teacher-only material to portal accounts and revokes archived access", async () => {
    const studentId = await createStudent(NILE, `Private-${randomUUID()}`);
    studentIds.push({ workspaceId: NILE, id: studentId });
    const fileId = await createFile(NILE, studentId, "teacher_only");

    await expect(
      getPortalMaterialDownloadUrl(portal(NILE, studentId, "parent"), fileId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await archiveMaterial(ownerScope(), fileId, true);
    await expect(
      getPortalMaterialDownloadUrl(portal(NILE, studentId, "parent"), fileId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each(["pending", "blocked"] as const)(
    "does not issue a download URL for %s files",
    async (scanStatus) => {
      const studentId = await createStudent(NILE, `Unscanned-${randomUUID()}`);
      studentIds.push({ workspaceId: NILE, id: studentId });
      const fileId = await createFile(NILE, studentId, "students", scanStatus);

      await expect(getMaterialDownloadUrl(ownerScope(), fileId)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      await expect(
        getPortalMaterialDownloadUrl(portal(NILE, studentId, "parent"), fileId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    },
  );

  it("removes archived files from active lists and deletes the object on explicit deletion", async () => {
    process.env.FILE_STORAGE_DRIVER = "local";
    resetServerEnvForTests();
    const studentId = await createStudent(NILE, `Lifecycle-${randomUUID()}`);
    studentIds.push({ workspaceId: NILE, id: studentId });
    const fileId = await createFile(NILE, studentId, "students");
    const file = fileIds.find((candidate) => candidate.id === fileId);
    if (!file) throw new Error("file fixture missing");
    const storage = getFileStorageAdapter();
    await storage.put({
      key: file.storageKey,
      body: Buffer.from("%PDF-1.7"),
      contentType: "application/pdf",
    });

    await archiveMaterial(ownerScope(), fileId, true);
    await expect(listMaterials(ownerScope(), { archived: false })).resolves.toMatchObject({
      items: expect.not.arrayContaining([expect.objectContaining({ id: fileId })]),
    });
    await expect(listMaterials(ownerScope(), { archived: true })).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: fileId })]),
    });
    const archived = await withScope({ workspaceId: NILE }, (tx) =>
      tx.file.findFirst({ where: { id: fileId }, select: { archivedAt: true } }),
    );
    expect(archived?.archivedAt).not.toBeNull();

    await deleteMaterial(ownerScope(), fileId);
    const deleted = await withScope({ workspaceId: NILE }, (tx) =>
      tx.file.findFirst({ where: { id: fileId }, select: { deletedAt: true } }),
    );
    expect(deleted?.deletedAt).not.toBeNull();
    expect(await storage.exists(file.storageKey)).toBe(false);
  });

  it("keeps a file available for deletion retry when object storage fails", async () => {
    const studentId = await createStudent(NILE, `RetryDelete-${randomUUID()}`);
    studentIds.push({ workspaceId: NILE, id: studentId });
    const fileId = await createFile(NILE, studentId, "students");
    const removeObject = vi
      .spyOn(LocalFileStorageAdapter.prototype, "delete")
      .mockRejectedValueOnce(new Error("storage unavailable"));

    try {
      await expect(deleteMaterial(ownerScope(), fileId)).rejects.toThrow("storage unavailable");
      const file = await withScope({ workspaceId: NILE }, (tx) =>
        tx.file.findFirst({ where: { id: fileId }, select: { deletedAt: true } }),
      );
      expect(file?.deletedAt).toBeNull();
    } finally {
      removeObject.mockRestore();
    }
  });
});
