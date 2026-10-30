import { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import { newUuidV7 } from "@/lib/id";
import type { Scope } from "@/modules/tenancy/types";
import type { GroupQueryParams } from "./schemas";

export type GroupListItem = {
  id: string;
  name: string;
  subject: { id: string; name: string } | null;
  grade: string | null;
  room: string | null;
  color: string;
  weekday: number;
  startTime: string;
  endTime: string | null;
  capacity: number | null;
  teacherNote: string | null;
  enrolledCount: number;
  archivedAt: Date | null;
};

export function parseTimeToDate(timeStr: string): Date {
  return new Date(`1970-01-01T${timeStr}:00Z`);
}

export function formatTimeFromDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  // If Date object
  if (d instanceof Date) {
    return d.toISOString().slice(11, 16);
  }
  // If string like "16:00:00"
  const str = String(d);
  if (/^\d{2}:\d{2}/.test(str)) {
    return str.slice(0, 5);
  }
  return null;
}

export async function findGroupById(scope: Scope, groupId: string) {
  return withScope(scope, async (tx) => {
    const group = await tx.group.findFirst({
      where: {
        id: groupId,
        workspaceId: scope.workspaceId,
      },
      include: {
        subject: { select: { id: true, name: true } },
        enrollments: {
          where: { leftAt: null },
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                grade: true,
                phoneE164: true,
                parentName: true,
                parentPhoneE164: true,
                archivedAt: true,
              },
            },
          },
          orderBy: { enrolledAt: "asc" },
        },
        teachingSessions: {
          where: { startsAt: { gte: new Date() }, status: "scheduled" },
          take: 5,
          orderBy: { startsAt: "asc" },
        },
      },
    });

    if (!group) return null;

    return {
      id: group.id,
      name: group.name,
      subjectId: group.subjectId,
      subject: group.subject,
      grade: group.grade,
      room: group.room,
      color: group.color,
      weekday: group.weekday,
      startTime: formatTimeFromDate(group.startTime) ?? "16:00",
      endTime: formatTimeFromDate(group.endTime),
      capacity: group.capacity,
      teacherNote: group.teacherNote,
      archivedAt: group.archivedAt,
      enrollments: group.enrollments,
      upcomingSessions: group.teachingSessions,
    };
  });
}

export async function listGroups(scope: Scope, query: GroupQueryParams): Promise<GroupListItem[]> {
  return withScope(scope, async (tx) => {
    const where: Prisma.GroupWhereInput = {
      workspaceId: scope.workspaceId,
      archivedAt: query.showArchived ? undefined : null,
    };

    if (query.subjectId) {
      where.subjectId = query.subjectId;
    }

    if (query.grade) {
      where.grade = query.grade;
    }

    if (query.weekday !== undefined) {
      where.weekday = query.weekday;
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { room: { contains: term, mode: "insensitive" } },
        { subject: { name: { contains: term, mode: "insensitive" } } },
      ];
    }

    const groups = await tx.group.findMany({
      where,
      include: {
        subject: { select: { id: true, name: true } },
        _count: {
          select: {
            enrollments: {
              where: { leftAt: null },
            },
          },
        },
      },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    });

    return groups.map((g) => {
      return {
        id: g.id,
        name: g.name,
        subject: g.subject,
        grade: g.grade,
        room: g.room,
        color: g.color,
        weekday: g.weekday,
        startTime: formatTimeFromDate(g.startTime) ?? "16:00",
        endTime: formatTimeFromDate(g.endTime),
        capacity: g.capacity,
        teacherNote: g.teacherNote,
        enrolledCount: g._count.enrollments,
        archivedAt: g.archivedAt,
      };
    });
  });
}

export async function findGroupConflicts(
  scope: Scope,
  criteria: {
    weekday: number;
    startTime: string;
    endTime: string | null;
    excludeGroupId?: string;
  },
) {
  return withScope(scope, async (tx) => {
    const groupsOnSameDay = await tx.group.findMany({
      where: {
        workspaceId: scope.workspaceId,
        weekday: criteria.weekday,
        archivedAt: null,
        id: criteria.excludeGroupId ? { not: criteria.excludeGroupId } : undefined,
      },
      select: {
        id: true,
        name: true,
        startTime: true,
        endTime: true,
        room: true,
      },
    });

    const newStart = criteria.startTime;
    const newEnd = criteria.endTime ?? criteria.startTime;

    const conflicts = groupsOnSameDay.filter((other) => {
      const otherStart = formatTimeFromDate(other.startTime) ?? "00:00";
      const otherEnd = formatTimeFromDate(other.endTime) ?? otherStart;

      // Overlap condition: start < otherEnd && end > otherStart
      return newStart < otherEnd && newEnd > otherStart;
    });

    return conflicts.map((c) => ({
      id: c.id,
      name: c.name,
      startTime: formatTimeFromDate(c.startTime) ?? "16:00",
      endTime: formatTimeFromDate(c.endTime),
      room: c.room,
    }));
  });
}

export async function insertGroupTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  data: {
    id: string;
    name: string;
    subjectId?: string | null;
    grade?: string | null;
    room?: string | null;
    color: string;
    weekday: number;
    startTime: string;
    endTime?: string | null;
    capacity?: number | null;
    teacherNote?: string | null;
  },
) {
  const group = await tx.group.create({
    data: {
      id: data.id,
      workspaceId: scope.workspaceId,
      name: data.name,
      subjectId: data.subjectId ?? null,
      grade: data.grade ?? null,
      room: data.room ?? null,
      color: data.color,
      weekday: data.weekday,
      startTime: parseTimeToDate(data.startTime),
      endTime: data.endTime ? parseTimeToDate(data.endTime) : null,
      capacity: data.capacity ?? null,
      teacherNote: data.teacherNote ?? null,
    },
  });

  // Generate sessions for rolling 4-week horizon (F4 AC-5)
  await generateGroupUpcomingSessionsTx(
    tx,
    scope.workspaceId,
    group.id,
    data.weekday,
    data.startTime,
    data.endTime,
    4,
  );

  return group;
}

export async function generateGroupUpcomingSessionsTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  groupId: string,
  targetWeekday: number, // 0 = Saturday, ..., 6 = Friday
  startTimeStr: string,
  endTimeStr: string | null | undefined,
  weeksAhead = 4,
) {
  const now = new Date();
  const [startHour, startMin] = startTimeStr.split(":").map(Number);
  const [endHour, endMin] = endTimeStr ? endTimeStr.split(":").map(Number) : [startHour + 1, startMin];

  // Map 0 = Sat, 1 = Sun, 2 = Mon, 3 = Tue, 4 = Wed, 5 = Thu, 6 = Fri to JS getDay() (0 = Sun, 6 = Sat)
  // JS getDay(): 0:Sun, 1:Mon, 2:Tue, 3:Wed, 4:Thu, 5:Fri, 6:Sat
  const weekdayToJsDay = [6, 0, 1, 2, 3, 4, 5];
  const targetJsDay = weekdayToJsDay[targetWeekday];

  const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  let sessionsCreated = 0;
  for (let dayOffset = 0; dayOffset < 35 && sessionsCreated < weeksAhead; dayOffset++) {
    const candidateDate = new Date(current.getTime() + dayOffset * 86400000);
    if (candidateDate.getUTCDay() === targetJsDay) {
      const startsAt = new Date(candidateDate);
      startsAt.setUTCHours(startHour, startMin, 0, 0);

      const endsAt = new Date(candidateDate);
      endsAt.setUTCHours(endHour, endMin, 0, 0);

      await tx.teachingSession.create({
        data: {
          id: newUuidV7(),
          workspaceId,
          groupId,
          startsAt,
          endsAt,
          status: "scheduled",
        },
      });
      sessionsCreated++;
    }
  }
}

export async function updateGroupTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  groupId: string,
  data: {
    name?: string;
    subjectId?: string | null;
    grade?: string | null;
    room?: string | null;
    color?: string;
    weekday?: number;
    startTime?: string;
    endTime?: string | null;
    capacity?: number | null;
    teacherNote?: string | null;
  },
) {
  return tx.group.update({
    where: {
      id: groupId,
      workspaceId: scope.workspaceId,
    },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.subjectId !== undefined ? { subjectId: data.subjectId } : {}),
      ...(data.grade !== undefined ? { grade: data.grade } : {}),
      ...(data.room !== undefined ? { room: data.room } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
      ...(data.weekday !== undefined ? { weekday: data.weekday } : {}),
      ...(data.startTime !== undefined ? { startTime: parseTimeToDate(data.startTime) } : {}),
      ...(data.endTime !== undefined
        ? { endTime: data.endTime ? parseTimeToDate(data.endTime) : null }
        : {}),
      ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
      ...(data.teacherNote !== undefined ? { teacherNote: data.teacherNote } : {}),
    },
  });
}

export async function archiveGroupTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  groupId: string,
) {
  return tx.group.update({
    where: {
      id: groupId,
      workspaceId: scope.workspaceId,
    },
    data: {
      archivedAt: new Date(),
    },
  });
}

export async function restoreGroupTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  groupId: string,
) {
  return tx.group.update({
    where: {
      id: groupId,
      workspaceId: scope.workspaceId,
    },
    data: {
      archivedAt: null,
    },
  });
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function enrollStudentTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  groupId: string,
  studentId: string,
) {
  const existing = await tx.enrollment.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      groupId,
      studentId,
      leftAt: null,
    },
  });

  if (existing) {
    return existing;
  }

  return tx.enrollment.create({
    data: {
      id: newUuidV7(),
      workspaceId: scope.workspaceId,
      groupId,
      studentId,
    },
  });
}

export async function removeStudentFromGroupTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  groupId: string,
  studentId: string,
) {
  return tx.enrollment.updateMany({
    where: {
      workspaceId: scope.workspaceId,
      groupId,
      studentId,
      leftAt: null,
    },
    data: {
      leftAt: new Date(),
    },
  });
}

export async function transferStudentGroupTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  fromGroupId: string,
  toGroupId: string,
  studentId: string,
) {
  const now = new Date();

  // 1. Mark existing enrollment as left (preserves attendance and grades)
  await tx.enrollment.updateMany({
    where: {
      workspaceId: scope.workspaceId,
      groupId: fromGroupId,
      studentId,
      leftAt: null,
    },
    data: {
      leftAt: now,
    },
  });

  // 2. Create new enrollment in destination group
  const existingInTo = await tx.enrollment.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      groupId: toGroupId,
      studentId,
      leftAt: null,
    },
  });

  if (!existingInTo) {
    return tx.enrollment.create({
      data: {
        id: newUuidV7(),
        workspaceId: scope.workspaceId,
        groupId: toGroupId,
        studentId,
        enrolledAt: now,
      },
    });
  }

  return existingInTo;
}

export async function listSubjects(scope: Scope) {
  return withScope(scope, (tx) =>
    tx.subject.findMany({
      where: { workspaceId: scope.workspaceId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  );
}

export async function findOrCreateSubjectTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  subjectName: string,
) {
  const normalized = subjectName.trim();
  const existing = await tx.subject.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      name: { equals: normalized, mode: "insensitive" },
      archivedAt: null,
    },
  });

  if (existing) return existing;

  return tx.subject.create({
    data: {
      id: newUuidV7(),
      workspaceId: scope.workspaceId,
      name: normalized,
    },
  });
}
