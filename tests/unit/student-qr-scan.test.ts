import { describe, it, expect, vi, beforeEach } from "vitest";
import { scanStudentQrCode } from "../../src/modules/attendance/service.js";
import { buildStudentQrPayload, hashStudentQrToken } from "../../src/modules/attendance/student-qr.js";
import type { Scope } from "../../src/modules/tenancy/types.js";

// Mock getServerEnv for QR HMAC verification
vi.mock("@/lib/config/env", () => ({
  getServerEnv: () => ({
    BETTER_AUTH_SECRET: "test-secret-32-chars-long-minimum-entropy!!",
  }),
}));

// Mock notifications (best-effort after transaction)
vi.mock("@/modules/notifications", () => ({
  createAttendanceNotification: vi.fn().mockResolvedValue(undefined),
}));

const fakeTx = {
  attendanceMark: {
    findFirst: vi.fn(),
  },
};

const writeAuditEventMock = vi.fn();
const getSessionWithGroupMock = vi.fn();
const findStudentForQrScanTxMock = vi.fn();
const getEnrollmentForStudentMock = vi.fn();
const getActiveEnrollmentForStudentMock = vi.fn();
const getSessionAttendeeTxMock = vi.fn();
const upsertAttendanceMarkTxMock = vi.fn();

vi.mock("@/lib/db/scope", () => ({
  withScope: vi.fn(async (_scope: unknown, cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx)),
}));

vi.mock("@/modules/audit/service", () => ({
  writeAuditEvent: (...args: unknown[]) => writeAuditEventMock(...args),
}));

vi.mock("@/modules/attendance/repository", () => ({
  getSessionWithGroup: (...args: unknown[]) => getSessionWithGroupMock(...args),
  findStudentForQrScanTx: (...args: unknown[]) => findStudentForQrScanTxMock(...args),
  getEnrollmentForStudent: (...args: unknown[]) => getEnrollmentForStudentMock(...args),
  getActiveEnrollmentForStudent: (...args: unknown[]) => getActiveEnrollmentForStudentMock(...args),
  getSessionAttendeeTx: (...args: unknown[]) => getSessionAttendeeTxMock(...args),
  upsertAttendanceMarkTx: (...args: unknown[]) => upsertAttendanceMarkTxMock(...args),
  isUniqueViolation: (err: unknown) => {
    if (!err || typeof err !== "object") return false;
    return (err as { code?: string }).code === "P2002";
  },
}));

describe("Student QR Attendance Scanning — Rejection Auditing & Concurrency", () => {
  const workspaceId = "018f6c5b-0000-7000-8000-000000000001";
  const studentId = "018f6c5b-4321-789a-bcde-ef0123456789";
  const sessionId = "018f6c5b-1111-7000-8000-000000000001";
  const groupId = "018f6c5b-2222-7000-8000-000000000001";
  const nonce = "valid-nonce-1234";

  const scope: Scope = {
    workspaceId,
    actorUserId: "018f6c5b-0000-7000-8000-000000000002",
    actorDisplayName: "Teacher Ali",
    role: "owner",
    permissions: new Set(),
  };

  const validToken = buildStudentQrPayload(studentId, nonce);
  const validHash = `${nonce}:${hashStudentQrToken(validToken)}`;

  const activeSession = {
    id: sessionId,
    workspaceId,
    groupId,
    status: "started",
    startsAt: new Date("2026-11-16T10:00:00Z"),
    endsAt: null,
    group: { name: "Group A" },
  };

  const studentRecord = {
    id: studentId,
    workspaceId,
    firstName: "Sara",
    lastName: "Ali",
    qrTokenHash: validHash,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rejection Auditing", () => {
    it("audits session_cancelled when the session status is cancelled", async () => {
      getSessionWithGroupMock.mockResolvedValueOnce({
        ...activeSession,
        status: "cancelled",
      });

      await expect(
        scanStudentQrCode(scope, { sessionId, qrToken: validToken, markLate: false }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        messageKey: "attendance.errors.sessionCancelled",
      });

      expect(writeAuditEventMock).toHaveBeenCalledWith(
        fakeTx,
        expect.objectContaining({
          workspaceId,
          action: "attendance.qr_rejected",
          entityId: sessionId,
          diff: expect.objectContaining({ outcome: "session_cancelled" }),
        }),
      );
    });

    it("audits invalid_or_revoked_student_qr when student record has null qrTokenHash", async () => {
      getSessionWithGroupMock.mockResolvedValueOnce(activeSession);
      findStudentForQrScanTxMock.mockResolvedValueOnce({
        ...studentRecord,
        qrTokenHash: null, // revoked!
      });

      await expect(
        scanStudentQrCode(scope, { sessionId, qrToken: validToken, markLate: false }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        messageKey: "attendance.errors.invalidQrCode",
      });

      expect(writeAuditEventMock).toHaveBeenCalledWith(
        fakeTx,
        expect.objectContaining({
          workspaceId,
          action: "attendance.qr_rejected",
          entityId: sessionId,
          diff: expect.objectContaining({ outcome: "invalid_or_revoked_student_qr" }),
        }),
      );
    });

    it("audits student_not_enrolled when student is not enrolled anywhere in the workspace", async () => {
      getSessionWithGroupMock.mockResolvedValueOnce(activeSession);
      findStudentForQrScanTxMock.mockResolvedValueOnce(studentRecord);
      fakeTx.attendanceMark.findFirst.mockResolvedValueOnce(null); // not duplicate
      getEnrollmentForStudentMock.mockResolvedValueOnce(null); // not in primary group
      getActiveEnrollmentForStudentMock.mockResolvedValueOnce(null); // not in any active group

      await expect(
        scanStudentQrCode(scope, { sessionId, qrToken: validToken, markLate: false }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        messageKey: "attendance.errors.studentNotEnrolled",
      });

      expect(writeAuditEventMock).toHaveBeenCalledWith(
        fakeTx,
        expect.objectContaining({
          workspaceId,
          action: "attendance.qr_rejected",
          entityId: sessionId,
          diff: expect.objectContaining({
            outcome: "student_not_enrolled",
            studentId,
          }),
        }),
      );
    });

    it("audits student_not_on_attendee_roster for a groupless session when student is not an attendee", async () => {
      getSessionWithGroupMock.mockResolvedValueOnce({
        ...activeSession,
        groupId: null, // groupless session
      });
      findStudentForQrScanTxMock.mockResolvedValueOnce(studentRecord);
      fakeTx.attendanceMark.findFirst.mockResolvedValueOnce(null);
      getSessionAttendeeTxMock.mockResolvedValueOnce(null);

      await expect(
        scanStudentQrCode(scope, { sessionId, qrToken: validToken, markLate: false }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        messageKey: "attendance.errors.studentNotEnrolled",
      });

      expect(writeAuditEventMock).toHaveBeenCalledWith(
        fakeTx,
        expect.objectContaining({
          workspaceId,
          action: "attendance.qr_rejected",
          entityId: sessionId,
          diff: expect.objectContaining({
            outcome: "student_not_on_attendee_roster",
            studentId,
          }),
        }),
      );
    });

    it("audits duplicate_scan when student already has an attendance mark in this session", async () => {
      getSessionWithGroupMock.mockResolvedValueOnce(activeSession);
      findStudentForQrScanTxMock.mockResolvedValueOnce(studentRecord);
      fakeTx.attendanceMark.findFirst.mockResolvedValueOnce({
        id: "existing-mark-1",
        mark: "present",
      });

      await expect(
        scanStudentQrCode(scope, { sessionId, qrToken: validToken, markLate: false }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        messageKey: "attendance.errors.alreadyScanned",
      });

      expect(writeAuditEventMock).toHaveBeenCalledWith(
        fakeTx,
        expect.objectContaining({
          workspaceId,
          action: "attendance.qr_rejected",
          entityId: sessionId,
          diff: expect.objectContaining({
            outcome: "duplicate_scan",
            studentId,
          }),
        }),
      );
    });
  });

  describe("Duplicate Concurrent Scan Race Condition", () => {
    it("catches Prisma P2002 error, audits duplicate_scan_race, and maps to 409 CONFLICT", async () => {
      getSessionWithGroupMock.mockResolvedValueOnce(activeSession);
      findStudentForQrScanTxMock.mockResolvedValueOnce(studentRecord);
      fakeTx.attendanceMark.findFirst.mockResolvedValueOnce(null); // passed initial check
      getEnrollmentForStudentMock.mockResolvedValueOnce({ id: "enrollment-1" });

      // Simulate a concurrent duplicate race where another worker inserted in between,
      // causing upsertAttendanceMarkTx to throw a unique constraint violation (P2002)
      const p2002Error = new Error("Unique constraint failed on the fields: (`session_id`,`student_id`)");
      (p2002Error as unknown as { code: string }).code = "P2002";
      upsertAttendanceMarkTxMock.mockRejectedValueOnce(p2002Error);

      await expect(
        scanStudentQrCode(scope, {
          sessionId,
          qrToken: validToken,
          markLate: false,
          deviceId: "phone-scanner-1",
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        messageKey: "attendance.errors.alreadyScanned",
      });

      // Verifies that duplicate_scan_race was audited
      expect(writeAuditEventMock).toHaveBeenCalledWith(
        fakeTx,
        expect.objectContaining({
          workspaceId,
          action: "attendance.qr_rejected",
          entityId: sessionId,
          diff: expect.objectContaining({
            outcome: "duplicate_scan_race",
            deviceId: "phone-scanner-1",
          }),
        }),
      );
    });
  });

  describe("Late Toggle and Device ID", () => {
    it("records mark: 'late' and passes deviceId when markLate is true", async () => {
      getSessionWithGroupMock.mockResolvedValueOnce(activeSession);
      findStudentForQrScanTxMock.mockResolvedValueOnce(studentRecord);
      fakeTx.attendanceMark.findFirst.mockResolvedValueOnce(null);
      getEnrollmentForStudentMock.mockResolvedValueOnce({ id: "enrollment-1" });
      upsertAttendanceMarkTxMock.mockResolvedValueOnce({
        id: "new-mark-1",
        mark: "late",
        source: "qr",
        deviceId: "tablet-cam-02",
      });

      const res = await scanStudentQrCode(scope, {
        sessionId,
        qrToken: validToken,
        markLate: true,
        deviceId: "tablet-cam-02",
      });

      expect(res.mark.mark).toBe("late");
      expect(upsertAttendanceMarkTxMock).toHaveBeenCalledWith(
        fakeTx,
        scope,
        expect.objectContaining({
          sessionId,
          studentId,
          mark: "late",
          source: "qr",
          deviceId: "tablet-cam-02",
        }),
      );

      // Verifies mark audit includes deviceId
      expect(writeAuditEventMock).toHaveBeenCalledWith(
        fakeTx,
        expect.objectContaining({
          action: "attendance.marked",
          diff: expect.objectContaining({
            mark: "late",
            source: "qr",
            deviceId: "tablet-cam-02",
          }),
        }),
      );
    });
  });
});
