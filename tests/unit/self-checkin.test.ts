import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkInWithQrToken } from "@/modules/attendance/self-checkin";
import { createAttendanceNotification } from "@/modules/notifications";
import { enqueueAttendanceNotificationForSelfCheckIn } from "@/modules/messaging";

vi.mock("@/lib/db/scope", () => ({
  withScope: vi.fn(async (_scope: unknown, cb: (tx: unknown) => Promise<unknown>) =>
    cb(mockTx),
  ),
}));

vi.mock("@/modules/audit/service", () => ({
  writeAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/notifications", () => ({
  createAttendanceNotification: vi.fn().mockResolvedValue({ id: "notif-att-1" }),
}));

vi.mock("@/modules/messaging", () => ({
  enqueueAttendanceNotificationForSelfCheckIn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/attendance/repository", () => ({
  findActiveQrTokenByHash: vi.fn(),
  getEnrollmentForStudent: vi.fn(),
  getSessionAttendeeTx: vi.fn(),
  upsertAttendanceMarkTx: vi.fn(),
}));

const mockTx = {
  attendanceMark: {
    findFirst: vi.fn(),
  },
};

import {
  findActiveQrTokenByHash,
  getEnrollmentForStudent,
  upsertAttendanceMarkTx,
} from "@/modules/attendance/repository";

describe("checkInWithQrToken - QR self check-in notification integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const actor = {
    userId: "portal-user-1",
    workspaceId: "00000000-0000-4000-8000-000000000001",
    studentId: "student-1",
    displayName: "Student One",
  };

  it("creates in-app attendance notification and enqueues outbox message on successful check-in", async () => {
    vi.mocked(findActiveQrTokenByHash).mockResolvedValueOnce({
      id: "token-1",
      tokenHash: "abc",
      workspaceId: actor.workspaceId,
      sessionId: "session-1",
      session: {
        id: "session-1",
        workspaceId: actor.workspaceId,
        status: "scheduled",
        groupId: "group-1",
        group: { name: "Mathematics G1" },
        startsAt: new Date("2026-11-17T10:00:00Z"),
        endsAt: new Date("2026-11-17T11:30:00Z"),
      },
    } as unknown as Awaited<ReturnType<typeof findActiveQrTokenByHash>>);

    vi.mocked(getEnrollmentForStudent).mockResolvedValueOnce({
      id: "enr-1",
      workspaceId: actor.workspaceId,
      groupId: "group-1",
      studentId: actor.studentId,
    } as unknown as Awaited<ReturnType<typeof getEnrollmentForStudent>>);

    mockTx.attendanceMark.findFirst.mockResolvedValueOnce(null);

    vi.mocked(upsertAttendanceMarkTx).mockResolvedValueOnce({
      id: "mark-1",
      workspaceId: actor.workspaceId,
      sessionId: "session-1",
      studentId: actor.studentId,
      mark: "present",
      source: "qr",
    } as unknown as Awaited<ReturnType<typeof upsertAttendanceMarkTx>>);

    const result = await checkInWithQrToken(actor, { token: "raw-qr-token-123" });

    expect(result.mark).toBe("present");
    expect(result.sessionId).toBe("session-1");

    // In-app notification + web push created
    expect(createAttendanceNotification).toHaveBeenCalledTimes(1);
    expect(createAttendanceNotification).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: actor.workspaceId }),
      expect.objectContaining({
        sessionId: "session-1",
        studentId: actor.studentId,
        groupName: "Mathematics G1",
        mark: "present",
      }),
    );

    // Outbox notification enqueued
    expect(enqueueAttendanceNotificationForSelfCheckIn).toHaveBeenCalledTimes(1);
    expect(enqueueAttendanceNotificationForSelfCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: actor.workspaceId }),
      expect.objectContaining({
        sessionId: "session-1",
        studentId: actor.studentId,
        mark: "present",
      }),
      expect.any(Object),
    );
  });
});
