import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import { createStudent as createStudentService } from "@/modules/students/service";
import { enrollStudentInGroup } from "@/modules/groups/service";
import { scanStudentQrCode, markAttendance } from "@/modules/attendance/service";
import {
  getOrGenerateStudentQrToken,
  rotateStudentQrToken,
  revokeStudentQrToken,
} from "@/modules/attendance/student-qr";
import { resolveStudentPortalSignIn } from "@/modules/portals";
import { findActivePortalGrants } from "@/modules/identity/repository";
import { resolvePortalStudent, type PortalContext } from "@/modules/identity/session";
import {
  DELTA,
  DELTA_OWNER,
  FIXTURES,
  FIXTURE_OWNER,
  createStudent,
  createTestUser,
  deleteStudent,
  deleteTestUser,
  fixturesScope,
  type TestUser,
} from "./helpers";
import type { Scope } from "@/modules/tenancy/types";

const DELTA_OWNER_SCOPE: Scope = {
  workspaceId: DELTA,
  actorUserId: DELTA_OWNER,
  actorDisplayName: "Delta Owner",
  role: "owner",
  permissions: new Set(),
};

// An assistant scope with no grants at all: `attendance:write` is required to
// scan a QR roster, so every scan attempt must fail closed with 403.
const NO_PERMISSION_ASSISTANT: Scope = {
  workspaceId: FIXTURES,
  actorUserId: FIXTURE_OWNER,
  actorDisplayName: "Unprivileged Assistant",
  role: "assistant",
  permissions: new Set(),
};

const GROUPS: string[] = [];
const DELTA_GROUPS: string[] = [];
const STUDENTS: string[] = [];
const DELTA_STUDENTS: string[] = [];
const SESSIONS: string[] = [];
const DELTA_SESSIONS: string[] = [];
const CREATED_USERS: TestUser[] = [];

afterAll(async () => {
  await disconnectDb();
});

afterEach(async () => {
  // Attendance marks carry an initial append-only revision; delete marks best
  // effort, then sessions, enrollments and students. One blocked delete must
  // not roll back the rest.
  const bestEffort = (promise: Promise<unknown>) => promise.catch(() => undefined);
  for (const [workspaceId, sessions] of [
    [FIXTURES, () => SESSIONS],
    [DELTA, () => DELTA_SESSIONS],
  ] as const) {
    for (const sessionId of sessions()) {
      await bestEffort(
        withScope({ workspaceId }, (tx) =>
          tx.attendanceMark.deleteMany({ where: { workspaceId, sessionId } }),
        ),
      );
    }
  }
  for (const [workspaceId, sessions] of [
    [FIXTURES, () => SESSIONS],
    [DELTA, () => DELTA_SESSIONS],
  ] as const) {
    for (const sessionId of sessions()) {
      await bestEffort(
        withScope({ workspaceId }, (tx) =>
          tx.teachingSession.deleteMany({ where: { workspaceId, id: sessionId } }),
        ),
      );
    }
  }
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
  for (const groupId of DELTA_GROUPS) {
    await bestEffort(
      withScope({ workspaceId: DELTA }, (tx) =>
        tx.enrollment.deleteMany({ where: { workspaceId: DELTA, groupId } }),
      ),
    );
    await bestEffort(
      withScope({ workspaceId: DELTA }, (tx) =>
        tx.groupScheduleSlot.deleteMany({ where: { workspaceId: DELTA, groupId } }),
      ),
    );
    await bestEffort(
      withScope({ workspaceId: DELTA }, (tx) =>
        tx.group.deleteMany({ where: { workspaceId: DELTA, id: groupId } }),
      ),
    );
  }
  for (const studentId of STUDENTS) await deleteStudent(FIXTURES, studentId);
  for (const studentId of DELTA_STUDENTS) await deleteStudent(DELTA, studentId);
  for (const user of CREATED_USERS) await deleteTestUser(user);
  GROUPS.length = 0;
  DELTA_GROUPS.length = 0;
  STUDENTS.length = 0;
  DELTA_STUDENTS.length = 0;
  SESSIONS.length = 0;
  DELTA_SESSIONS.length = 0;
  CREATED_USERS.length = 0;
});

let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  return `+2011${String(20000000 + phoneCounter).slice(-8)}`;
}

async function createServiceStudent(phone: string | null = null) {
  const result = await createStudentService(
    fixturesScope(),
    {
      firstName: "Qr",
      lastName: randomUUID().slice(0, 8),
      grade: null,
      phone,
      parentName: null,
      parentPhone: null,
      groupIds: [],
      note: null,
      confirmDuplicate: true,
    },
    { requestId: randomUUID() },
  );
  if (result.duplicateWarning) throw new Error("unexpected duplicate student");
  STUDENTS.push(result.student.id);
  return result;
}

async function createGroupWithSession(
  workspaceId: string,
  status: "scheduled" | "started" | "completed" | "cancelled",
) {
  const group = await withScope({ workspaceId }, (tx) =>
    tx.group.create({
      data: {
        workspaceId,
        name: `Qr ${randomUUID().slice(0, 8)}`,
        color: "indigo",
        scheduleSlots: {
          create: {
            weekday: 0,
            startTime: new Date("1970-01-01T16:00:00.000Z"),
            endTime: new Date("1970-01-01T17:00:00.000Z"),
            capacity: 30,
          },
        },
      },
    }),
  );
  if (workspaceId === FIXTURES) GROUPS.push(group.id);
  else DELTA_GROUPS.push(group.id);

  const session = await withScope({ workspaceId }, (tx) =>
    tx.teachingSession.create({
      data: {
        workspaceId,
        groupId: group.id,
        status,
        startsAt: new Date("2026-11-10T14:00:00.000Z"),
        endsAt: new Date("2026-11-10T15:00:00.000Z"),
      },
    }),
  );
  if (workspaceId === FIXTURES) SESSIONS.push(session.id);
  else DELTA_SESSIONS.push(session.id);
  return { group, session };
}

describe("student attendance QR against PostgreSQL", () => {
  it("student creation auto-generates the attendance QR identity", async () => {
    const { student } = await createServiceStudent();

    const raw = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.student.findFirst({
        where: { workspaceId: FIXTURES, id: student.id },
        select: { qrTokenHash: true },
      }),
    );
    // Stored as `nonce:sha256(token)` — never the raw token.
    expect(raw?.qrTokenHash).toMatch(/^[A-Za-z0-9_-]+:[0-9a-f]{64}$/);

    const audits = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.auditEvent.findMany({
        where: {
          workspaceId: FIXTURES,
          entityType: "student",
          entityId: student.id,
          action: "student.qr_generated",
        },
      }),
    );
    expect(audits.length).toBeGreaterThanOrEqual(1);

    const { token } = await getOrGenerateStudentQrToken(fixturesScope(), student.id, {
      requestId: randomUUID(),
    });
    expect(token.startsWith(`kqr_v1.${student.id}.`)).toBe(true);
    // Re-reading the same student returns the same persistent token, not a new one.
    const again = await getOrGenerateStudentQrToken(fixturesScope(), student.id, {
      requestId: randomUUID(),
    });
    expect(again.token).toBe(token);
  });

  it("scans identify the student for attendance and record a qr-sourced mark", async () => {
    const { student } = await createServiceStudent();
    const { group, session } = await createGroupWithSession(FIXTURES, "started");
    await enrollStudentInGroup(fixturesScope(), { groupId: group.id, studentId: student.id });

    const { token } = await getOrGenerateStudentQrToken(fixturesScope(), student.id, {
      requestId: randomUUID(),
    });
    await scanStudentQrCode(
      fixturesScope(),
      { qrToken: token, sessionId: session.id, markLate: false },
      { requestId: randomUUID() },
    );

    const mark = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.attendanceMark.findFirst({
        where: { workspaceId: FIXTURES, sessionId: session.id, studentId: student.id },
      }),
    );
    expect(mark).not.toBeNull();
    expect(mark?.mark).toBe("present");
    expect(mark?.source).toBe("qr");
  });

  it("the attendance QR cannot be used to sign in", async () => {
    const phone = freshPhone();
    const { student, portalCredential } = await createServiceStudent(phone);
    expect(portalCredential).not.toBeNull();

    const { token: qrToken } = await getOrGenerateStudentQrToken(fixturesScope(), student.id, {
      requestId: randomUUID(),
    });

    // The QR token is not a password: using it as one must fail like any
    // other wrong credential.
    await expect(
      resolveStudentPortalSignIn({ phone, password: qrToken }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    // And the real password still works, proving the QR scan did not touch
    // the credential path.
    const resolved = await resolveStudentPortalSignIn({
      phone,
      password: portalCredential!.password,
    });
    expect(resolved.phone).toBe(phone);
  });

  it("re-issuing the QR immediately invalidates the previous token", async () => {
    const { student } = await createServiceStudent();
    const { token: oldToken } = await getOrGenerateStudentQrToken(fixturesScope(), student.id, {
      requestId: randomUUID(),
    });
    const { group, session } = await createGroupWithSession(FIXTURES, "started");
    await enrollStudentInGroup(fixturesScope(), { groupId: group.id, studentId: student.id });

    const { token: newToken } = await rotateStudentQrToken(fixturesScope(), student.id, {
      requestId: randomUUID(),
    });
    expect(newToken).not.toBe(oldToken);

    await expect(
      scanStudentQrCode(
        fixturesScope(),
        { qrToken: oldToken, sessionId: session.id, markLate: false },
        { requestId: randomUUID() },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      messageKey: "attendance.errors.invalidQrCode",
    });

    // The new token is the only one that scans.
    await scanStudentQrCode(
      fixturesScope(),
      { qrToken: newToken, sessionId: session.id, markLate: false },
      { requestId: randomUUID() },
    );
    const mark = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.attendanceMark.findFirst({
        where: { workspaceId: FIXTURES, sessionId: session.id, studentId: student.id },
      }),
    );
    expect(mark?.source).toBe("qr");
  });

  it("revoking the QR rejects scans until it is re-issued", async () => {
    const { student } = await createServiceStudent();
    const { token } = await getOrGenerateStudentQrToken(fixturesScope(), student.id, {
      requestId: randomUUID(),
    });
    const { group, session } = await createGroupWithSession(FIXTURES, "started");
    await enrollStudentInGroup(fixturesScope(), { groupId: group.id, studentId: student.id });

    await revokeStudentQrToken(fixturesScope(), student.id, { requestId: randomUUID() });

    await expect(
      scanStudentQrCode(
        fixturesScope(),
        { qrToken: token, sessionId: session.id, markLate: false },
        { requestId: randomUUID() },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      messageKey: "attendance.errors.invalidQrCode",
    });
  });

  it("a QR issued in one workspace is rejected in another", async () => {
    const { student } = await createServiceStudent();
    const { token } = await getOrGenerateStudentQrToken(fixturesScope(), student.id, {
      requestId: randomUUID(),
    });
    const { session: foreignSession } = await createGroupWithSession(DELTA, "started");

    // The DELTA owner scans the FIXTURES student's token: the student does not
    // exist in the DELTA workspace, so the scan fails closed.
    await expect(
      scanStudentQrCode(
        DELTA_OWNER_SCOPE,
        {
          qrToken: token,
          sessionId: foreignSession.id,
          markLate: false,
        },
        { requestId: randomUUID() },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      messageKey: "attendance.errors.invalidQrCode",
    });

    const mark = await withScope({ workspaceId: DELTA }, (tx) =>
      tx.attendanceMark.findFirst({
        where: { workspaceId: DELTA, sessionId: foreignSession.id },
      }),
    );
    expect(mark).toBeNull();
  });

  it("a duplicate scan for the same session is rejected without corrupting the mark", async () => {
    const { student } = await createServiceStudent();
    const { group, session } = await createGroupWithSession(FIXTURES, "started");
    await enrollStudentInGroup(fixturesScope(), { groupId: group.id, studentId: student.id });

    const { token } = await getOrGenerateStudentQrToken(fixturesScope(), student.id, {
      requestId: randomUUID(),
    });
    await scanStudentQrCode(
      fixturesScope(),
      { qrToken: token, sessionId: session.id, markLate: false },
      { requestId: randomUUID() },
    );

    await expect(
      scanStudentQrCode(
        fixturesScope(),
        { qrToken: token, sessionId: session.id, markLate: false },
        { requestId: randomUUID() },
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "attendance.errors.alreadyScanned",
    });

    const count = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.attendanceMark.count({
        where: { workspaceId: FIXTURES, sessionId: session.id, studentId: student.id },
      }),
    );
    expect(count).toBe(1);
  });

  it("an assistant without attendance:write cannot scan a roster", async () => {
    const { student } = await createServiceStudent();
    const { session } = await createGroupWithSession(FIXTURES, "started");
    const { token } = await getOrGenerateStudentQrToken(fixturesScope(), student.id, {
      requestId: randomUUID(),
    });

    await expect(
      scanStudentQrCode(
        NO_PERMISSION_ASSISTANT,
        { qrToken: token, sessionId: session.id, markLate: false },
        { requestId: randomUUID() },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const mark = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.attendanceMark.findFirst({
        where: { workspaceId: FIXTURES, sessionId: session.id, studentId: student.id },
      }),
    );
    expect(mark).toBeNull();
  });

  it("attendance can be recorded on a completed session (no time/status window)", async () => {
    const { student } = await createServiceStudent();
    const { group, session } = await createGroupWithSession(FIXTURES, "completed");
    await enrollStudentInGroup(fixturesScope(), { groupId: group.id, studentId: student.id });

    const { token } = await getOrGenerateStudentQrToken(fixturesScope(), student.id, {
      requestId: randomUUID(),
    });
    await scanStudentQrCode(
      fixturesScope(),
      { qrToken: token, sessionId: session.id, markLate: false },
      { requestId: randomUUID() },
    );

    const mark = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.attendanceMark.findFirst({
        where: { workspaceId: FIXTURES, sessionId: session.id, studentId: student.id },
      }),
    );
    expect(mark).not.toBeNull();
    expect(mark?.mark).toBe("present");
    expect(mark?.source).toBe("qr");
  });

  it("manual marks and corrections are still allowed on a completed session", async () => {
    const { student } = await createServiceStudent();
    const { group, session } = await createGroupWithSession(FIXTURES, "completed");
    await enrollStudentInGroup(fixturesScope(), { groupId: group.id, studentId: student.id });

    await markAttendance(
      fixturesScope(),
      { sessionId: session.id, studentId: student.id, mark: "present" },
      { requestId: randomUUID() },
    );
    await markAttendance(
      fixturesScope(),
      { sessionId: session.id, studentId: student.id, mark: "late" },
      { requestId: randomUUID() },
    );

    const mark = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.attendanceMark.findFirst({
        where: { workspaceId: FIXTURES, sessionId: session.id, studentId: student.id },
      }),
    );
    expect(mark?.mark).toBe("late");
  });

  it("a cancelled session still rejects scans and marks", async () => {
    const { student } = await createServiceStudent();
    const { group, session } = await createGroupWithSession(FIXTURES, "cancelled");
    await enrollStudentInGroup(fixturesScope(), { groupId: group.id, studentId: student.id });

    const { token } = await getOrGenerateStudentQrToken(fixturesScope(), student.id, {
      requestId: randomUUID(),
    });
    await expect(
      scanStudentQrCode(
        fixturesScope(),
        { qrToken: token, sessionId: session.id, markLate: false },
        { requestId: randomUUID() },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      markAttendance(
        fixturesScope(),
        { sessionId: session.id, studentId: student.id, mark: "present" },
        { requestId: randomUUID() },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("a student portal user cannot read another student's portal record", async () => {
    const studentA = await createStudent(FIXTURES, "QrIsolationA");
    const studentB = await createStudent(FIXTURES, "QrIsolationB");
    STUDENTS.push(studentA, studentB);
    const portalUser = await createTestUser("student-qr-portal");
    CREATED_USERS.push(portalUser);

    const grantId = randomUUID();
    await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.portalGrant.create({
        data: {
          id: grantId,
          workspaceId: FIXTURES,
          portalUserId: portalUser.id,
          studentId: studentA,
          kind: "student",
          issuedBy: FIXTURE_OWNER,
        },
      }),
    );

    try {
      const grants = await findActivePortalGrants(portalUser.id, new Date());
      const portal: PortalContext = {
        userId: portalUser.id,
        grants,
        workspaceIds: [...new Set(grants.map((grant) => grant.workspaceId))],
        studentIds: new Set(grants.map((grant) => grant.studentId)),
      };

      // Their own record resolves; the classmate's does not.
      const own = await resolvePortalStudent(portal, studentA, "student");
      expect(own.student.id).toBe(studentA);

      await expect(
        resolvePortalStudent(portal, studentB, "student"),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        resolvePortalStudent(portal, randomUUID(), "student"),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    } finally {
      await withScope({ workspaceId: FIXTURES }, (tx) =>
        tx.portalGrant.deleteMany({ where: { workspaceId: FIXTURES, portalUserId: portalUser.id } }),
      );
    }
  });
});
