import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import { authorize, type Scope } from "@/modules/tenancy/types";
import { averagePercentage, assessmentTrend, groupScoreSummary } from "./calculations";
import {
  createAssessmentTx,
  findAssessmentTx,
  getAssessmentRoster,
  listActiveGroupStudents,
  listAssessmentRows,
  upsertAssessmentResultTx,
} from "./repository";
import type { AssessmentQuery, CreateAssessmentInput, SetAssessmentResultInput } from "./schemas";

type RequestContext = { requestId?: string; ipHash?: string | null };
function auditContext(value?: RequestContext) {
  return { requestId: value?.requestId ?? newRequestId(), ipHash: value?.ipHash ?? null };
}

export async function listAssessments(scope: Scope, query: AssessmentQuery) {
  authorize(scope, "grades", "read");
  const rows = await listAssessmentRows(scope, query.groupId, query.studentId);
  const assessments = rows.map((assessment) => {
    const maxScore = Number(assessment.maxScore);
    const results = assessment.scores.map((entry) => ({
      status: entry.status,
      score: entry.score === null ? null : Number(entry.score),
      maxScore,
    }));
    return {
      id: assessment.id,
      groupId: assessment.groupId,
      groupName: assessment.group.name,
      title: assessment.title,
      type: assessment.type,
      note: assessment.note,
      date: assessment.date.toISOString().slice(0, 10),
      maxScore,
      extraCreditAllowance:
        assessment.extraCreditAllowance === null ? null : Number(assessment.extraCreditAllowance),
      lockedAt: assessment.lockedAt,
      summary: groupScoreSummary(results),
      scores: assessment.scores.map((entry) => ({
        studentId: entry.studentId,
        score: entry.score === null ? null : Number(entry.score),
        status: entry.status,
        note: entry.note,
      })),
    };
  });
  if (!query.groupId) return { assessments, groupSummary: null };
  const roster = await listActiveGroupStudents(scope, query.groupId);
  const groupSummary = roster.map(({ student, enrolledAt }) => {
    const history = rows.flatMap((assessment) => {
      if (assessment.date < enrolledAt) return [];
      const result = assessment.scores.find(({ studentId }) => studentId === student.id);
      return [
        {
          date: assessment.date.toISOString().slice(0, 10),
          status: result?.status ?? ("missing" as const),
          score: result?.score === null || !result ? null : Number(result.score),
          maxScore: Number(assessment.maxScore),
        },
      ];
    });
    return {
      student,
      averagePercent: averagePercentage(history),
      trend: assessmentTrend(history),
      gradedCount: history.filter((result) => result.status === "graded").length,
    };
  });
  return { assessments, groupSummary };
}

export async function getAssessment(scope: Scope, assessmentId: string) {
  authorize(scope, "grades", "read");
  authorize(scope, "students", "read");
  const data = await getAssessmentRoster(scope, assessmentId);
  if (!data) throw new AppError("NOT_FOUND");
  const maxScore = Number(data.assessment.maxScore);
  const roster = data.roster.map(({ student, result }) => ({
    student,
    result: result
      ? {
          score: result.score === null ? null : Number(result.score),
          status: result.status,
          note: result.note,
          updatedAt: result.updatedAt,
        }
      : { score: null, status: "missing" as const, note: null, updatedAt: null },
  }));
  const summary = groupScoreSummary(roster.map(({ result }) => ({ ...result, maxScore })));
  return {
    id: data.assessment.id,
    groupId: data.assessment.groupId,
    groupName: data.assessment.group.name,
    title: data.assessment.title,
    type: data.assessment.type,
    note: data.assessment.note,
    date: data.assessment.date.toISOString().slice(0, 10),
    maxScore,
    extraCreditAllowance:
      data.assessment.extraCreditAllowance === null
        ? null
        : Number(data.assessment.extraCreditAllowance),
    lockedAt: data.assessment.lockedAt,
    summary,
    roster,
  };
}

export async function createAssessment(
  scope: Scope,
  input: CreateAssessmentInput,
  req?: RequestContext,
) {
  authorize(scope, "grades", "write");
  const ctx = auditContext(req);
  const id = newUuidV7();
  return withScope(scope, async (tx) => {
    const group = await tx.group.findFirst({
      where: { id: input.groupId, workspaceId: scope.workspaceId, archivedAt: null },
      select: { id: true },
    });
    if (!group) throw new AppError("NOT_FOUND");
    const assessment = await createAssessmentTx(tx, scope, id, {
      ...input,
      date: new Date(`${input.date}T00:00:00.000Z`),
      note: input.note ?? null,
      extraCreditAllowance: input.extraCreditAllowance ?? null,
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "assessment",
      entityId: id,
      action: "assessment.created",
      diff: {
        groupId: input.groupId,
        type: input.type,
        maxScore: input.maxScore,
        extraCreditAllowance: input.extraCreditAllowance ?? null,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });
    return assessment;
  });
}

export async function setAssessmentResult(
  scope: Scope,
  assessmentId: string,
  studentId: string,
  input: SetAssessmentResultInput,
  req?: RequestContext,
) {
  authorize(scope, "grades", "write");
  const ctx = auditContext(req);
  return withScope(scope, async (tx) => {
    const assessment = await findAssessmentTx(tx, scope.workspaceId, assessmentId);
    if (!assessment) throw new AppError("NOT_FOUND");
    if (assessment.lockedAt)
      throw new AppError("CONFLICT", { messageKey: "errors.assessmentLocked" });
    const [student, enrollment] = await Promise.all([
      tx.student.findFirst({
        where: { id: studentId, workspaceId: scope.workspaceId, archivedAt: null },
        select: { id: true },
      }),
      tx.enrollment.findFirst({
        where: {
          workspaceId: scope.workspaceId,
          groupId: assessment.groupId,
          studentId,
          leftAt: null,
        },
        select: { id: true },
      }),
    ]);
    if (!student || !enrollment) throw new AppError("NOT_FOUND");

    const score = input.score ?? null;
    const allowedMaximum =
      Number(assessment.maxScore) + Number(assessment.extraCreditAllowance ?? 0);
    if (score !== null && score > allowedMaximum) {
      throw new AppError("VALIDATION_FAILED", {
        fields: { score: ["scoreExceedsMaximum"] },
      });
    }

    const saved = await upsertAssessmentResultTx(tx, scope, assessmentId, studentId, {
      status: input.status,
      score,
      note: input.note ?? null,
    });
    if (saved.changed) {
      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "assessment_score",
        entityId: saved.result.id,
        action: saved.previous ? "assessment.score_changed" : "assessment.score_set",
        diff: {
          oldScore: saved.previous?.score?.toString() ?? null,
          newScore: saved.result.score?.toString() ?? null,
          oldStatus: saved.previous?.status ?? null,
          newStatus: saved.result.status,
          scoreChanged:
            (saved.previous?.score?.toString() ?? null) !==
            (saved.result.score?.toString() ?? null),
          noteChanged: saved.previous?.note !== saved.result.note,
        },
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
      });
    }
    return {
      id: saved.result.id,
      studentId,
      status: saved.result.status,
      score: saved.result.score === null ? null : Number(saved.result.score),
      note: saved.result.note,
      changed: saved.changed,
    };
  });
}

export async function setAssessmentLock(
  scope: Scope,
  assessmentId: string,
  action: "lock" | "unlock",
  reason?: string,
  req?: RequestContext,
) {
  authorize(scope, "grades", "write");
  const ctx = auditContext(req);
  return withScope(scope, async (tx) => {
    const assessment = await findAssessmentTx(tx, scope.workspaceId, assessmentId);
    if (!assessment) throw new AppError("NOT_FOUND");
    if (
      (action === "lock" && assessment.lockedAt) ||
      (action === "unlock" && !assessment.lockedAt)
    ) {
      return assessment;
    }
    const updated = await tx.assessment.update({
      where: { id: assessmentId, workspaceId: scope.workspaceId },
      data:
        action === "lock"
          ? { lockedAt: new Date(), unlockReason: null }
          : { lockedAt: null, unlockReason: reason },
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "assessment",
      entityId: assessmentId,
      action: action === "lock" ? "assessment.locked" : "assessment.unlocked",
      diff: action === "unlock" ? { reason } : undefined,
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });
    return updated;
  });
}

export async function studentAssessmentHistory(scope: Scope, studentId: string) {
  authorize(scope, "grades", "read");
  authorize(scope, "students", "read");
  const [student, rows] = await withScope(scope, async (tx) => {
    const student = await tx.student.findFirst({
      where: { id: studentId, workspaceId: scope.workspaceId },
      select: { id: true },
    });
    if (!student) return [null, []] as const;
    const rows = await tx.assessment.findMany({
      where: {
        workspaceId: scope.workspaceId,
        group: { enrollments: { some: { studentId, workspaceId: scope.workspaceId } } },
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            enrollments: {
              where: { studentId, workspaceId: scope.workspaceId },
              select: { enrolledAt: true, leftAt: true },
            },
          },
        },
        scores: { where: { studentId } },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    return [student, rows] as const;
  });
  if (!student) throw new AppError("NOT_FOUND");
  const history = rows.flatMap((row) => {
    const result = row.scores[0];
    const enrolledOnDate = row.group.enrollments.some(
      (enrollment) =>
        enrollment.enrolledAt <= row.date &&
        (enrollment.leftAt === null || enrollment.leftAt >= row.date),
    );
    if (!enrolledOnDate) return [];
    return [
      {
        assessmentId: row.id,
        title: row.title,
        date: row.date.toISOString().slice(0, 10),
        group: row.group,
        maxScore: Number(row.maxScore),
        score: result?.score === null || !result ? null : Number(result.score),
        status: result?.status ?? "missing",
        percentage:
          result?.status === "graded" && result.score !== null
            ? (Number(result.score) / Number(row.maxScore)) * 100
            : null,
        note: result?.note ?? null,
      },
    ];
  });
  return {
    history,
    averagePercent: averagePercentage(history),
    trend: assessmentTrend(history),
  };
}

export function studentAssessmentSummary(
  history: ReadonlyArray<{
    date: string;
    score: number | null;
    maxScore: number;
    status: "graded" | "missing" | "excused" | "not_taken";
  }>,
) {
  return {
    averagePercent: averagePercentage(history),
    trend: assessmentTrend(history),
  };
}
