import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  put: vi.fn(async (_input: { key: string; body: Buffer; contentType: string }) => {}),
  delete: vi.fn(async (_key: string) => {}),
  signDownload: vi.fn(
    async (_input: { key: string; ttlSeconds: number; filename: string; contentType: string }) =>
      "https://storage.test/signed",
  ),
}));
const scanner = vi.hoisted(() => ({ scan: vi.fn(async () => ({ clean: true })) }));
const repository = vi.hoisted(() => ({
  submitStudentHomeworkInScope: vi.fn(),
  findOwnHomeworkSubmissionFile: vi.fn(),
  MAX_HOMEWORK_SUBMISSION_FILES: 5,
}));
const filesModule = vi.hoisted(() => ({
  isStorageConfigured: vi.fn(() => true),
  isScannerConfigured: vi.fn(() => true),
  validateFileContent: vi.fn(() => ({ extension: "pdf", mime: "application/pdf" })),
  DOWNLOAD_URL_TTL_SECONDS: 180,
}));
const session = vi.hoisted(() => ({ resolvePortalStudent: vi.fn() }));
const tokens = vi.hoisted(() => ({ resolvePortalPermissions: vi.fn(() => ({ showHomework: true })) }));
const audit = vi.hoisted(() => ({ writeAuditEvent: vi.fn(async () => {}) }));

vi.mock("@/modules/files/adapters", () => ({
  getFileStorageAdapter: () => storage,
  getMalwareScanAdapter: () => scanner,
}));
vi.mock("@/modules/files", () => filesModule);
vi.mock("@/modules/portals/repository", () => repository);
vi.mock("@/modules/identity/session", () => session);
vi.mock("@/modules/portals/tokens", () => tokens);
vi.mock("@/modules/audit/service", () => audit);

import {
  getHomeworkSubmissionFileDownloadUrl,
  submitStudentHomeworkWithFiles,
} from "@/modules/portals/homework-submission-files";
import { AppError } from "@/lib/http/errors";
import type { PortalContext } from "@/modules/identity/session";

const portal = {
  userId: "portal-user",
  user: { id: "portal-user" },
  grants: [{ kind: "student", studentId: "student-1", workspaceId: "ws-1", permissions: [] }],
  workspaceIds: ["ws-1"],
} as unknown as PortalContext;

const upload = {
  filename: "answer.pdf",
  mime: "application/pdf",
  sizeBytes: 8,
  body: Buffer.from("%PDF-1.4"),
};

beforeEach(() => {
  vi.clearAllMocks();
  filesModule.isStorageConfigured.mockReturnValue(true);
  filesModule.isScannerConfigured.mockReturnValue(true);
  scanner.scan.mockResolvedValue({ clean: true });
  session.resolvePortalStudent.mockResolvedValue({
    grant: portal.grants[0],
    student: { firstName: "Amina", lastName: "Test" },
  });
  tokens.resolvePortalPermissions.mockReturnValue({ showHomework: true } as never);
  repository.submitStudentHomeworkInScope.mockImplementation(
    async (_grant, _user, _homework, _now, _uploads, onSubmitted) => {
      if (onSubmitted) {
        await onSubmitted({}, { id: "submission-1", status: "submitted" }, ["file-1"]);
      }
      return { homeworkId: "homework-1", status: "submitted", submittedAt: "now", fileIds: ["file-1"] };
    },
  );
});

describe("homework submission files", () => {
  it("scans and stores before the transaction, then writes the audit inside it", async () => {
    const result = await submitStudentHomeworkWithFiles(portal, "homework-1", "student-1", [upload]);
    expect(result.fileIds).toEqual(["file-1"]);
    expect(scanner.scan).toHaveBeenCalledWith(upload.body);
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(storage.put.mock.calls[0][0].key).toMatch(/^ws\/[^/]+\/[0-9a-f-]+\.pdf$/);
    expect(audit.writeAuditEvent).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ action: "homework.submitted", diff: { homeworkId: "homework-1", outcome: "submitted", fileCount: 1 } }),
    );
    expect(repository.submitStudentHomeworkInScope.mock.calls[0][4]).toHaveLength(1);
  });

  it("fails closed when scanning is unavailable", async () => {
    filesModule.isScannerConfigured.mockReturnValue(false);
    await expect(
      submitStudentHomeworkWithFiles(portal, "homework-1", "student-1", [upload]),
    ).rejects.toMatchObject({ code: "CONFLICT", messageKey: "errors.fileScannerUnavailable" });
    expect(scanner.scan).not.toHaveBeenCalled();
    expect(repository.submitStudentHomeworkInScope).not.toHaveBeenCalled();
  });

  it("deletes stored objects when the malware scan blocks a file", async () => {
    scanner.scan.mockResolvedValue({ clean: false });
    await expect(
      submitStudentHomeworkWithFiles(portal, "homework-1", "student-1", [upload]),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", messageKey: "errors.fileMalware" });
    expect(storage.put).not.toHaveBeenCalled();
    expect(repository.submitStudentHomeworkInScope).not.toHaveBeenCalled();
  });

  it("deletes every stored object when the transaction fails", async () => {
    repository.submitStudentHomeworkInScope.mockRejectedValue(new AppError("CONFLICT"));
    await expect(
      submitStudentHomeworkWithFiles(portal, "homework-1", "student-1", [upload]),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(storage.delete).toHaveBeenCalledTimes(1);
  });

  it("rejects more than five files before any storage write", async () => {
    await expect(
      submitStudentHomeworkWithFiles(portal, "homework-1", "student-1", Array(6).fill(upload)),
    ).rejects.toMatchObject({ messageKey: "errors.homeworkSubmissionFileLimit" });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("signs a download only for the student's own submitted file", async () => {
    repository.findOwnHomeworkSubmissionFile.mockResolvedValue({
      file: { id: "file-1", title: "answer.pdf", mime: "application/pdf", storageKey: "ws/ws-1/file-1.pdf" },
    });
    const url = await getHomeworkSubmissionFileDownloadUrl(portal, "homework-1", "file-1", "student-1");
    expect(url).toBe("https://storage.test/signed");
    expect(storage.signDownload.mock.calls[0][0]).toMatchObject({ ttlSeconds: 180 });
  });

  it("returns NOT_FOUND for a foreign file", async () => {
    repository.findOwnHomeworkSubmissionFile.mockResolvedValue(null);
    await expect(
      getHomeworkSubmissionFileDownloadUrl(portal, "homework-1", "foreign", "student-1"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.signDownload).not.toHaveBeenCalled();
  });
});
