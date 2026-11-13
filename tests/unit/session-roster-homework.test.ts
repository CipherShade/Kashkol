import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { getSessionRoster } from "../../src/modules/attendance/service.js";
import * as attendanceRepo from "../../src/modules/attendance/repository.js";
import * as homeworkApi from "../../src/modules/homework/index.js";
import * as dbScope from "../../src/lib/db/scope.js";
import { RecentTokenCache } from "../../src/lib/attendance/recent-tokens.js";
import type { Permission, Scope } from "../../src/modules/tenancy/types.js";
import { permissionKey } from "../../src/modules/tenancy/types.js";

const scope: Scope = {
  workspaceId: "018f6c5b-0000-7000-8000-000000000001",
  actorUserId: "018f6c5b-0000-7000-8000-000000000002",
  actorDisplayName: "Teacher Ali",
  role: "owner",
  permissions: new Set(),
};

const sessionId = "018f6c5b-1111-7000-8000-000000000001";
const groupId = "018f6c5b-5555-7000-8000-000000000001";
const studentId = "018f6c5b-2222-7000-8000-000000000001";

const fakeRosterStudent = {
  studentId,
  firstName: "Ahmed",
  lastName: "Mahmoud",
  enrolledAt: new Date("2026-09-01T00:00:00Z"),
  mark: null,
  markId: null,
  source: null,
  recordedAt: null,
  recordedBy: null,
  isCrossSeason: false,
  primaryGroupId: null,
  primaryGroupName: null,
};

describe("getSessionRoster homework context", () => {
  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.restoreAllMocks();

    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.spyOn(dbScope, "withScope").mockImplementation(async (_s, cb) => {
      return cb(tx as unknown as Parameters<Parameters<typeof dbScope.withScope>[1]>[0]);
    });

    vi.spyOn(attendanceRepo, "getSessionWithGroup").mockResolvedValue({
      id: sessionId,
      workspaceId: scope.workspaceId,
      groupId,
      status: "started",
      startsAt: new Date("2026-11-10T14:00:00Z"),
      endsAt: new Date("2026-11-10T16:00:00Z"),
      room: null,
      location: null,
      isOneOff: false,
      seriesId: null,
      pricePerStudentMinor: 60000,
      group: {
        id: groupId,
        workspaceId: scope.workspaceId,
        name: "Group A",
        color: "indigo",
        defaultPricePerStudentMinor: 60000,
      },
    } as never);

    vi.spyOn(attendanceRepo, "getRosterForSession").mockResolvedValue([fakeRosterStudent]);
  });

  it("returns the latest group homework and merges completion marks", async () => {
    vi.spyOn(homeworkApi, "getSessionHomeworkContextTx").mockResolvedValue({
      homework: { id: "homework-1", title: "Chapter 4 worksheet", dueAt: new Date("2026-11-12T00:00:00Z") },
      marks: new Map([[studentId, "completed" as const]]),
    } as never);

    const result = await getSessionRoster(scope, sessionId);

    expect(result.homework).toEqual({
      id: "homework-1",
      title: "Chapter 4 worksheet",
      dueAt: new Date("2026-11-12T00:00:00Z"),
    });
    expect(result.roster).toHaveLength(1);
    expect(result.roster[0]?.homeworkStatus).toBe("completed");
    expect(result.canRecordHomework).toBe(true);
  });

  it("returns homework: null and null statuses when no active homework exists", async () => {
    vi.spyOn(homeworkApi, "getSessionHomeworkContextTx").mockResolvedValue({
      homework: null,
      marks: new Map(),
    });

    const result = await getSessionRoster(scope, sessionId);

    expect(result.homework).toBeNull();
    expect(result.roster[0]?.homeworkStatus).toBeNull();
  });

  it("gates canRecordHomework by the homework:write permission", async () => {
    vi.spyOn(homeworkApi, "getSessionHomeworkContextTx").mockResolvedValue({
      homework: { id: "homework-1", title: "Worksheet", dueAt: new Date("2026-11-12T00:00:00Z") },
      marks: new Map(),
    } as never);

    const assistantBase = {
      ...scope,
      role: "assistant" as const,
      permissions: new Set<Permission>([permissionKey("attendance", "read")]),
    };
    const result = await getSessionRoster(assistantBase, sessionId);
    expect(result.canRecordHomework).toBe(false);

    const assistantWithHomework = {
      ...assistantBase,
      permissions: new Set<Permission>([
        permissionKey("attendance", "read"),
        permissionKey("homework", "write"),
      ]),
    };
    const allowed = await getSessionRoster(assistantWithHomework, sessionId);
    expect(allowed.canRecordHomework).toBe(true);
  });
});

describe("RecentTokenCache", () => {
  it("accepts the first occurrence and rejects re-scans within the window", () => {
    const cache = new RecentTokenCache(4000);
    expect(cache.accept("kqr_v1.aaa", 1_000)).toBe(true);
    expect(cache.accept("kqr_v1.aaa", 2_000)).toBe(false);
    expect(cache.accept("kqr_v1.aaa", 5_000)).toBe(true);
  });

  it("accepts different tokens independently and prunes expired entries", () => {
    const cache = new RecentTokenCache(1000);
    expect(cache.accept("kqr_v1.aaa", 1_000)).toBe(true);
    expect(cache.accept("kqr_v1.bbb", 1_100)).toBe(true);
    expect(cache.accept("kqr_v1.aaa", 2_500)).toBe(true);
    cache.forget("kqr_v1.bbb");
    expect(cache.accept("kqr_v1.bbb", 2_200)).toBe(true);
  });
});
