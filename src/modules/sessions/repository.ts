import { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";
import { generateGroupUpcomingSessionsTx } from "@/modules/groups/repository";

export type SessionListItem = {
  id: string;
  /** Null for independent and grade-level sessions (ADR-0029). */
  groupId: string | null;
  groupName: string;
  groupColor: string;
  /** The grade label a grade-level session was snapshotted from; null otherwise. */
  gradeLabel: string | null;
  startsAt: Date;
  endsAt: Date | null;
  status: "scheduled" | "started" | "completed" | "cancelled";
  isOneOff: boolean;
  cancelledAt: Date | null;
  hasAttendance: boolean;
  room?: string | null;
  location?: string | null;
  notes?: string | null;
  teacherId?: string | null;
  assistantId?: string | null;
  seriesId?: string | null;
  occurrenceNo?: number | null;
};

export async function listSessions(scope: Scope, from: Date, to: Date, groupId?: string) {
  return withScope(scope, async (tx) => {
    const sessions = await tx.teachingSession.findMany({
      where: {
        workspaceId: scope.workspaceId,
        startsAt: {
          gte: from,
          lte: to,
        },
        ...(groupId ? { groupId } : {}),
      },
      include: {
        group: {
          select: {
            name: true,
            color: true,
          },
        },
        attendanceMarks: {
          select: {
            id: true,
          },
          take: 1,
        },
      },
      orderBy: [{ startsAt: "asc" }],
    });

    return sessions.map((s): SessionListItem => ({
      id: s.id,
      groupId: s.groupId,
      groupName: s.group?.name ?? "",
      groupColor: s.group?.color ?? "",
      gradeLabel: s.gradeLabel,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      status: s.status,
      isOneOff: s.isOneOff,
      cancelledAt: s.cancelledAt,
      hasAttendance: s.attendanceMarks.length > 0,
      room: s.room,
      location: s.location,
      notes: s.notes,
      teacherId: s.teacherId,
      assistantId: s.assistantId,
      seriesId: s.seriesId,
      occurrenceNo: s.occurrenceNo,
    }));
  });
}

export async function findSessionById(scope: Scope, sessionId: string) {
  return withScope(scope, async (tx) => {
    const session = await tx.teachingSession.findFirst({
      where: {
        id: sessionId,
        workspaceId: scope.workspaceId,
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            color: true,
            scheduleSlots: {
              orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
              select: {
                id: true,
                weekday: true,
                startTime: true,
                endTime: true,
                room: true,
                capacity: true,
              },
            },
          },
        },
        attendanceMarks: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!session) return null;

    return {
      ...session,
      hasAttendance: session.attendanceMarks.length > 0,
    };
  });
}

export async function createOneOffSessionTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  data: {
    id: string;
    /** Null for independent and grade-level sessions (ADR-0029). */
    groupId?: string | null;
    /** The grade label a grade-level session snapshots its roster from. */
    gradeLabel?: string | null;
    startsAt: Date;
    endsAt: Date | null;
    room?: string | null;
    location?: string | null;
    notes?: string | null;
    teacherId?: string | null;
    assistantId?: string | null;
    pricePerStudentMinor?: number | null;
  },
) {
  // Group sessions keep the existing behaviour: the group must belong to the
  // workspace and the session inherits its default price when none is given.
  let effectivePrice: number | null = data.pricePerStudentMinor ?? null;
  if (data.groupId) {
    const group = await tx.group.findFirst({
      where: { id: data.groupId, workspaceId: scope.workspaceId, archivedAt: null },
    });
    if (!group) throw new Error("NOT_FOUND");
    if (data.pricePerStudentMinor === undefined) {
      effectivePrice = group.defaultPricePerStudentMinor ?? null;
    }
  }

  const session = await tx.teachingSession.create({
    data: {
      id: data.id,
      workspaceId: scope.workspaceId,
      groupId: data.groupId ?? null,
      gradeLabel: data.groupId ? null : (data.gradeLabel ?? null),
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      status: "scheduled",
      isOneOff: true,
      room: data.room ?? null,
      location: data.location ?? null,
      notes: data.notes ?? null,
      teacherId: data.teacherId ?? null,
      assistantId: data.assistantId ?? null,
      pricePerStudentMinor: effectivePrice,
    },
  });

  // Grade-level sessions materialise their roster at creation: every student
  // currently enrolled (not yet left) in a non-archived group carrying the
  // same grade label, deduplicated, is inserted with origin "grade". The
  // snapshot does not move with later enrollment changes (ADR-0029).
  let rosterSize = 0;
  if (!data.groupId && data.gradeLabel) {
    const gradeGroups = await tx.group.findMany({
      where: { workspaceId: scope.workspaceId, archivedAt: null, grade: data.gradeLabel },
      select: { id: true },
    });
    if (gradeGroups.length > 0) {
      const enrollments = await tx.enrollment.findMany({
        where: {
          workspaceId: scope.workspaceId,
          groupId: { in: gradeGroups.map((g) => g.id) },
          leftAt: null,
        },
        select: { studentId: true },
        distinct: ["studentId"],
      });
      if (enrollments.length > 0) {
        await tx.sessionAttendee.createMany({
          data: enrollments.map((e) => ({
            workspaceId: scope.workspaceId,
            sessionId: data.id,
            studentId: e.studentId,
            origin: "grade",
          })),
        });
      }
      rosterSize = enrollments.length;
    }
  }

  return { session, rosterSize };
}

export async function updateSessionTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  sessionId: string,
  data: {
    room?: string | null;
    location?: string | null;
    notes?: string | null;
    teacherId?: string | null;
    assistantId?: string | null;
    pricePerStudentMinor?: number | null;
  },
) {
  return tx.teachingSession.update({
    where: {
      id: sessionId,
      workspaceId: scope.workspaceId,
    },
    data,
  });
}

export async function rescheduleSessionTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  sessionId: string,
  data: {
    startsAt: Date;
    endsAt: Date | null;
  },
) {
  return tx.teachingSession.update({
    where: {
      id: sessionId,
      workspaceId: scope.workspaceId,
    },
    data: {
      startsAt: data.startsAt,
      endsAt: data.endsAt,
    },
  });
}

export async function rescheduleSeriesTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  seriesId: string,
  data: {
    startsAt: Date;
    endsAt: Date | null;
    fromDate: Date,
  },
) {
  return tx.teachingSession.updateMany({
    where: {
      workspaceId: scope.workspaceId,
      seriesId,
      startsAt: { gte: data.fromDate },
      status: { not: "cancelled" },
    },
    data: {
      startsAt: data.startsAt,
      endsAt: data.endsAt,
    },
  });
}

export async function cancelSessionTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  sessionId: string,
  cancelledBy: string,
) {
  return tx.teachingSession.update({
    where: {
      id: sessionId,
      workspaceId: scope.workspaceId,
    },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledBy,
    },
  });
}

export async function cancelSeriesTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  seriesId: string,
  cancelledBy: string,
  fromDate: Date,
) {
  return tx.teachingSession.updateMany({
    where: {
      workspaceId: scope.workspaceId,
      seriesId,
      startsAt: { gte: fromDate },
      status: { not: "cancelled" },
    },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledBy,
    },
  });
}

export async function startSessionTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  sessionId: string,
) {
  const session = await tx.teachingSession.findFirst({
    where: { id: sessionId, workspaceId: scope.workspaceId },
  });
  if (!session) throw new Error("NOT_FOUND");
  if (session.status !== "scheduled") throw new Error("INVALID_STATUS");
  
  return tx.teachingSession.update({
    where: {
      id: sessionId,
      workspaceId: scope.workspaceId,
    },
    data: {
      status: "started",
      startedAt: new Date(),
    },
  });
}

export async function completeSessionTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  sessionId: string,
) {
  const session = await tx.teachingSession.findFirst({
    where: { id: sessionId, workspaceId: scope.workspaceId },
  });
  if (!session) throw new Error("NOT_FOUND");
  if (session.status !== "started" && session.status !== "scheduled") throw new Error("INVALID_STATUS");
  
  return tx.teachingSession.update({
    where: {
      id: sessionId,
      workspaceId: scope.workspaceId,
    },
    data: {
      status: "completed",
      completedAt: new Date(),
    },
  });
}

export async function findConflictingSessions(
  scope: Scope,
  groupId: string,
  startsAt: Date,
  endsAt: Date | null,
  excludeSessionId?: string,
) {
  return withScope(scope, async (tx) => {
    const conflicts = await tx.teachingSession.findMany({
      where: {
        workspaceId: scope.workspaceId,
        status: { not: "cancelled" },
        groupId,
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
        AND: endsAt
          ? [
              { startsAt: { lt: endsAt } },
              {
                OR: [
                  { endsAt: null },
                  { endsAt: { gt: startsAt } },
                ],
              },
            ]
          : [
              { startsAt: { gte: startsAt } },
              {
                startsAt: {
                  lt: new Date(startsAt.getTime() + 60 * 60 * 1000), // rough check if no end
                },
              },
            ],
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        groupId: true,
      },
    });
    return conflicts;
  });
}

export async function generateSessionsForGroup(
  scope: Scope,
  groupId: string,
  weeksAhead: number = 4,
) {
  return withScope(scope, async (tx) => {
    const group = await tx.group.findFirst({
      where: { id: groupId, workspaceId: scope.workspaceId, archivedAt: null },
      include: {
        scheduleSlots: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }] },
      },
    });
    if (!group) throw new Error("NOT_FOUND");

    const formatTime = (d: Date | null | undefined): string | null => {
      if (!d) return null;
      return d.toISOString().slice(11, 16);
    };

    for (const slot of group.scheduleSlots) {
      const startTime = formatTime(slot.startTime) ?? "16:00";
      const endTime = formatTime(slot.endTime);

      await generateGroupUpcomingSessionsTx(
        tx,
        scope.workspaceId,
        groupId,
        slot.weekday,
        startTime,
        endTime,
        weeksAhead,
      );
    }

    return { generated: true };
  });
}
