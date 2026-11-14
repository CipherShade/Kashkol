import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  addSessionAttendee,
  getSessionRoster,
  markAttendance,
  removeSessionAttendee,
} from "@/modules/attendance/service";
import { enrollStudentInGroup } from "@/modules/groups/service";
import { createOneOffSession } from "@/modules/sessions/service";
import { FIXTURES, fixturesScope, createStudent, deleteStudent } from "./helpers";
import { withScope } from "@/lib/db/scope";
import { disconnectDb } from "@/lib/db/client";

const GROUPS: string[] = [];
const STUDENTS: string[] = [];
const SESSIONS: string[] = [];

afterAll(async () => {
  await disconnectDb();
});

afterEach(async () => {
  // session_attendee FKs are ON DELETE RESTRICT, so rows go before the
  // sessions and students they reference. Marks created through the service
  // carry an append-only initial revision and may survive cleanup (ADR-0029
  // fixtures follow the same convention as the attendance tests), so every
  // delete that can be blocked runs best-effort in its own transaction.
  const bestEffort = (promise: Promise<unknown>) => promise.catch(() => undefined);

  await bestEffort(
    withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.sessionAttendee.deleteMany({
        where: { workspaceId: FIXTURES, sessionId: { in: SESSIONS } },
      }),
    ),
  );
  await bestEffort(
    withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.attendanceMark.deleteMany({
        where: { workspaceId: FIXTURES, sessionId: { in: SESSIONS }, revisions: { none: {} } },
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
        tx.enrollment.deleteMany({ where: { workspaceId: FIXTURES, groupId } }),
      ),
    );
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
  for (const studentId of STUDENTS) await bestEffort(deleteStudent(FIXTURES, studentId));
  GROUPS.length = 0;
  STUDENTS.length = 0;
  SESSIONS.length = 0;
});

async function createGroup(grade: string | null = null) {
  const scope = fixturesScope();
  const group = await withScope(scope, (tx) =>
    tx.group.create({
      data: {
        workspaceId: FIXTURES,
        name: `Session mode ${randomUUID()}`,
        color: "indigo",
        grade,
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
  return group;
}

async function createEnrolledStudent(scope: ReturnType<typeof fixturesScope>, groupId: string) {
  const studentId = await createStudent(FIXTURES, "Mode", randomUUID().slice(0, 8));
  STUDENTS.push(studentId);
  await enrollStudentInGroup(scope, { groupId, studentId });
  return studentId;
}

async function createSession(
  scope: ReturnType<typeof fixturesScope>,
  input: { groupId?: string; gradeLabel?: string; startsAt?: Date },
) {
  const session = await createOneOffSession(scope, {
    groupId: input.groupId ?? null,
    gradeLabel: input.gradeLabel ?? null,
    startsAt: (input.startsAt ?? new Date()).toISOString(),
    endsAt: null,
  });
  SESSIONS.push(session.id);
  return session;
}

describe("session modes and their rosters (ADR-0029)", () => {
  it("snapshots a grade-level roster at creation and does not follow later enrollments", async () => {
    const scope = fixturesScope();
    const grade = `Grade-${randomUUID().slice(0, 8)}`;
    const group = await createGroup(grade);
    const firstStudentId = await createEnrolledStudent(scope, group.id);

    const session = await createSession(scope, { gradeLabel: grade });
    expect(session.groupId).toBeNull();
    expect(session.gradeLabel).toBe(grade);

    const initial = await getSessionRoster(scope, session.id);
    expect(initial.roster.map((student) => student.studentId)).toEqual([firstStudentId]);

    // A student enrolled after the session exists is not silently added: the
    // grade roster is a snapshot, not a live query.
    const lateStudentId = await createEnrolledStudent(scope, group.id);
    const afterEnrollment = await getSessionRoster(scope, session.id);
    expect(afterEnrollment.roster.map((student) => student.studentId)).toEqual([firstStudentId]);

    // The teacher may add them by hand, and that attendee is origin "manual".
    await addSessionAttendee(scope, { sessionId: session.id, studentId: lateStudentId });
    const afterAdd = await getSessionRoster(scope, session.id);
    expect(afterAdd.roster.map((student) => student.studentId).sort()).toEqual(
      [firstStudentId, lateStudentId].sort(),
    );

    const origins = await withScope(scope, (tx) =>
      tx.sessionAttendee.findMany({
        where: { workspaceId: FIXTURES, sessionId: session.id },
        select: { studentId: true, origin: true },
      }),
    );
    expect(origins).toEqual(
      expect.arrayContaining([
        { studentId: firstStudentId, origin: "grade" },
        { studentId: lateStudentId, origin: "manual" },
      ]),
    );
  });

  it("starts an independent session empty and records attendance only for added students", async () => {
    const scope = fixturesScope();
    const session = await createSession(scope, {});
    expect(session.groupId).toBeNull();
    expect(session.gradeLabel).toBeNull();

    const empty = await getSessionRoster(scope, session.id);
    expect(empty.roster).toHaveLength(0);

    const studentId = await createStudent(FIXTURES, "Independent", randomUUID().slice(0, 8));
    STUDENTS.push(studentId);

    // A student who is not on the session roster cannot be marked.
    await expect(
      markAttendance(scope, { sessionId: session.id, studentId, mark: "present" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await addSessionAttendee(scope, { sessionId: session.id, studentId });

    // Adding the same student twice is refused instead of duplicating the row.
    await expect(
      addSessionAttendee(scope, { sessionId: session.id, studentId }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "attendance.errors.attendeeAlreadyOnRoster",
    });

    await markAttendance(scope, { sessionId: session.id, studentId, mark: "present" });
    const afterMark = await getSessionRoster(scope, session.id);
    expect(afterMark.roster).toHaveLength(1);
    expect(afterMark.roster[0]?.studentId).toBe(studentId);
    expect(afterMark.roster[0]?.mark).toBe("present");

    // A student with recorded attendance is never removed silently.
    await expect(
      removeSessionAttendee(scope, { sessionId: session.id, studentId }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "attendance.errors.attendeeHasMarks",
    });

    // Without marks, removal is allowed and empties the roster again.
    const removableId = await createStudent(FIXTURES, "Removable", randomUUID().slice(0, 8));
    STUDENTS.push(removableId);
    await addSessionAttendee(scope, { sessionId: session.id, studentId: removableId });
    await removeSessionAttendee(scope, { sessionId: session.id, studentId: removableId });
    const afterRemove = await getSessionRoster(scope, session.id);
    expect(afterRemove.roster.map((student) => student.studentId)).toEqual([studentId]);
  });

  it("keeps the group roster fixed and refuses manual attendee edits", async () => {
    const scope = fixturesScope();
    const group = await createGroup();
    const enrolledStudentId = await createEnrolledStudent(scope, group.id);
    const outsiderId = await createStudent(FIXTURES, "Outsider", randomUUID().slice(0, 8));
    STUDENTS.push(outsiderId);

    const session = await createSession(scope, { groupId: group.id });
    expect(session.groupId).toBe(group.id);
    expect(session.gradeLabel).toBeNull();

    const roster = await getSessionRoster(scope, session.id);
    expect(roster.roster.map((student) => student.studentId)).toEqual([enrolledStudentId]);

    await expect(
      addSessionAttendee(scope, { sessionId: session.id, studentId: outsiderId }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "attendance.errors.groupSessionRosterFixed",
    });
    await expect(
      removeSessionAttendee(scope, { sessionId: session.id, studentId: enrolledStudentId }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "attendance.errors.groupSessionRosterFixed",
    });
  });

  it("refuses attendance and roster edits on a cancelled session", async () => {
    const scope = fixturesScope();
    const session = await createSession(scope, {});
    const studentId = await createStudent(FIXTURES, "Cancelled", randomUUID().slice(0, 8));
    STUDENTS.push(studentId);
    await addSessionAttendee(scope, { sessionId: session.id, studentId });

    // The cancellation itself is covered by the sessions tests; here the
    // status is set directly so the attendance rules are the only variable.
    await withScope(scope, (tx) =>
      tx.teachingSession.update({
        where: { id: session.id },
        data: { status: "cancelled", cancelledAt: new Date() },
      }),
    );

    await expect(
      markAttendance(scope, { sessionId: session.id, studentId, mark: "present" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      addSessionAttendee(scope, { sessionId: session.id, studentId }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      removeSessionAttendee(scope, { sessionId: session.id, studentId }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
