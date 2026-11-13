import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionKey, type Scope } from "@/modules/tenancy/types";

// ---------------------------------------------------------------------------
// Focused regression tests for the dashboard attendance streak.
// The real repository is replaced by a mock so the actual service calculation
// runs end-to-end (streak grouping, ordering, period filtering, thresholds).
// ---------------------------------------------------------------------------

vi.mock("@/modules/dashboard/repository", () => ({
  fetchDashboardRawData: vi.fn(),
}));

import { fetchDashboardRawData } from "@/modules/dashboard/repository";
import { getDashboardData } from "@/modules/dashboard/service";

const mockedFetch = vi.mocked(fetchDashboardRawData);

const GROUP = {
  id: "group-1",
  name: "Group One",
  color: "#0a84ff",
  grade: "Grade 9",
  weekday: 1,
  startTime: "16:00",
  endTime: "17:30",
  room: "R1",
  defaultPricePerStudentMinor: 500_000,
};

const STUDENT = {
  id: "student-1",
  firstName: "Omar",
  lastName: "Student",
  grade: "Grade 9",
  joinedAt: new Date("2026-09-01T00:00:00Z"),
  archivedAt: null,
};

const ENROLLMENT = {
  id: "enrollment-1",
  studentId: STUDENT.id,
  groupId: GROUP.id,
  enrolledAt: new Date("2026-09-01T00:00:00Z"),
  leftAt: null,
  group: { id: GROUP.id, name: GROUP.name, color: GROUP.color },
};

const SESSION_IDS = ["session-old", "session-cancelled", "session-mid", "session-new"] as const;

function makeSession(id: string, startsAt: string, status: "completed" | "cancelled" = "completed") {
  return {
    id,
    groupId: GROUP.id,
    startsAt: new Date(startsAt),
    endsAt: new Date(new Date(startsAt).getTime() + 45 * 60_000),
    status,
    room: "R1",
    location: null,
    notes: null,
    pricePerStudentMinor: null,
    attendanceMarks: [],
    group: {
      id: GROUP.id,
      name: GROUP.name,
      color: GROUP.color,
      defaultPricePerStudentMinor: null,
    },
  };
}

function makeMark(
  sessionId: string,
  mark: "present" | "absent" | "late" | "excused",
  recordedAt: string,
) {
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Unknown session ${sessionId}`);
  return {
    id: `mark-${sessionId}`,
    sessionId,
    studentId: STUDENT.id,
    mark,
    recordedBy: "teacher-1",
    recordedAt: new Date(recordedAt),
    isCrossSeason: false,
    session: {
      startsAt: session.startsAt,
      status: session.status,
      groupId: session.groupId,
      group: { name: GROUP.name },
    },
  };
}

const HISTORIC_ABSENCE_SESSION = makeSession(SESSION_IDS[0]!, "2026-10-01T16:00:00Z");
const CANCELLED_SESSION = makeSession(SESSION_IDS[1]!, "2026-10-03T16:00:00Z", "cancelled");
const MID_SESSION = makeSession(SESSION_IDS[2]!, "2026-10-05T16:00:00Z");
const LATEST_SESSION = makeSession(SESSION_IDS[3]!, "2026-10-08T16:00:00Z");

const sessions = [HISTORIC_ABSENCE_SESSION, CANCELLED_SESSION, MID_SESSION, LATEST_SESSION];

function buildRaw(marksOverride?: Array<ReturnType<typeof makeMark>>) {
  return {
    workspace: {
      id: "ws-1",
      name: "School",
      teachingName: "Mr T",
      slug: "ws",
      primarySubject: "Physics",
      gradesTaught: ["Grade 9"],
    },
    settings: {
      timezone: "Africa/Cairo",
      currency: "EGP",
      atRiskAfter: 2,
      inactiveAfter: 4,
    },
    allStudents: [STUDENT],
    groups: [GROUP],
    feeRules: [],
    enrollments: [ENROLLMENT],
    sessions,
    attendanceMarks: marksOverride ?? [makeMark(SESSION_IDS[0]!, "absent", "2026-10-20T10:00:00Z")],
    assessments: [],
    assessmentScores: [],
    homeworkList: [],
    homeworkSubmissions: [],
    payments: [],
    adjustments: [],
    onlineExams: [],
    onlineExamAttempts: [],
    forms: [],
    assistants: [],
    auditEvents: [],
  };
}

const ownerScope: Scope = {
  workspaceId: "ws-1",
  actorUserId: "teacher-1",
  actorDisplayName: "Teacher One",
  role: "owner",
  permissions: new Set([
    permissionKey("students", "read"),
    permissionKey("grades", "read"),
    permissionKey("payments", "read"),
    permissionKey("team", "read"),
  ]),
};

function streakCount(data: Awaited<ReturnType<typeof getDashboardData>>) {
  return data.attentionCenter.students.find((s) => s.studentId === STUDENT.id)?.supportingInfo ?? null;
}

function isAbsenceReason(data: Awaited<ReturnType<typeof getDashboardData>>) {
  return data.attentionCenter.students.some(
    (s) => s.studentId === STUDENT.id && s.category === "absences",
  );
}

describe("dashboard attendance streak (selected period, chronological by session)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores absences outside the selected this_month period", async () => {
    mockedFetch.mockResolvedValueOnce(
      buildRaw([
        makeMark(SESSION_IDS[0]!, "absent", "2026-11-05T10:00:00Z"), // session Oct 1, inside recorded Nov
        makeMark(SESSION_IDS[2]!, "absent", "2026-11-06T10:00:00Z"), // session Oct 5
      ]) as never,
    );

    const data = await getDashboardData(ownerScope, { period: "this_month" }, new Date("2026-11-11T08:00:00Z"));

    expect(data.globalOverview.students.atRisk).toBe(0);
    expect(data.globalOverview.students.inactive).toBe(0);
    expect(data.globalOverview.students.active).toBe(1);
  });

  it("all-period selection still considers historical attendance", async () => {
    mockedFetch.mockResolvedValueOnce(
      buildRaw([
        makeMark(SESSION_IDS[0]!, "absent", "2026-10-20T10:00:00Z"),
        makeMark(SESSION_IDS[2]!, "absent", "2026-10-21T10:00:00Z"),
        makeMark(SESSION_IDS[3]!, "absent", "2026-10-22T10:00:00Z"),
        makeMark(SESSION_IDS[1]!, "absent", "2026-10-23T10:00:00Z"), // cancelled — excluded, keeps streak at 3
      ]) as never,
    );

    const data = await getDashboardData(ownerScope, { period: "all" }, new Date("2026-11-11T08:00:00Z"));

    expect(data.globalOverview.students.atRisk).toBe(1);
  });

  it("evaluates late-entered marks by session date, not recordedAt", async () => {
    // Real repository returns marks ordered by recordedAt desc, not by session.
    // Session desc is: Oct 8 present (latest) -> Oct 5 absent -> Oct 1 absent.
    mockedFetch.mockResolvedValueOnce(
      buildRaw([
        makeMark(SESSION_IDS[0]!, "absent", "2026-11-05T09:00:00Z"), // recorded Nov 5
        makeMark(SESSION_IDS[2]!, "absent", "2026-11-03T09:00:00Z"), // recorded Nov 3
        makeMark(SESSION_IDS[3]!, "present", "2026-11-01T09:00:00Z"), // recorded Nov 1 (most recent session)
      ]) as never,
    );

    const data = await getDashboardData(
      ownerScope,
      { period: "all" },
      new Date("2026-11-11T08:00:00Z"),
    );

    // If evaluated by recordedAt desc, streak would be absorbed in reverse order:
    // Nov 5 (Oct 1 absent) -> Nov 3 (Oct 5 absent) -> Nov 1 (Oct 8 present) breaks => streak 2.
    // By session desc: Nov 1 present first breaks immediately => streak 0.
    expect(data.globalOverview.students.atRisk).toBe(0);
    expect(data.globalOverview.students.active).toBe(1);
  });

  it("skips cancelled sessions when computing consecutive absences", async () => {
    mockedFetch.mockResolvedValueOnce(
      buildRaw([
        makeMark(SESSION_IDS[3]!, "absent", "2026-11-01T09:00:00Z"),
        makeMark(SESSION_IDS[1]!, "absent", "2026-11-02T09:00:00Z"), // cancelled session — must be skipped
        makeMark(SESSION_IDS[2]!, "absent", "2026-11-03T09:00:00Z"),
        makeMark(SESSION_IDS[0]!, "absent", "2026-11-04T09:00:00Z"),
      ]) as never,
    );

    const data = await getDashboardData(
      ownerScope,
      { period: "all" },
      new Date("2026-11-11T08:00:00Z"),
    );

    // 3 consecutive non-cancelled absences -> at risk (>= 2) but not inactive (>= 4)
    expect(data.globalOverview.students.atRisk).toBe(1);
    expect(data.globalOverview.students.inactive).toBe(0);
  });

  it("breaks the streak at a present mark", async () => {
    mockedFetch.mockResolvedValueOnce(
      buildRaw([
        makeMark(SESSION_IDS[3]!, "present", "2026-11-04T09:00:00Z"), // most recent session
        makeMark(SESSION_IDS[2]!, "absent", "2026-11-03T09:00:00Z"),
        makeMark(SESSION_IDS[0]!, "absent", "2026-11-02T09:00:00Z"),
      ]) as never,
    );

    const data = await getDashboardData(
      ownerScope,
      { period: "all" },
      new Date("2026-11-11T08:00:00Z"),
    );

    expect(data.globalOverview.students.active).toBe(1);
    expect(data.globalOverview.students.atRisk).toBe(0);
  });

  it("reports zero streak when no attendance falls inside the selected period", async () => {
    // Only attendance outside the selected period exists.
    mockedFetch.mockResolvedValueOnce(
      buildRaw([makeMark(SESSION_IDS[0]!, "absent", "2026-11-02T09:00:00Z")]) as never,
    );

    const data = await getDashboardData(
      ownerScope,
      { period: "this_month" },
      new Date("2026-11-11T08:00:00Z"),
    );

    expect(data.globalOverview.students.active).toBe(1);
    expect(data.globalOverview.students.atRisk).toBe(0);
    expect(isAbsenceReason(data)).toBe(false);
    expect(streakCount(data)).toBeNull();
  });
});
