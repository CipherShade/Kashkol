import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const adapters = vi.hoisted(() => ({
  put: vi.fn(async () => {}),
  delete: vi.fn(async () => {}),
  signDownload: vi.fn(async () => "https://storage.test/signed"),
  scan: vi.fn(async () => ({ clean: true })),
}));
const config = vi.hoisted(() => ({
  isStorageConfigured: vi.fn(() => true),
  isScannerConfigured: vi.fn(() => true),
}));

vi.mock("@/modules/files/adapters", () => ({
  getFileStorageAdapter: () => adapters,
  getMalwareScanAdapter: () => ({ scan: adapters.scan }),
}));
vi.mock("@/modules/files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/files")>();
  return { ...actual, ...config };
});

import { disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import { requireStudentPortalContext } from "@/modules/identity/session";
import {
  acceptPortalInvitation,
  getStudentPortalOverview,
  issuePortalInvitation,
  submitStudentHomeworkWithFiles,
} from "@/modules/portals";
import {
  cookieFrom,
  createStudent,
  createTestUser,
  deleteStudent,
  deleteTestUser,
  NILE,
  ownerScope,
  signIn,
} from "./helpers";

afterAll(async () => {
  await disconnectDb();
});

beforeEach(() => {
  vi.clearAllMocks();
  config.isStorageConfigured.mockReturnValue(true);
  config.isScannerConfigured.mockReturnValue(true);
  adapters.scan.mockResolvedValue({ clean: true });
});

describe("homework submission files against PostgreSQL RLS", () => {
  it("attaches a scanned file to the student's own submission and exposes it only there", async () => {
    const studentUser = await createTestUser("hw-file-student");
    const studentId = await createStudent(NILE, "Submitter");
    const groupId = randomUUID();
    const homeworkId = randomUUID();
    const scope = ownerScope();
    let attachedFileIds: string[] = [];

    try {
      await withScope({ workspaceId: NILE }, async (tx) => {
        await tx.group.create({ data: { id: groupId, workspaceId: NILE, name: "HW File Group" } });
        await tx.enrollment.create({ data: { workspaceId: NILE, groupId, studentId } });
        await tx.homework.create({
          data: {
            id: homeworkId,
            workspaceId: NILE,
            groupId,
            title: "Scan upload",
            dueAt: new Date(Date.now() + 86_400_000),
            status: "active",
            createdBy: scope.actorUserId,
          },
        });
        await tx.homeworkSubmission.create({
          data: {
            workspaceId: NILE,
            homeworkId,
            studentId,
            status: "not_submitted",
            updatedBy: scope.actorUserId,
          },
        });
      });

      const invitation = await issuePortalInvitation(scope, {
        studentId,
        kind: "student",
        email: studentUser.email,
      });
      await acceptPortalInvitation(studentUser.id, {
        token: invitation.verificationPath.split("/").pop()!,
      });
      const signedIn = await signIn(studentUser.email, studentUser.password);
      const portal = await requireStudentPortalContext(new Headers({ cookie: cookieFrom(signedIn) }));

      const result = await submitStudentHomeworkWithFiles(portal, homeworkId, studentId, [
        { filename: "answer.pdf", mime: "application/pdf", sizeBytes: 8, body: Buffer.from("%PDF-1.4") },
      ]);
      expect(result.status).toBe("submitted");
      expect(result.fileIds).toHaveLength(1);
      attachedFileIds = result.fileIds;

      const stored = await withScope({ workspaceId: NILE }, (tx) =>
        tx.homeworkSubmissionFile.findMany({
          where: { workspaceId: NILE, submission: { homeworkId, studentId } },
          include: { file: true },
        }),
      );
      expect(stored).toHaveLength(1);
      expect(stored[0].file.scope).toBe("homework_submission");
      expect(stored[0].file.scanStatus).toBe("clean");
      expect(stored[0].file.storageKey).toMatch(/^ws\/[0-9a-f-]+\/[0-9a-f-]+\.pdf$/);

      const overview = await getStudentPortalOverview(portal, studentId);
      const assignment = overview.homework?.find((hw) => hw.id === homeworkId);
      expect(assignment?.submission.files).toHaveLength(1);
      expect(assignment?.submission.files[0].downloadUrl).toContain(
        `/api/portal/student/homework/${homeworkId}/files/${result.fileIds[0]}/download`,
      );

      const teacherView = await withScope({ workspaceId: NILE }, (tx) =>
        tx.homeworkSubmissionFile.count({ where: { workspaceId: NILE, fileId: randomUUID() } }),
      );
      expect(teacherView).toBe(0);
    } finally {
      await withScope({ workspaceId: NILE }, async (tx) => {
        await tx.homeworkSubmissionFile.deleteMany({
          where: { workspaceId: NILE, submission: { homeworkId } },
        });
        await tx.file.deleteMany({ where: { workspaceId: NILE, id: { in: attachedFileIds } } });
        await tx.homeworkSubmission.deleteMany({ where: { workspaceId: NILE, homeworkId } });
        await tx.homework.deleteMany({ where: { workspaceId: NILE, id: homeworkId } });
        await tx.portalGrant.deleteMany({ where: { workspaceId: NILE, studentId } });
        await tx.enrollment.deleteMany({ where: { workspaceId: NILE, studentId } });
        await tx.group.deleteMany({ where: { workspaceId: NILE, id: groupId } });
      });
      await deleteStudent(NILE, studentId);
      await deleteTestUser(studentUser);
    }
  });

  it("writes no rows when the storage configuration is missing", async () => {
    config.isStorageConfigured.mockReturnValue(false);
    const studentUser = await createTestUser("hw-file-nostore");
    const studentId = await createStudent(NILE, "No Store");
    const groupId = randomUUID();
    const homeworkId = randomUUID();
    const scope = ownerScope();

    try {
      await withScope({ workspaceId: NILE }, async (tx) => {
        await tx.group.create({ data: { id: groupId, workspaceId: NILE, name: "No Store Group" } });
        await tx.enrollment.create({ data: { workspaceId: NILE, groupId, studentId } });
        await tx.homework.create({
          data: {
            id: homeworkId,
            workspaceId: NILE,
            groupId,
            title: "No store",
            dueAt: new Date(Date.now() + 86_400_000),
            status: "active",
            createdBy: scope.actorUserId,
          },
        });
      });
      const invitation = await issuePortalInvitation(scope, {
        studentId,
        kind: "student",
        email: studentUser.email,
      });
      await acceptPortalInvitation(studentUser.id, {
        token: invitation.verificationPath.split("/").pop()!,
      });
      const signedIn = await signIn(studentUser.email, studentUser.password);
      const portal = await requireStudentPortalContext(new Headers({ cookie: cookieFrom(signedIn) }));

      await expect(
        submitStudentHomeworkWithFiles(portal, homeworkId, studentId, [
          { filename: "answer.pdf", mime: "application/pdf", sizeBytes: 8, body: Buffer.from("%PDF-1.4") },
        ]),
      ).rejects.toMatchObject({ code: "CONFLICT", messageKey: "errors.fileStorageUnavailable" });

      const count = await withScope({ workspaceId: NILE }, (tx) =>
        tx.homeworkSubmissionFile.count({ where: { workspaceId: NILE } }),
      );
      expect(count).toBe(0);
      expect(adapters.put).not.toHaveBeenCalled();
    } finally {
      await withScope({ workspaceId: NILE }, async (tx) => {
        await tx.homeworkSubmissionFile.deleteMany({
          where: { workspaceId: NILE, submission: { homeworkId } },
        });
        await tx.homeworkSubmission.deleteMany({ where: { workspaceId: NILE, homeworkId } });
        await tx.homework.deleteMany({ where: { workspaceId: NILE, id: homeworkId } });
        await tx.portalGrant.deleteMany({ where: { workspaceId: NILE, studentId } });
        await tx.enrollment.deleteMany({ where: { workspaceId: NILE, studentId } });
        await tx.group.deleteMany({ where: { workspaceId: NILE, id: groupId } });
      });
      await deleteStudent(NILE, studentId);
      await deleteTestUser(studentUser);
    }
  });
});
