import { describe, it, expect, vi, beforeEach } from "vitest";
import { markAttendance } from "../../src/modules/attendance/service.js";
import * as attendanceRepo from "../../src/modules/attendance/repository.js";
import * as dbScope from "../../src/lib/db/scope.js";
import { AppError } from "../../src/lib/http/errors.js";
import type { Scope } from "../../src/modules/tenancy/types.js";

const scope: Scope = {
  workspaceId: "018f6c5b-0000-7000-8000-000000000001",
  actorUserId: "018f6c5b-0000-7000-8000-000000000002",
  actorDisplayName: "Teacher Ali",
  role: "owner",
  permissions: new Set(),
};

describe("Cross-Season Attendance", () => {
  const sessionId = "018f6c5b-1111-7000-8000-000000000001";
  const regularStudentId = "018f6c5b-2222-7000-8000-000000000001";
  const crossSeasonStudentId = "018f6c5b-3333-7000-8000-000000000001";
  const unknownStudentId = "018f6c5b-4444-7000-8000-000000000001";
  const sessionGroupId = "018f6c5b-5555-7000-8000-000000000001";
  const otherGroupId = "018f6c5b-6666-7000-8000-000000000001";

  beforeEach(() => {
    vi.restoreAllMocks();

    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
      attendanceMark: {
        findFirst: vi.fn().mockResolvedValue({
          id: "mark-1",
          sessionId,
          studentId: regularStudentId,
        }),
      },
    };

    // Mock withScope to run the callback with a fake tx
    vi.spyOn(dbScope, "withScope").mockImplementation(async (_s, cb) => {
      return cb(tx as unknown as Parameters<Parameters<typeof dbScope.withScope>[1]>[0]);
    });

    // Mock getSessionWithGroup
    vi.spyOn(attendanceRepo, "getSessionWithGroup").mockResolvedValue({
      id: sessionId,
      workspaceId: scope.workspaceId,
      groupId: sessionGroupId,
      status: "scheduled",
      startsAt: new Date("2026-11-10T14:00:00Z"),
      endsAt: new Date("2026-11-10T16:00:00Z"),
      group: { id: sessionGroupId, name: "Group A (Sunday)" },
    } as unknown as Awaited<ReturnType<typeof attendanceRepo.getSessionWithGroup>>);
  });

  it("marks regular student attendance with isCrossSeason = false", async () => {
    vi.spyOn(attendanceRepo, "getEnrollmentForStudent").mockResolvedValue({
      id: "enr-1",
      groupId: sessionGroupId,
      studentId: regularStudentId,
    } as unknown as Awaited<ReturnType<typeof attendanceRepo.getEnrollmentForStudent>>);

    const upsertSpy = vi.spyOn(attendanceRepo, "upsertAttendanceMarkTx").mockResolvedValue({
      id: "mark-1",
      sessionId,
      studentId: regularStudentId,
      mark: "present",
      isCrossSeason: false,
      primaryGroupId: null,
    } as unknown as Awaited<ReturnType<typeof attendanceRepo.upsertAttendanceMarkTx>>);

    const mark = await markAttendance(scope, {
      sessionId,
      studentId: regularStudentId,
      mark: "present",
    });

    expect(mark.isCrossSeason).toBe(false);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        isCrossSeason: false,
        primaryGroupId: null,
      }),
    );
  });

  it("marks cross-season attendance when student is enrolled in another group in the workspace", async () => {
    // Not enrolled in sessionGroupId
    vi.spyOn(attendanceRepo, "getEnrollmentForStudent").mockResolvedValue(null);

    // Active in otherGroupId
    vi.spyOn(attendanceRepo, "getActiveEnrollmentForStudent").mockResolvedValue({
      id: "enr-other",
      groupId: otherGroupId,
      studentId: crossSeasonStudentId,
      group: { id: otherGroupId, name: "Group B (Tuesday)" },
    } as unknown as Awaited<ReturnType<typeof attendanceRepo.getActiveEnrollmentForStudent>>);

    const upsertSpy = vi.spyOn(attendanceRepo, "upsertAttendanceMarkTx").mockResolvedValue({
      id: "mark-2",
      sessionId,
      studentId: crossSeasonStudentId,
      mark: "present",
      isCrossSeason: true,
      primaryGroupId: otherGroupId,
    } as unknown as Awaited<ReturnType<typeof attendanceRepo.upsertAttendanceMarkTx>>);

    const mark = await markAttendance(scope, {
      sessionId,
      studentId: crossSeasonStudentId,
      mark: "present",
    });

    expect(mark.isCrossSeason).toBe(true);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        isCrossSeason: true,
        primaryGroupId: otherGroupId,
      }),
    );
  });

  it("rejects attendance when student has no active enrollment in the workspace", async () => {
    vi.spyOn(attendanceRepo, "getEnrollmentForStudent").mockResolvedValue(null);
    vi.spyOn(attendanceRepo, "getActiveEnrollmentForStudent").mockResolvedValue(null);

    await expect(
      markAttendance(scope, {
        sessionId,
        studentId: unknownStudentId,
        mark: "present",
      }),
    ).rejects.toThrow(AppError);
  });
});
