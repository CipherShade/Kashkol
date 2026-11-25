import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { withScope } from "@/lib/db/scope";
import { disconnectDb } from "@/lib/db/client";
import { markAttendance } from "@/modules/attendance/service";
import { enrollStudentInGroup } from "@/modules/groups/service";
import { cancelSession, createOneOffSession, rescheduleSession } from "@/modules/sessions/service";
import { studentQuerySchema } from "@/modules/students/schemas";
import { getStudents } from "@/modules/students/service";
import { FIXTURES, createStudent, deleteStudent, fixturesScope } from "./helpers";

const GROUPS: string[] = [];
const STUDENTS: string[] = [];
const SESSIONS: string[] = [];

afterAll(async () => {
  await disconnectDb();
});

afterEach(async () => {
  // Session revisions and attendance revisions are append-only, so corrected
  // sessions cannot be deleted by the application role. They stay in the
  // disposable fixture workspace; only freely deletable rows are cleaned up.
  const bestEffort = (promise: Promise<unknown>) => promise.catch(() => undefined);

  await bestEffort(
    withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.sessionAttendee.deleteMany({
        where: { workspaceId: FIXTURES, sessionId: { in: SESSIONS } },
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

async function setupFixture() {
  const scope = fixturesScope("Session Correction");
  const group = await withScope(scope, (tx) =>
    tx.group.create({
      data: {
        workspaceId: FIXTURES,
        name: `Correction ${randomUUID()}`,
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

  const studentId = await createStudent(FIXTURES, "Correction", randomUUID().slice(0, 8));
  STUDENTS.push(studentId);
  await enrollStudentInGroup(scope, { groupId: group.id, studentId });

  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const session = await createOneOffSession(scope, {
    groupId: group.id,
    gradeLabel: null,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString(),
  });
  SESSIONS.push(session.id);

  await markAttendance(scope, {
    sessionId: session.id,
    studentId,
    mark: "present",
  });

  return { scope, group, studentId, session, startsAt };
}

async function attendanceRateFor(scope: ReturnType<typeof fixturesScope>, studentId: string) {
  const students = await getStudents(scope, studentQuerySchema.parse({ pageSize: 100 }));
  return students.items.find((item) => item.id === studentId)?.attendanceRate ?? null;
}

describe("F-P2-12 session correction workflow", () => {
  it("reschedules with a reason, writes a revision, and keeps attendance attached", async () => {
    const { scope, session, startsAt } = await setupFixture();
    const nextStart = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);

    const updated = await rescheduleSession(scope, {
      id: session.id,
      startsAt: nextStart.toISOString(),
      endsAt: null,
      reason: "Moved to the following day",
      scope: "single",
    });
    expect(updated.startsAt.toISOString()).toBe(nextStart.toISOString());

    const revisions = await withScope(scope, (tx) =>
      tx.sessionRevision.findMany({
        where: { workspaceId: FIXTURES, sessionId: session.id },
        orderBy: { createdAt: "asc" },
      }),
    );
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.reason).toBe("Moved to the following day");
    expect((revisions[0]?.before as { startsAt: string }).startsAt).toBe(startsAt.toISOString());
    expect((revisions[0]?.after as { startsAt: string }).startsAt).toBe(nextStart.toISOString());

    const marks = await withScope(scope, (tx) =>
      tx.attendanceMark.findMany({ where: { workspaceId: FIXTURES, sessionId: session.id } }),
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]?.mark).toBe("present");

    const audits = await withScope(scope, (tx) =>
      tx.auditEvent.findMany({
        where: { workspaceId: FIXTURES, entityId: session.id, action: "session.rescheduled" },
      }),
    );
    expect(audits).toHaveLength(1);
  });

  it("allows a conflicting reschedule and records the correction instead of blocking it", async () => {
    const { scope, group, session, startsAt } = await setupFixture();
    const occupiedStart = new Date(startsAt.getTime() + 3 * 24 * 60 * 60 * 1000);
    const occupiedEnd = new Date(occupiedStart.getTime() + 60 * 60 * 1000);
    const other = await createOneOffSession(scope, {
      groupId: group.id,
      gradeLabel: null,
      startsAt: occupiedStart.toISOString(),
      endsAt: occupiedEnd.toISOString(),
    });
    SESSIONS.push(other.id);

    const moved = await rescheduleSession(scope, {
      id: session.id,
      startsAt: occupiedStart.toISOString(),
      endsAt: occupiedEnd.toISOString(),
      reason: "Moved onto an occupied slot",
      scope: "single",
    });

    expect(moved.startsAt.toISOString()).toBe(occupiedStart.toISOString());
    const revisions = await withScope(scope, (tx) =>
      tx.sessionRevision.findMany({
        where: { workspaceId: FIXTURES, sessionId: session.id },
      }),
    );
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.reason).toBe("Moved onto an occupied slot");

    const bothSessions = await withScope(scope, (tx) =>
      tx.teachingSession.count({
        where: { workspaceId: FIXTURES, id: { in: [session.id, other.id] } },
      }),
    );
    expect(bothSessions).toBe(2);
  });

  it("allows a reschedule into the past with a reason", async () => {
    const { scope, session } = await setupFixture();
    const pastStart = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const moved = await rescheduleSession(scope, {
      id: session.id,
      startsAt: pastStart.toISOString(),
      endsAt: null,
      reason: "Logged the move late",
      scope: "single",
    });

    expect(moved.startsAt.toISOString()).toBe(pastStart.toISOString());
    const revisions = await withScope(scope, (tx) =>
      tx.sessionRevision.findMany({
        where: { workspaceId: FIXTURES, sessionId: session.id },
      }),
    );
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.reason).toBe("Logged the move late");
  });

  it("cancels with a reason, retains attendance, and excludes it from rates", async () => {
    const { scope, session, studentId } = await setupFixture();

    const rateBeforeCancel = await attendanceRateFor(scope, studentId);
    expect(rateBeforeCancel).toBe(100);

    const cancelled = await cancelSession(scope, {
      id: session.id,
      reason: "Teacher cancelled the lesson",
      scope: "single",
    });
    expect(cancelled.status).toBe("cancelled");

    const marks = await withScope(scope, (tx) =>
      tx.attendanceMark.findMany({ where: { workspaceId: FIXTURES, sessionId: session.id } }),
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]?.mark).toBe("present");

    const revisions = await withScope(scope, (tx) =>
      tx.sessionRevision.findMany({
        where: { workspaceId: FIXTURES, sessionId: session.id },
        orderBy: { createdAt: "asc" },
      }),
    );
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.reason).toBe("Teacher cancelled the lesson");
    expect((revisions[0]?.after as { status: string }).status).toBe("cancelled");

    const audits = await withScope(scope, (tx) =>
      tx.auditEvent.findMany({
        where: { workspaceId: FIXTURES, entityId: session.id, action: "session.cancelled" },
      }),
    );
    expect(audits).toHaveLength(1);

    expect(await attendanceRateFor(scope, studentId)).toBeNull();
  });
});
