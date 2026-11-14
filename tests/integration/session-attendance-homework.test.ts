import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  bulkRecordHomeworkCompletion,
  createHomework,
} from "@/modules/homework/service";
import { getSessionRoster, markAttendance } from "@/modules/attendance/service";
import { enrollStudentInGroup } from "@/modules/groups/service";
import { FIXTURES, fixturesScope, createStudent, deleteStudent } from "./helpers";
import { withScope } from "@/lib/db/scope";
import { disconnectDb } from "@/lib/db/client";

const GROUPS: string[] = [];
const STUDENTS: string[] = [];
const HOMEWORKS: string[] = [];
const SESSIONS: string[] = [];

afterAll(async () => {
  await disconnectDb();
});

afterEach(async () => {
  // Service-created attendance marks carry an initial append-only revision,
  // so the marks (and the sessions/primary groups they reference) cannot be
  // deleted; the first revision is kept by design. Each best-effort delete
  // runs in its own transaction so one blocked delete cannot roll back the
  // rest.
  await withScope({ workspaceId: FIXTURES }, async (tx) => {
    // homework_completion_mark FKs are ON DELETE RESTRICT, so marks must go
    // before the homework / session / student they reference.
    await tx.homeworkCompletionMark.deleteMany({
      where: { workspaceId: FIXTURES, homeworkId: { in: HOMEWORKS } },
    });
    await tx.homeworkSubmission.deleteMany({
      where: { workspaceId: FIXTURES, homeworkId: { in: HOMEWORKS } },
    });
    await tx.homeworkResource.deleteMany({
      where: { workspaceId: FIXTURES, homeworkId: { in: HOMEWORKS } },
    });
    await tx.homework.deleteMany({ where: { workspaceId: FIXTURES, id: { in: HOMEWORKS } } });
    await tx.enrollment.deleteMany({ where: { workspaceId: FIXTURES, groupId: { in: GROUPS } } });
  });
  const bestEffort = (promise: Promise<unknown>) => promise.catch(() => undefined);
  await bestEffort(
    withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.attendanceMark.deleteMany({
        where: { workspaceId: FIXTURES, sessionId: { in: SESSIONS } },
      }),
    ),
  );
  await bestEffort(
    withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.teachingSession.deleteMany({
        where: { workspaceId: FIXTURES, id: { in: SESSIONS } },
      }),
    ),
  );
  for (const groupId of GROUPS) {
    await bestEffort(
      withScope({ workspaceId: FIXTURES }, (tx) =>
        tx.groupScheduleSlot.deleteMany({ where: { workspaceId: FIXTURES, groupId } }),
      ),
    );
    await bestEffort(
      withScope({ workspaceId: FIXTURES }, (tx) =>
        tx.group.deleteMany({ where: { workspaceId: FIXTURES, id: groupId } }),
      ),
    );
  }
  for (const studentId of STUDENTS) await deleteStudent(FIXTURES, studentId);
  GROUPS.length = 0;
  STUDENTS.length = 0;
  HOMEWORKS.length = 0;
  SESSIONS.length = 0;
});

async function createFixture() {
  const scope = fixturesScope();
  const group = await withScope(scope, (tx) =>
    tx.group.create({
      data: {
        workspaceId: FIXTURES,
        name: `Roster ${randomUUID()}`,
        color: "indigo",
        scheduleSlots: {
          create: {
            weekday: 6,
            startTime: new Date("1970-01-01T16:00:00.000Z"),
            endTime: new Date("1970-01-01T17:00:00.000Z"),
            capacity: 30,
          },
        },
      },
    }),
  );
  GROUPS.push(group.id);

  const studentId = await createStudent(FIXTURES, "Homework", randomUUID().slice(0, 8));
  STUDENTS.push(studentId);
  await enrollStudentInGroup(scope, { groupId: group.id, studentId });
  return { scope, group, studentId };
}

async function createSession(
  scope: ReturnType<typeof fixturesScope>,
  groupId: string,
  status: "scheduled" | "started",
) {
  const session = await withScope(scope, (tx) =>
    tx.teachingSession.create({
      data: {
        workspaceId: FIXTURES,
        groupId,
        status,
        startsAt: new Date("2026-11-10T14:00:00.000Z"),
        endsAt: new Date("2026-11-10T15:00:00.000Z"),
      },
    }),
  );
  SESSIONS.push(session.id);
  return session;
}

describe("session attendance screen homework context", () => {
  it("returns the latest group homework for the roster and honours completion marks", async () => {
    const { scope, group, studentId } = await createFixture();
    const homework = await createHomework(scope, {
      groupId: group.id,
      studentIds: undefined,
      title: "Chapter 4 worksheet",
      instructions: null,
      dueAt: "2026-11-12T12:00:00.000Z",
      resourceFileIds: [],
      maxScore: null,
    });
    HOMEWORKS.push(homework.id);

    const session = await createSession(scope, group.id, "scheduled");

    const context = await getSessionRoster(scope, session.id);
    expect(context.homework?.title).toBe("Chapter 4 worksheet");
    expect(context.canRecordHomework).toBe(true);
    // No completion mark yet → null status shown as unrecorded for the UI.
    expect(context.roster[0]?.homeworkStatus).toBeNull();

    // Record a completed completion mark linked to this session.
    await bulkRecordHomeworkCompletion(scope, {
      homeworkId: homework.id,
      sessionId: session.id,
      marks: [{ studentId, status: "completed" }],
    });

    const after = await getSessionRoster(scope, session.id);
    expect(after.roster[0]?.homeworkStatus).toBe("completed");
  });

  it("does not invent homework when the group has none assigned", async () => {
    const { scope, group, studentId } = await createFixture();
    const session = await createSession(scope, group.id, "started");

    const context = await getSessionRoster(scope, session.id);
    expect(context.homework).toBeNull();
    expect(context.roster).toHaveLength(1);
    expect(context.roster[0]?.studentId).toBe(studentId);
    expect(context.roster[0]?.homeworkStatus).toBeNull();
  });

  it("re-reports not_completed after the mark is flipped", async () => {
    const { scope, group, studentId } = await createFixture();
    const homework = await createHomework(scope, {
      groupId: group.id,
      studentIds: undefined,
      title: "Final review",
      instructions: null,
      dueAt: "2026-11-11T12:00:00.000Z",
      resourceFileIds: [],
      maxScore: null,
    });
    HOMEWORKS.push(homework.id);
    const session = await createSession(scope, group.id, "started");

    await bulkRecordHomeworkCompletion(scope, {
      homeworkId: homework.id,
      sessionId: session.id,
      marks: [{ studentId, status: "completed" }],
    });

    await bulkRecordHomeworkCompletion(scope, {
      homeworkId: homework.id,
      sessionId: session.id,
      marks: [{ studentId, status: "not_completed" }],
    });

    const after = await getSessionRoster(scope, session.id);
    expect(after.roster[0]?.homeworkStatus).toBe("not_completed");
  });

  it("append-highlights cross-season students who are not enrolled in the session group", async () => {
    const { scope, group } = await createFixture();
    const session = await createSession(scope, group.id, "scheduled");

    // Cross-season student: enrolled only in a different group.
    const otherGroup = await withScope(scope, (tx) =>
      tx.group.create({
        data: {
          workspaceId: FIXTURES,
          name: `Other ${randomUUID()}`,
          color: "rose",
          scheduleSlots: {
            create: {
              weekday: 6,
              startTime: new Date("1970-01-01T16:00:00.000Z"),
              endTime: new Date("1970-01-01T17:00:00.000Z"),
              capacity: 10,
            },
          },
        },
      }),
    );
    GROUPS.push(otherGroup.id);

    const crossStudentId = await createStudent(FIXTURES, "Cross", randomUUID().slice(0, 8));
    STUDENTS.push(crossStudentId);
    await enrollStudentInGroup(scope, { groupId: otherGroup.id, studentId: crossStudentId });

    // Mark them present for this session via the manual mark path.
    await markAttendance(scope, {
      sessionId: session.id,
      studentId: crossStudentId,
      mark: "present",
    });

    const roster = await getSessionRoster(scope, session.id);
    const found = roster.roster.find((r) => r.studentId === crossStudentId);
    expect(found).toBeDefined();
    expect(found!.isCrossSeason).toBe(true);
    expect(found!.mark).toBe("present");
  });
});
