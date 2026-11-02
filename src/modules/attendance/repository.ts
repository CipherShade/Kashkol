import { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";

export type RosterStudent = {
  studentId: string;
  firstName: string;
  lastName: string;
  enrolledAt: Date;
  mark: "present" | "absent" | "late" | "excused" | null;
  markId: string | null;
  source: "manual" | "qr" | null;
  recordedAt: Date | null;
  recordedBy: string | null;
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

    // Get active enrollments for the group
    const enrollments = await tx.enrollment.findMany({
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
    });

    // Get existing marks
    const marks = await tx.attendanceMark.findMany({
      where: {
        workspaceId: scope.workspaceId,
        sessionId,
      },
    });

    const markMap = new Map(marks.map((m) => [m.studentId, m]));

    return enrollments.map((e) => {
      const m = markMap.get(e.studentId);
      return {
        studentId: e.studentId,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        enrolledAt: e.enrolledAt,
        mark: m ? m.mark : null,
        markId: m ? m.id : null,
        source: m ? m.source : null,
        recordedAt: m ? m.recordedAt : null,
        recordedBy: m ? m.recordedBy : null,
      };
    });
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

export async function enqueueNotificationOutbox(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  payload: Record<string, unknown>,
) {
  // Try to use outbox_event if it exists in schema - following pattern of other codebase
  // The table may not exist in schema yet, but we follow the pattern
  try {
    const outbox = (
      tx as unknown as {
        outboxEvent?: {
          create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
        };
      }
    ).outboxEvent;
    if (outbox) {
      await outbox.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId,
          kind: "attendance.notification",
          payload,
          state: "pending",
          attempts: 0,
          runAt: new Date(),
        },
      });
    }
  } catch {
    // If outbox doesn't exist, ignore - notifications must not break attendance
  }
}
