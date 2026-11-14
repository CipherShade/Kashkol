import type { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";
import type { StudentQueryParams } from "./schemas";

export type StudentDerivedStatus = "active" | "at_risk" | "inactive" | "archived";

export type StudentListItem = {
  id: string;
  firstName: string;
  lastName: string;
  grade: string | null;
  phoneE164: string | null;
  parentName: string | null;
  parentPhoneE164: string | null;
  joinedAt: Date;
  archivedAt: Date | null;
  groups: Array<{
    id: string;
    name: string;
    color: string;
    grade: string | null;
  }>;
  attendanceRate: number | null;
  quizAverage: number | null;
  consecutiveAbsences: number;
  status: StudentDerivedStatus;
};

export async function findStudentById(scope: Scope, studentId: string) {
  return withScope(scope, (tx) =>
    tx.student.findFirst({
      where: {
        id: studentId,
        workspaceId: scope.workspaceId,
      },
      include: {
        enrollments: {
          where: { leftAt: null },
          include: {
            group: {
              select: {
                id: true,
                name: true,
                color: true,
                grade: true,
                scheduleSlots: {
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
          },
        },
      },
    }),
  );
}

export async function countStudentLinkedRecords(scope: Scope, studentId: string) {
  return withScope(scope, async (tx) => {
    const [attendanceCount, assessmentCount, paymentCount] = await Promise.all([
      tx.attendanceMark.count({ where: { workspaceId: scope.workspaceId, studentId } }),
      tx.assessmentScore.count({ where: { workspaceId: scope.workspaceId, studentId } }),
      tx.payment.count({ where: { workspaceId: scope.workspaceId, studentId } }),
    ]);
    return {
      attendanceCount,
      assessmentCount,
      paymentCount,
      totalLinked: attendanceCount + assessmentCount + paymentCount,
    };
  });
}

export async function findStudentProfile(
  scope: Scope,
  studentId: string,
) {
  return withScope(scope, async (tx) => {
    const [student, settings, attendanceMarks, assessmentScores, enrollments, files, notes] =
      await Promise.all([
        tx.student.findFirst({
          where: { id: studentId, workspaceId: scope.workspaceId },
        }),
        tx.workspaceSettings.findUnique({
          where: { workspaceId: scope.workspaceId },
          select: { atRiskAfter: true, inactiveAfter: true, currency: true },
        }),
        tx.attendanceMark.findMany({
          where: { workspaceId: scope.workspaceId, studentId },
          include: {
            session: {
              select: {
                id: true,
                startsAt: true,
                endsAt: true,
                status: true,
                gradeLabel: true,
                group: { select: { id: true, name: true, color: true } },
              },
            },
            revisions: {
              orderBy: { createdAt: "desc" },
              select: { id: true, oldMark: true, newMark: true, reason: true, createdAt: true },
            },
          },
          orderBy: { session: { startsAt: "desc" } },
        }),
        tx.assessmentScore.findMany({
          where: { workspaceId: scope.workspaceId, studentId },
          include: {
            assessment: {
              select: {
                id: true,
                title: true,
                date: true,
                maxScore: true,
                group: { select: { id: true, name: true, color: true } },
              },
            },
          },
          orderBy: { assessment: { date: "desc" } },
        }),
        tx.enrollment.findMany({
          where: { workspaceId: scope.workspaceId, studentId },
          include: {
            group: {
              select: {
                id: true,
                name: true,
                color: true,
                grade: true,
                scheduleSlots: {
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
          },
          orderBy: { enrolledAt: "desc" },
        }),
        tx.file.findMany({
          where: { workspaceId: scope.workspaceId, studentId, deletedAt: null },
          orderBy: { createdAt: "desc" },
        }),
        tx.studentNote.findMany({
          where: { workspaceId: scope.workspaceId, studentId },
          orderBy: { createdAt: "desc" },
          select: { id: true, body: true, authorId: true, createdAt: true },
        }),
      ]);

    if (!student) return null;

    const atRiskThreshold = settings?.atRiskAfter ?? 2;
    const inactiveThreshold = settings?.inactiveAfter ?? 4;

    // Compute metrics
    let totalEligibleAttendance = 0;
    let attendedCount = 0;
    let consecutiveAbsences = 0;
    let streakBroken = false;

    for (const mark of attendanceMarks) {
      if (mark.session.status === "cancelled") continue;
      if (mark.mark !== "excused") {
        totalEligibleAttendance++;
        if (mark.mark === "present" || mark.mark === "late") {
          attendedCount++;
        }
      }
      if (!streakBroken) {
        if (mark.mark === "absent") {
          consecutiveAbsences++;
        } else {
          streakBroken = true;
        }
      }
    }

    const attendanceRate =
      totalEligibleAttendance > 0 ? Math.round((attendedCount / totalEligibleAttendance) * 100) : null;

    let totalScoreSum = 0;
    let scoredCount = 0;
    for (const score of assessmentScores) {
      if (score.score !== null) {
        const max = Number(score.assessment.maxScore);
        const actual = Number(score.score);
        if (max > 0) {
          totalScoreSum += (actual / max) * 100;
          scoredCount++;
        }
      }
    }

    const quizAverage = scoredCount > 0 ? Math.round(totalScoreSum / scoredCount) : null;

    let status: StudentDerivedStatus = "active";
    if (student.archivedAt) {
      status = "archived";
    } else if (consecutiveAbsences >= inactiveThreshold) {
      status = "inactive";
    } else if (consecutiveAbsences >= atRiskThreshold) {
      status = "at_risk";
    }

    return {
      student,
      status,
      attendanceRate,
      quizAverage,
      consecutiveAbsences,
      currency: settings?.currency ?? "EGP",
      currentEnrollments: enrollments.filter((e) => !e.leftAt),
      pastEnrollments: enrollments.filter((e) => !!e.leftAt),
      attendanceMarks,
      assessmentScores,
      files,
      notes,
    };
  });
}

export async function findDuplicateStudents(
  scope: Scope,
  criteria: {
    phoneE164?: string | null;
    parentPhoneE164?: string | null;
    firstName: string;
    lastName: string;
    excludeId?: string;
  },
) {
  return withScope(scope, async (tx) => {
    const conditions: Prisma.StudentWhereInput[] = [];

    if (criteria.phoneE164) {
      conditions.push({ phoneE164: criteria.phoneE164 });
    }
    if (criteria.parentPhoneE164) {
      conditions.push({ parentPhoneE164: criteria.parentPhoneE164 });
    }

    // Name match (case-insensitive)
    conditions.push({
      AND: [
        { firstName: { equals: criteria.firstName, mode: "insensitive" } },
        { lastName: { equals: criteria.lastName, mode: "insensitive" } },
      ],
    });

    return tx.student.findMany({
      where: {
        workspaceId: scope.workspaceId,
        id: criteria.excludeId ? { not: criteria.excludeId } : undefined,
        OR: conditions,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phoneE164: true,
        parentPhoneE164: true,
        grade: true,
        archivedAt: true,
      },
    });
  });
}

export async function listStudents(scope: Scope, query: StudentQueryParams) {
  return withScope(scope, async (tx) => {
    const settings = await tx.workspaceSettings.findUnique({
      where: { workspaceId: scope.workspaceId },
      select: { atRiskAfter: true, inactiveAfter: true },
    });
    const atRiskThreshold = settings?.atRiskAfter ?? 2;
    const inactiveThreshold = settings?.inactiveAfter ?? 4;

    const where: Prisma.StudentWhereInput = {
      workspaceId: scope.workspaceId,
      archivedAt: query.showArchived || query.status === "archived" ? undefined : null,
    };

    if (query.status === "archived") {
      where.archivedAt = { not: null };
    }

    if (query.grade) {
      where.grade = query.grade;
    }

    if (query.groupId) {
      where.enrollments = {
        some: {
          groupId: query.groupId,
          leftAt: null,
        },
      };
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        { phoneE164: { contains: term } },
        { parentPhoneE164: { contains: term } },
        { parentName: { contains: term, mode: "insensitive" } },
      ];
    }

    const students = await tx.student.findMany({
      where,
      include: {
        enrollments: {
          where: { leftAt: null },
          include: {
            group: {
              select: {
                id: true,
                name: true,
                color: true,
                grade: true,
              },
            },
          },
        },
        attendanceMarks: {
          select: {
            mark: true,
            session: { select: { startsAt: true, status: true } },
          },
          orderBy: { session: { startsAt: "desc" } },
        },
        assessmentScores: {
          select: {
            score: true,
            assessment: { select: { maxScore: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const items: StudentListItem[] = students.map((s) => {
      // Calculate attendance rate
      let eligible = 0;
      let present = 0;
      let streak = 0;
      let broken = false;

      for (const a of s.attendanceMarks) {
        if (a.session.status === "cancelled") continue;
        if (a.mark !== "excused") {
          eligible++;
          if (a.mark === "present" || a.mark === "late") present++;
        }
        if (!broken) {
          if (a.mark === "absent") streak++;
          else broken = true;
        }
      }

      const attendanceRate = eligible > 0 ? Math.round((present / eligible) * 100) : null;

      // Calculate quiz average
      let totalQuizPct = 0;
      let quizCount = 0;
      for (const sc of s.assessmentScores) {
        if (sc.score !== null) {
          const max = Number(sc.assessment.maxScore);
          const val = Number(sc.score);
          if (max > 0) {
            totalQuizPct += (val / max) * 100;
            quizCount++;
          }
        }
      }
      const quizAverage = quizCount > 0 ? Math.round(totalQuizPct / quizCount) : null;

      let status: StudentDerivedStatus = "active";
      if (s.archivedAt) {
        status = "archived";
      } else if (streak >= inactiveThreshold) {
        status = "inactive";
      } else if (streak >= atRiskThreshold) {
        status = "at_risk";
      }

      return {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        grade: s.grade,
        phoneE164: s.phoneE164,
        parentName: s.parentName,
        parentPhoneE164: s.parentPhoneE164,
        joinedAt: s.joinedAt,
        archivedAt: s.archivedAt,
        groups: s.enrollments.map((e) => e.group),
        attendanceRate,
        quizAverage,
        consecutiveAbsences: streak,
        status,
      };
    });

    // Filter by status if requested
    let filtered = items;
    if (query.status && query.status !== "all") {
      filtered = items.filter((item) => item.status === query.status);
    }

    // Sort
    filtered.sort((a, b) => {
      let cmp = 0;
      if (query.sortBy === "name") {
        cmp = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      } else if (query.sortBy === "joinedAt") {
        cmp = a.joinedAt.getTime() - b.joinedAt.getTime();
      } else if (query.sortBy === "attendanceRate") {
        cmp = (a.attendanceRate ?? -1) - (b.attendanceRate ?? -1);
      } else if (query.sortBy === "quizAverage") {
        cmp = (a.quizAverage ?? -1) - (b.quizAverage ?? -1);
      }
      return query.sortOrder === "desc" ? -cmp : cmp;
    });

    const total = filtered.length;
    const page = query.page;
    const pageSize = query.pageSize;
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

    // Summary counts
    const summary = {
      total: items.length,
      active: items.filter((i) => i.status === "active").length,
      atRisk: items.filter((i) => i.status === "at_risk").length,
      inactive: items.filter((i) => i.status === "inactive").length,
      archived: items.filter((i) => i.status === "archived").length,
    };

    return {
      items: paginated,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
      summary,
    };
  });
}

export async function insertStudentTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  data: {
    id: string;
    firstName: string;
    lastName: string;
    grade?: string | null;
    phoneE164?: string | null;
    parentName?: string | null;
    parentPhoneE164?: string | null;
  },
) {
  return tx.student.create({
    data: {
      id: data.id,
      workspaceId: scope.workspaceId,
      firstName: data.firstName,
      lastName: data.lastName,
      grade: data.grade ?? null,
      phoneE164: data.phoneE164 ?? null,
      parentName: data.parentName ?? null,
      parentPhoneE164: data.parentPhoneE164 ?? null,
    },
  });
}

export async function updateStudentTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  studentId: string,
  data: {
    firstName?: string;
    lastName?: string;
    grade?: string | null;
    phoneE164?: string | null;
    parentName?: string | null;
    parentPhoneE164?: string | null;
  },
) {
  return tx.student.update({
    where: {
      id: studentId,
      workspaceId: scope.workspaceId,
    },
    data: {
      ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
      ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
      ...(data.grade !== undefined ? { grade: data.grade } : {}),
      ...(data.phoneE164 !== undefined ? { phoneE164: data.phoneE164 } : {}),
      ...(data.parentName !== undefined ? { parentName: data.parentName } : {}),
      ...(data.parentPhoneE164 !== undefined ? { parentPhoneE164: data.parentPhoneE164 } : {}),
    },
  });
}

export async function archiveStudentTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  studentId: string,
) {
  const now = new Date();
  // Close active enrollments so student leaves future session rosters
  await tx.enrollment.updateMany({
    where: {
      workspaceId: scope.workspaceId,
      studentId,
      leftAt: null,
    },
    data: { leftAt: now },
  });

  return tx.student.update({
    where: {
      id: studentId,
      workspaceId: scope.workspaceId,
    },
    data: {
      archivedAt: now,
    },
  });
}

export async function restoreStudentTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  studentId: string,
) {
  return tx.student.update({
    where: {
      id: studentId,
      workspaceId: scope.workspaceId,
    },
    data: {
      archivedAt: null,
    },
  });
}

export async function deleteStudentTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  studentId: string,
) {
  await tx.enrollment.deleteMany({
    where: { workspaceId: scope.workspaceId, studentId },
  });
  return tx.student.delete({
    where: {
      id: studentId,
      workspaceId: scope.workspaceId,
    },
  });
}

export async function syncStudentEnrollmentsTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  studentId: string,
  targetGroupIds: string[],
) {
  const existing = await tx.enrollment.findMany({
    where: { workspaceId: scope.workspaceId, studentId, leftAt: null },
  });

  const existingGroupIds = new Set(existing.map((e) => e.groupId));
  const desiredGroupIds = new Set(targetGroupIds);

  // Close enrollments that were removed
  for (const enr of existing) {
    if (!desiredGroupIds.has(enr.groupId)) {
      await tx.enrollment.update({
        where: { id: enr.id },
        data: { leftAt: new Date() },
      });
    }
  }

  // Add new enrollments
  for (const gid of targetGroupIds) {
    if (!existingGroupIds.has(gid)) {
      await tx.enrollment.create({
        data: {
          workspaceId: scope.workspaceId,
          studentId,
          groupId: gid,
        },
      });
    }
  }
}

export async function insertStudentNoteTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  data: { id: string; studentId: string; body: string; authorId: string },
) {
  return tx.studentNote.create({
    data: {
      id: data.id,
      workspaceId: scope.workspaceId,
      studentId: data.studentId,
      body: data.body,
      authorId: data.authorId,
    },
    select: { id: true, body: true, authorId: true, createdAt: true },
  });
}
