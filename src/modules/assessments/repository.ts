import { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";

export async function listAssessmentRows(scope: Scope, groupId?: string, studentId?: string) {
  return withScope(scope, async (tx) => {
    return tx.assessment.findMany({
      where: {
        workspaceId: scope.workspaceId,
        groupId,
        scores: studentId ? { some: { studentId } } : undefined,
      },
      include: {
        group: { select: { id: true, name: true } },
        scores: studentId ? { where: { studentId } } : true,
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
  });
}

export async function listActiveGroupStudents(scope: Scope, groupId: string) {
  return withScope(scope, (tx) =>
    tx.enrollment.findMany({
      where: {
        workspaceId: scope.workspaceId,
        groupId,
        leftAt: null,
        student: { archivedAt: null },
      },
      select: {
        enrolledAt: true,
        student: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ student: { firstName: "asc" } }, { student: { lastName: "asc" } }],
    }),
  );
}

export async function getAssessmentRoster(scope: Scope, assessmentId: string) {
  return withScope(scope, async (tx) => {
    const assessment = await tx.assessment.findFirst({
      where: { id: assessmentId, workspaceId: scope.workspaceId },
      include: {
        group: {
          include: {
            enrollments: {
              where: { leftAt: null, student: { archivedAt: null } },
              include: { student: { select: { id: true, firstName: true, lastName: true } } },
              orderBy: [{ student: { firstName: "asc" } }, { student: { lastName: "asc" } }],
            },
          },
        },
        scores: true,
      },
    });
    if (!assessment) return null;

    const scores = new Map(assessment.scores.map((entry) => [entry.studentId, entry]));
    return {
      assessment,
      roster: assessment.group.enrollments.map(({ student }) => ({
        student,
        result: scores.get(student.id) ?? null,
      })),
    };
  });
}

export async function findAssessmentTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  assessmentId: string,
) {
  return tx.assessment.findFirst({ where: { id: assessmentId, workspaceId } });
}

export async function createAssessmentTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  id: string,
  input: {
    groupId: string;
    title: string;
    type: "paper_exam" | "quiz" | "test" | "other";
    date: Date;
    note: string | null;
    maxScore: number;
    extraCreditAllowance: number | null;
  },
) {
  return tx.assessment.create({
    data: {
      id,
      workspaceId: scope.workspaceId,
      groupId: input.groupId,
      title: input.title,
      type: input.type,
      date: input.date,
      note: input.note,
      maxScore: new Prisma.Decimal(input.maxScore),
      extraCreditAllowance:
        input.extraCreditAllowance === null ? null : new Prisma.Decimal(input.extraCreditAllowance),
    },
  });
}

export async function upsertAssessmentResultTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  assessmentId: string,
  studentId: string,
  input: {
    status: "graded" | "missing" | "excused" | "not_taken";
    score: number | null;
    note: string | null;
  },
) {
  const existing = await tx.assessmentScore.findFirst({
    where: { workspaceId: scope.workspaceId, assessmentId, studentId },
  });
  const data = {
    status: input.status,
    score: input.score === null ? null : new Prisma.Decimal(input.score),
    note: input.note,
    updatedBy: scope.actorUserId,
  };
  if (existing) {
    if (
      existing.status === input.status &&
      (existing.score?.toString() ?? null) === (input.score?.toString() ?? null) &&
      existing.note === input.note
    ) {
      return { result: existing, previous: existing, changed: false };
    }
    return {
      result: await tx.assessmentScore.update({ where: { id: existing.id }, data }),
      previous: existing,
      changed: true,
    };
  }
  return {
    result: await tx.assessmentScore.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId: scope.workspaceId,
        assessmentId,
        studentId,
        ...data,
      },
    }),
    previous: null,
    changed: true,
  };
}
