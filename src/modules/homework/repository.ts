import { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";
import type { CreateHomeworkInput, HomeworkQuery } from "./schemas";

export function toHomeworkDecimal(value: number) {
  return new Prisma.Decimal(value);
}

export async function listHomeworkRows(scope: Scope, query: HomeworkQuery) {
  return withScope(scope, (tx) =>
    tx.homework.findMany({
      where: {
        workspaceId: scope.workspaceId,
        status: query.showArchived ? "archived" : "active",
        submissions: query.studentId ? { some: { studentId: query.studentId } } : undefined,
      },
      include: {
        group: { select: { id: true, name: true } },
        resources: {
          include: { file: { select: { id: true, title: true, mime: true } } },
        },
        submissions: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                archivedAt: true,
                enrollments: {
                  where: { leftAt: null },
                  select: { groupId: true },
                },
              },
            },
          },
          orderBy: [{ student: { firstName: "asc" } }, { student: { lastName: "asc" } }],
        },
      },
      orderBy: [{ dueAt: "desc" }, { createdAt: "desc" }],
    }),
  );
}

export async function findHomeworkTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  id: string,
) {
  return tx.homework.findFirst({ where: { id, workspaceId } });
}

export async function createHomeworkTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  id: string,
  input: CreateHomeworkInput,
  studentIds: string[],
) {
  const homework = await tx.homework.create({
    data: {
      id,
      workspaceId: scope.workspaceId,
      groupId: input.groupId ?? null,
      title: input.title,
      instructions: input.instructions ?? null,
      dueAt: new Date(input.dueAt),
      maxScore: input.maxScore == null ? null : new Prisma.Decimal(input.maxScore),
      createdBy: scope.actorUserId,
    },
  });
  if (studentIds.length > 0) {
    await tx.homeworkSubmission.createMany({
      data: studentIds.map((studentId) => ({
        id: crypto.randomUUID(),
        workspaceId: scope.workspaceId,
        homeworkId: id,
        studentId,
        updatedBy: scope.actorUserId,
      })),
    });
  }
  if (input.resourceFileIds.length > 0) {
    await tx.homeworkResource.createMany({
      data: input.resourceFileIds.map((fileId) => ({
        workspaceId: scope.workspaceId,
        homeworkId: id,
        fileId,
      })),
    });
  }
  return homework;
}

export async function ensureGroupHomeworkSubmissionsTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  groupId: string,
  studentId: string,
  actorUserId: string,
) {
  const groupHomework = await tx.homework.findMany({
    where: { workspaceId, groupId, status: "active" },
    select: { id: true },
  });
  if (groupHomework.length === 0) return [];
  const existing = await tx.homeworkSubmission.findMany({
    where: {
      workspaceId,
      studentId,
      homeworkId: { in: groupHomework.map(({ id }) => id) },
    },
    select: { homeworkId: true },
  });
  const existingIds = new Set(existing.map(({ homeworkId }) => homeworkId));
  const missing = groupHomework.filter(({ id }) => !existingIds.has(id));
  if (missing.length === 0) return [];
  await tx.homeworkSubmission.createMany({
    data: missing.map(({ id }) => ({
      id: crypto.randomUUID(),
      workspaceId,
      homeworkId: id,
      studentId,
      updatedBy: actorUserId,
    })),
  });
  return missing.map(({ id }) => id);
}

export async function getHomeworkCompletionRosterTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  homeworkId: string,
  sessionId?: string | null,
) {
  const homework = await tx.homework.findFirst({
    where: { id: homeworkId, workspaceId },
    include: { group: { select: { id: true, name: true } } },
  });
  if (!homework) return null;

  // Determine which students belong to this roster
  let students: Array<{ id: string; firstName: string; lastName: string }> = [];

  if (sessionId) {
    // 1. Session attendance marks (including cross-season students!)
    const marks = await tx.attendanceMark.findMany({
      where: { workspaceId, sessionId },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (marks.length > 0) {
      students = marks.map((m) => m.student);
    } else {
      // If attendance not taken yet, fall back to session's group enrollments
      const session = await tx.teachingSession.findFirst({
        where: { id: sessionId, workspaceId },
        select: { groupId: true },
      });
      if (session) {
        const enrollments = await tx.enrollment.findMany({
          where: { workspaceId, groupId: session.groupId, leftAt: null },
          include: { student: { select: { id: true, firstName: true, lastName: true } } },
        });
        students = enrollments.map((e) => e.student);
      }
    }
  } else if (homework.groupId) {
    const enrollments = await tx.enrollment.findMany({
      where: { workspaceId, groupId: homework.groupId, leftAt: null },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
    });
    students = enrollments.map((e) => e.student);
  }

  // Fetch completion marks
  const completionMarks = await tx.homeworkCompletionMark.findMany({
    where: { workspaceId, homeworkId },
  });
  const markByStudentId = new Map(completionMarks.map((m) => [m.studentId, m]));

  const roster = students.map((s) => {
    const m = markByStudentId.get(s.id);
    return {
      studentId: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      status: (m?.status ?? "not_completed") as "completed" | "not_completed" | "not_applicable",
      note: m?.note ?? null,
      recordedBy: m?.recordedBy ?? null,
      recordedAt: m?.updatedAt ?? null,
    };
  });

  return {
    homework,
    roster,
  };
}

export async function upsertHomeworkCompletionMarksTx(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    homeworkId: string;
    sessionId?: string | null;
    marks: Array<{
      studentId: string;
      status: "completed" | "not_completed" | "not_applicable";
      note?: string | null;
    }>;
    recordedBy: string;
  },
) {
  const results = [];
  for (const m of input.marks) {
    const record = await tx.homeworkCompletionMark.upsert({
      where: {
        homeworkId_studentId: {
          homeworkId: input.homeworkId,
          studentId: m.studentId,
        },
      },
      update: {
        status: m.status,
        note: m.note ?? null,
        sessionId: input.sessionId ?? null,
        recordedBy: input.recordedBy,
        updatedAt: new Date(),
      },
      create: {
        workspaceId: input.workspaceId,
        homeworkId: input.homeworkId,
        studentId: m.studentId,
        sessionId: input.sessionId ?? null,
        status: m.status,
        note: m.note ?? null,
        recordedBy: input.recordedBy,
      },
    });
    results.push(record);
  }
  return results;
}
