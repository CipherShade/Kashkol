import { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";

export type RosterStudent = {
  studentId: string;
  firstName: string;
  lastName: string;
  enrolledAt: Date | null;
  mark: "present" | "absent" | "late" | "excused" | null;
  markId: string | null;
  source: "manual" | "qr" | null;
  recordedAt: Date | null;
  recordedBy: string | null;
  isCrossSeason: boolean;
  primaryGroupId: string | null;
  primaryGroupName: string | null;
};

export async function getSessionWithGroup(scope: Scope, sessionId: string) {
  return withScope(scope, async (tx) => {
    return tx.teachingSession.findFirst({
      where: { id: sessionId, workspaceId: scope.workspaceId },
      include: { group: true },
    });
  });
}

export async function getRosterForSession(scope: Scope, sessionId: string): Promise<RosterStudent[]> {
  return withScope(scope, async (tx) => {
    const session = await tx.teachingSession.findFirst({
      where: { id: sessionId, workspaceId: scope.workspaceId },
    });
    if (!session) return [];

    // Resolve the base roster: group sessions use the group's active
    // enrollments; group-less sessions (independent / grade-level) use the
    // materialised `session_attendee` roster (ADR-0029).
    const rosterBase: Array<{
      studentId: string;
      firstName: string;
      lastName: string;
      enrolledAt: Date | null;
    }> = session.groupId
      ? (
          await tx.enrollment.findMany({
            where: {
              workspaceId: scope.workspaceId,
              groupId: session.groupId,
              leftAt: null,
            },
            include: {
              student: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
            orderBy: [{ student: { firstName: "asc" } }],
          })
        ).map((e) => ({
          studentId: e.studentId,
          firstName: e.student.firstName,
          lastName: e.student.lastName,
          enrolledAt: e.enrolledAt,
        }))
      : (
          await tx.sessionAttendee.findMany({
            where: {
              workspaceId: scope.workspaceId,
              sessionId,
            },
            include: {
              student: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
            orderBy: [{ student: { firstName: "asc" } }],
          })
        ).map((a) => ({
          studentId: a.studentId,
          firstName: a.student.firstName,
          lastName: a.student.lastName,
          enrolledAt: null,
        }));

    // Get existing marks including student and primaryGroup for cross-season attendees
    const marks = await tx.attendanceMark.findMany({
      where: {
        workspaceId: scope.workspaceId,
        sessionId,
      },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true },
        },
        primaryGroup: {
          select: { id: true, name: true },
        },
      },
    });

    const markMap = new Map(marks.map((m) => [m.studentId, m]));
    const rosterStudentIds = new Set(rosterBase.map((r) => r.studentId));

    // 1. Regular roster students
    const roster: RosterStudent[] = rosterBase.map((r) => {
      const m = markMap.get(r.studentId);
      return {
        studentId: r.studentId,
        firstName: r.firstName,
        lastName: r.lastName,
        enrolledAt: r.enrolledAt,
        mark: m ? m.mark : null,
        markId: m ? m.id : null,
        source: m ? m.source : null,
        recordedAt: m ? m.recordedAt : null,
        recordedBy: m ? m.recordedBy : null,
        isCrossSeason: m?.isCrossSeason ?? false,
        primaryGroupId: m?.primaryGroupId ?? null,
        primaryGroupName: m?.primaryGroup?.name ?? null,
      };
    });

    // 2. Cross-season students who attended this session but are not enrolled in session.groupId.
    //    Group-less sessions have no "not enrolled in this group" concept, so any
    //    mark-holder missing from the attendee roster is appended without the
    //    cross-season badge instead of being hidden.
    for (const m of marks) {
      if (!rosterStudentIds.has(m.studentId)) {
        roster.push({
          studentId: m.studentId,
          firstName: m.student.firstName,
          lastName: m.student.lastName,
          enrolledAt: null,
          mark: m.mark,
          markId: m.id,
          source: m.source,
          recordedAt: m.recordedAt,
          recordedBy: m.recordedBy,
          isCrossSeason: Boolean(session.groupId),
          primaryGroupId: session.groupId ? m.primaryGroupId : null,
          primaryGroupName: session.groupId ? (m.primaryGroup?.name ?? null) : null,
        });
      }
    }

    return roster;
  });
}

export async function getAttendanceMark(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  sessionId: string,
  studentId: string,
) {
  return tx.attendanceMark.findFirst({
    where: { workspaceId, sessionId, studentId },
  });
}

/**
 * The minimal actor identity the attendance write path needs. Staff scopes
 * satisfy it structurally; the portal self check-in supplies the verified
 * portal user, never a fabricated staff scope.
 */
export type AttendanceActor = {
  workspaceId: string;
  actorUserId: string;
};

export async function upsertAttendanceMarkTx(
  tx: Prisma.TransactionClient,
  scope: AttendanceActor,
  data: {
    sessionId: string;
    studentId: string;
    mark: "present" | "absent" | "late" | "excused";
    source?: "manual" | "qr";
    deviceId?: string | null;
    isCrossSeason?: boolean;
    primaryGroupId?: string | null;
  },
) {
  const existing = await tx.attendanceMark.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      sessionId: data.sessionId,
      studentId: data.studentId,
    },
  });

  if (existing) {
    if (existing.mark === data.mark) {
      return existing;
    }
    // Create revision
    await tx.attendanceRevision.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId: scope.workspaceId,
        sessionId: data.sessionId,
        studentId: data.studentId,
        attendanceMarkId: existing.id,
        oldMark: existing.mark,
        newMark: data.mark,
        actorId: scope.actorUserId,
        reason: null,
      },
    });
    return tx.attendanceMark.update({
      where: { id: existing.id },
      data: {
        mark: data.mark,
        source: data.source ?? existing.source,
        deviceId: data.deviceId ?? existing.deviceId,
        recordedBy: scope.actorUserId,
        recordedAt: new Date(),
      },
    });
  } else {
    const mark = await tx.attendanceMark.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId: scope.workspaceId,
        sessionId: data.sessionId,
        studentId: data.studentId,
        mark: data.mark,
        source: data.source ?? "manual",
        deviceId: data.deviceId ?? null,
        recordedBy: scope.actorUserId,
        isCrossSeason: data.isCrossSeason ?? false,
        primaryGroupId: data.primaryGroupId ?? null,
      },
    });
    await tx.attendanceRevision.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId: scope.workspaceId,
        sessionId: data.sessionId,
        studentId: data.studentId,
        attendanceMarkId: mark.id,
        oldMark: null,
        newMark: data.mark,
        actorId: scope.actorUserId,
        reason: null,
      },
    });
    return mark;
  }
}

export async function correctAttendanceMarkTx(
  tx: Prisma.TransactionClient,
  scope: AttendanceActor,
  data: {
    sessionId: string;
    studentId: string;
    newMark: "present" | "absent" | "late" | "excused";
    reason: string;
    batchId?: string | null;
  },
) {
  const existing = await tx.attendanceMark.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      sessionId: data.sessionId,
      studentId: data.studentId,
    },
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }

  await tx.attendanceRevision.create({
    data: {
      id: crypto.randomUUID(),
      workspaceId: scope.workspaceId,
      sessionId: data.sessionId,
      studentId: data.studentId,
      attendanceMarkId: existing.id,
      oldMark: existing.mark,
      newMark: data.newMark,
      actorId: scope.actorUserId,
      reason: data.reason,
      batchId: data.batchId ?? null,
    },
  });

  return tx.attendanceMark.update({
    where: { id: existing.id },
    data: {
      mark: data.newMark,
      recordedBy: scope.actorUserId,
      recordedAt: new Date(),
    },
  });
}

export async function getEnrollmentForStudent(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  groupId: string,
  studentId: string,
) {
  return tx.enrollment.findFirst({
    where: {
      workspaceId,
      groupId,
      studentId,
      leftAt: null,
    },
  });
}

/**
 * The attendance set of a group-less session (ADR-0029): the
 * `session_attendee` row for one student, or null when the student is not on
 * the roster. The caller decides what "not on the roster" means for the
 * operation being authorised.
 */
export async function getSessionAttendeeTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  sessionId: string,
  studentId: string,
) {
  return tx.sessionAttendee.findFirst({
    where: { workspaceId, sessionId, studentId },
  });
}

export async function addSessionAttendeeTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  sessionId: string,
  studentId: string,
  origin: "manual" | "grade" = "manual",
) {
  return tx.sessionAttendee.create({
    data: {
      id: crypto.randomUUID(),
      workspaceId,
      sessionId,
      studentId,
      origin,
    },
  });
}

export async function removeSessionAttendeeTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  sessionId: string,
  studentId: string,
) {
  return tx.sessionAttendee.deleteMany({
    where: { workspaceId, sessionId, studentId },
  });
}

export async function getActiveEnrollmentForStudent(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  studentId: string,
) {
  return tx.enrollment.findFirst({
    where: {
      workspaceId,
      studentId,
      leftAt: null,
    },
    include: {
      group: { select: { id: true, name: true } },
    },
    orderBy: { enrolledAt: "desc" },
  });
}

export async function createQrTokenTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  data: {
    sessionId: string;
    tokenHash: string;
    expiresAt: Date;
  },
) {
  // Invalidate previous tokens for this session
  await tx.attendanceToken.updateMany({
    where: {
      workspaceId: scope.workspaceId,
      sessionId: data.sessionId,
      rotatedAt: null,
    },
    data: {
      rotatedAt: new Date(),
    },
  });

  return tx.attendanceToken.create({
    data: {
      id: crypto.randomUUID(),
      workspaceId: scope.workspaceId,
      sessionId: data.sessionId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
    },
  });
}

export async function findActiveQrTokenByHash(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  tokenHash: string,
) {
  const token = await tx.attendanceToken.findFirst({
    where: {
      workspaceId,
      tokenHash,
      rotatedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { session: { include: { group: true } } },
  });
  return token;
}

export async function getAttendanceMarkCount(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  sessionId: string,
) {
  const count = await tx.attendanceMark.count({
    where: { workspaceId, sessionId },
  });
  return count;
}

export async function getStudentForQrTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  studentId: string,
) {
  return tx.student.findFirst({
    where: { id: studentId, workspaceId, archivedAt: null },
    select: { id: true, firstName: true, lastName: true, qrTokenHash: true },
  });
}

export async function updateStudentQrHashTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  studentId: string,
  qrTokenHash: string | null,
) {
  return tx.student.update({
    where: { id: studentId },
    data: { qrTokenHash },
  });
}

export async function findStudentForQrScanTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  studentId: string,
) {
  return tx.student.findFirst({
    where: {
      id: studentId,
      workspaceId,
      archivedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      qrTokenHash: true,
    },
  });
}

