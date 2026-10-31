import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import {
  resolvePortalStudent,
  type PortalContext,
} from "@/modules/identity/session";
import { resolvePortalPermissions } from "@/modules/portals/tokens";
import { authorize, type Scope } from "@/modules/tenancy/types";
import {
  canStudentSeeExamResults,
  evaluateExamResponses,
  type QuestionOption,
} from "./grading";
import {
  findOnlineExamDetail,
  findStudentAssignedExamTx,
  listOnlineExamRows,
  listStudentAssignedOnlineExams,
} from "./repository";
import type {
  CreateOnlineExamInput,
  ExamQuestionInput,
  ExamsQuery,
  GradeExamAttemptInput,
  SaveStudentExamResponsesInput,
  UpdateOnlineExamActionInput,
} from "./schemas";

const SUBMISSION_GRACE_MS = 30_000; // 30s network grace for attempts started before deadline

export const EXAM_HONESTY_BOUNDARY_KEY = "Academics.onlineExams.honestyBoundaryNotice";

type RequestContext = { requestId?: string; ipHash?: string | null };
const contextId = (request?: RequestContext) => request?.requestId ?? newRequestId();

function serializeQuestionOptions(question: ExamQuestionInput): QuestionOption[] {
  if (question.questionType === "mcq_single") {
    return question.options
      .map((opt) => ({ id: opt.id.trim(), text: opt.text.trim() }))
      .filter((opt) => opt.id.length > 0 && opt.text.length > 0);
  }
  if (question.questionType === "true_false") {
    return [
      { id: "true", text: "True" },
      { id: "false", text: "False" },
    ];
  }
  return [];
}

function serializeCorrectAnswer(question: ExamQuestionInput) {
  if (question.questionType === "mcq_single") {
    return { kind: "mcq_single", optionId: question.correctOptionId ?? "" };
  }
  if (question.questionType === "true_false") {
    return { kind: "true_false", value: Boolean(question.correctBoolean) };
  }
  if (question.questionType === "short_answer" && question.autoGradable) {
    return {
      kind: "short_answer",
      acceptedAnswers: question.acceptedAnswers.map((a) => a.trim()).filter(Boolean),
      caseSensitive: question.caseSensitive,
    };
  }
  return { kind: "manual" };
}

export async function listOnlineExams(scope: Scope, query: ExamsQuery) {
  authorize(scope, "grades", "read");
  const rows = await listOnlineExamRows(scope, query);
  return rows.map((exam) => {
    const maxScore = Number(exam.maxScore);
    const submittedAttempts = exam.attempts.filter((a) => a.status !== "in_progress");
    const gradedAttempts = exam.attempts.filter(
      (a) => a.status === "graded" && a.totalScore !== null,
    );
    const averageScore =
      gradedAttempts.length > 0
        ? Math.round(
            (gradedAttempts.reduce((acc, a) => acc + Number(a.totalScore ?? 0), 0) /
              gradedAttempts.length) *
              100,
          ) / 100
        : null;

    return {
      id: exam.id,
      groupId: exam.groupId,
      groupName: exam.group.name,
      assessmentId: exam.assessmentId,
      title: exam.title,
      description: exam.description,
      instructions: exam.instructions,
      assignmentScope: exam.assignmentScope,
      status: exam.status,
      availableFrom: exam.availableFrom.toISOString(),
      availableUntil: exam.availableUntil.toISOString(),
      durationMinutes: exam.durationMinutes,
      maxAttempts: exam.maxAttempts,
      resultVisibility: exam.resultVisibility,
      resultsPublishedAt: exam.resultsPublishedAt?.toISOString() ?? null,
      maxScore,
      questionCount: exam.questions.length,
      assignedStudents: exam.studentAssignments.map(({ student }) => ({
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
      })),
      summary: {
        totalAttempts: exam.attempts.length,
        submittedCount: submittedAttempts.length,
        manualPendingCount: exam.attempts.filter((a) => a.status === "manual_pending").length,
        gradedCount: gradedAttempts.length,
        averageScore,
      },
      questions: exam.questions.map((q) => ({
        id: q.id,
        orderIndex: q.orderIndex,
        questionType: q.questionType,
        prompt: q.prompt,
        options: (q.optionsJson as QuestionOption[]) ?? [],
        correctAnswer: q.correctAnswerJson,
        explanation: q.explanation,
        points: Number(q.points),
        autoGradable: q.autoGradable,
      })),
      attempts: exam.attempts.map((a) => ({
        id: a.id,
        studentId: a.studentId,
        studentName: `${a.student.firstName} ${a.student.lastName}`,
        attemptNumber: a.attemptNumber,
        status: a.status,
        startedAt: a.startedAt.toISOString(),
        deadlineAt: a.deadlineAt.toISOString(),
        submittedAt: a.submittedAt?.toISOString() ?? null,
        autoScore: Number(a.autoScore),
        manualScore: a.manualScore !== null ? Number(a.manualScore) : null,
        totalScore: a.totalScore !== null ? Number(a.totalScore) : null,
        gradedAt: a.gradedAt?.toISOString() ?? null,
        gradingNote: a.gradingNote,
        responses: a.responses.map((r) => ({
          id: r.id,
          questionId: r.questionId,
          answer: r.answerJson,
          isCorrect: r.isCorrect,
          autoAwardedPoints:
            r.autoAwardedPoints !== null ? Number(r.autoAwardedPoints) : null,
          manualAwardedPoints:
            r.manualAwardedPoints !== null ? Number(r.manualAwardedPoints) : null,
          teacherFeedback: r.teacherFeedback,
          savedAt: r.savedAt.toISOString(),
        })),
      })),
    };
  });
}

export async function createOnlineExam(
  scope: Scope,
  input: CreateOnlineExamInput,
  request?: RequestContext,
) {
  authorize(scope, "grades", "write");
  if (input.assignmentScope === "selected_students") {
    authorize(scope, "students", "read");
  }

  const examId = newUuidV7();
  const assessmentId = newUuidV7();
  const availableFrom = new Date(input.availableFrom);
  const availableUntil = new Date(input.availableUntil);
  const maxScore =
    Math.round(
      input.questions.reduce((acc, q) => acc + Math.max(0, Number(q.points)), 0) * 100,
    ) / 100;

  return withScope(scope, async (tx) => {
    const group = await tx.group.findFirst({
      where: {
        id: input.groupId,
        workspaceId: scope.workspaceId,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!group) throw new AppError("NOT_FOUND");

    if (input.assignmentScope === "selected_students" && input.studentIds.length > 0) {
      const count = await tx.student.count({
        where: {
          workspaceId: scope.workspaceId,
          id: { in: input.studentIds },
          archivedAt: null,
        },
      });
      if (count !== input.studentIds.length) throw new AppError("NOT_FOUND");
    }

    // Create a linked canonical Assessment record so gradebook & portals integrate seamlessly
    await tx.assessment.create({
      data: {
        id: assessmentId,
        workspaceId: scope.workspaceId,
        groupId: input.groupId,
        title: input.title,
        type: "quiz",
        note: input.description ?? null,
        date: new Date(availableFrom.toISOString().slice(0, 10) + "T00:00:00.000Z"),
        maxScore,
        lockedAt: null,
      },
    });

    const created = await tx.onlineExam.create({
      data: {
        id: examId,
        workspaceId: scope.workspaceId,
        groupId: input.groupId,
        assessmentId,
        title: input.title,
        description: input.description ?? null,
        instructions: input.instructions ?? null,
        assignmentScope: input.assignmentScope,
        status: "draft",
        availableFrom,
        availableUntil,
        durationMinutes: input.durationMinutes,
        maxAttempts: input.maxAttempts,
        resultVisibility: input.resultVisibility,
        maxScore,
        createdByUserId: scope.actorUserId,
        studentAssignments:
          input.assignmentScope === "selected_students"
            ? {
                createMany: {
                  data: input.studentIds.map((studentId) => ({
                    workspaceId: scope.workspaceId,
                    studentId,
                  })),
                },
              }
            : undefined,
        questions: {
          create: input.questions.map((question, index) => ({
            id: newUuidV7(),
            workspaceId: scope.workspaceId,
            orderIndex: index + 1,
            questionType: question.questionType,
            prompt: question.prompt,
            optionsJson: serializeQuestionOptions(question),
            correctAnswerJson: serializeCorrectAnswer(question),
            explanation: question.explanation ?? null,
            points: question.points,
            autoGradable:
              question.questionType === "essay" ? false : question.autoGradable,
          })),
        },
      },
      select: {
        id: true,
        assessmentId: true,
        title: true,
        status: true,
        maxScore: true,
      },
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "online_exam",
      entityId: examId,
      action: "exam.created",
      diff: {
        groupId: input.groupId,
        assignmentScope: input.assignmentScope,
        questionCount: input.questions.length,
        maxScore,
        durationMinutes: input.durationMinutes,
        maxAttempts: input.maxAttempts,
      },
      requestId: contextId(request),
      ipHash: request?.ipHash ?? null,
    });

    return {
      ...created,
      maxScore: Number(created.maxScore),
    };
  });
}

export async function previewOnlineExamForTeacher(
  scope: Scope,
  examId: string,
  request?: RequestContext,
) {
  authorize(scope, "grades", "read");
  const exam = await findOnlineExamDetail(scope, examId);
  if (!exam) throw new AppError("NOT_FOUND");

  await withScope(scope, async (tx) => {
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "online_exam",
      entityId: exam.id,
      action: "exam.previewed",
      diff: {
        status: exam.status,
      },
      requestId: contextId(request),
      ipHash: request?.ipHash ?? null,
    });
  });

  return {
    isTeacherPreview: true as const,
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      instructions: exam.instructions,
      groupName: exam.group.name,
      status: exam.status,
      availableFrom: exam.availableFrom.toISOString(),
      availableUntil: exam.availableUntil.toISOString(),
      durationMinutes: exam.durationMinutes,
      maxAttempts: exam.maxAttempts,
      resultVisibility: exam.resultVisibility,
      maxScore: Number(exam.maxScore),
      honestyBoundaryKey: EXAM_HONESTY_BOUNDARY_KEY,
      questions: exam.questions.map((q) => ({
        id: q.id,
        orderIndex: q.orderIndex,
        questionType: q.questionType,
        prompt: q.prompt,
        options: (q.optionsJson as QuestionOption[]) ?? [],
        points: Number(q.points),
        autoGradable: q.autoGradable,
        explanation: q.explanation,
      })),
    },
  };
}

export async function updateOnlineExamLifecycle(
  scope: Scope,
  examId: string,
  input: UpdateOnlineExamActionInput,
  request?: RequestContext,
  now: Date = new Date(),
) {
  authorize(scope, "grades", "write");

  return withScope(scope, async (tx) => {
    const exam = await tx.onlineExam.findFirst({
      where: { id: examId, workspaceId: scope.workspaceId },
      include: {
        questions: true,
        attempts: true,
      },
    });
    if (!exam) throw new AppError("NOT_FOUND");

    if (input.action === "publish") {
      if (exam.questions.length === 0) {
        throw new AppError("CONFLICT", { messageKey: "errors.examHasNoQuestions" });
      }
      if (exam.availableUntil <= now) {
        throw new AppError("CONFLICT", { messageKey: "errors.examWindowInPast" });
      }
      const updated = await tx.onlineExam.update({
        where: { id: exam.id },
        data: {
          status: "published",
          publishedAt: exam.publishedAt ?? now,
          closedAt: null,
        },
        select: { id: true, status: true, publishedAt: true },
      });
      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "online_exam",
        entityId: exam.id,
        action: "exam.published",
        diff: {
          availableFrom: exam.availableFrom.toISOString(),
          availableUntil: exam.availableUntil.toISOString(),
        },
        requestId: contextId(request),
        ipHash: request?.ipHash ?? null,
      });
      return updated;
    }

    if (input.action === "close") {
      const updated = await tx.onlineExam.update({
        where: { id: exam.id },
        data: {
          status: "closed",
          closedAt: now,
        },
        select: { id: true, status: true, closedAt: true },
      });
      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "online_exam",
        entityId: exam.id,
        action: "exam.closed",
        requestId: contextId(request),
        ipHash: request?.ipHash ?? null,
      });
      return updated;
    }

    if (input.action === "publish_results") {
      const updated = await tx.onlineExam.update({
        where: { id: exam.id },
        data: {
          resultsPublishedAt: now,
        },
        select: { id: true, status: true, resultsPublishedAt: true },
      });

      if (exam.assessmentId) {
        await tx.assessment.update({
          where: { id: exam.assessmentId },
          data: { lockedAt: now },
        });
      }

      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "online_exam",
        entityId: exam.id,
        action: "exam.results_published",
        diff: {
          resultsPublishedAt: now.toISOString(),
        },
        requestId: contextId(request),
        ipHash: request?.ipHash ?? null,
      });
      return updated;
    }

    // update_window
    const from = new Date(input.availableFrom);
    const until = new Date(input.availableUntil);
    if (until <= from) {
      throw new AppError("VALIDATION_FAILED", {
        fields: { availableUntil: ["mustBeAfterAvailableFrom"] },
      });
    }

    const updated = await tx.onlineExam.update({
      where: { id: exam.id },
      data: {
        availableFrom: from,
        availableUntil: until,
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
        ...(input.resultVisibility !== undefined
          ? { resultVisibility: input.resultVisibility }
          : {}),
      },
      select: {
        id: true,
        availableFrom: true,
        availableUntil: true,
        durationMinutes: true,
        maxAttempts: true,
        resultVisibility: true,
      },
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "online_exam",
      entityId: exam.id,
      action: "exam.window_updated",
      diff: {
        availableFrom: from.toISOString(),
        availableUntil: until.toISOString(),
        durationMinutes: updated.durationMinutes,
        maxAttempts: updated.maxAttempts,
      },
      requestId: contextId(request),
      ipHash: request?.ipHash ?? null,
    });

    return updated;
  });
}

async function syncScoreToLinkedAssessmentTx(
  tx: Parameters<Parameters<typeof withScope>[1]>[0],
  input: {
    workspaceId: string;
    assessmentId: string | null;
    studentId: string;
    score: number;
    actorUserId: string;
    note?: string | null;
  },
) {
  if (!input.assessmentId) return;
  const existing = await tx.assessmentScore.findUnique({
    where: {
      assessmentId_studentId: {
        assessmentId: input.assessmentId,
        studentId: input.studentId,
      },
    },
    select: { id: true, score: true },
  });

  if (existing) {
    // Keep highest or latest graded attempt score
    await tx.assessmentScore.update({
      where: { id: existing.id },
      data: {
        score: input.score,
        status: "graded",
        note: input.note ?? null,
        updatedBy: input.actorUserId,
      },
    });
  } else {
    await tx.assessmentScore.create({
      data: {
        id: newUuidV7(),
        workspaceId: input.workspaceId,
        assessmentId: input.assessmentId,
        studentId: input.studentId,
        score: input.score,
        status: "graded",
        note: input.note ?? null,
        updatedBy: input.actorUserId,
      },
    });
  }
}

export async function gradeOnlineExamAttempt(
  scope: Scope,
  examId: string,
  attemptId: string,
  input: GradeExamAttemptInput,
  request?: RequestContext,
  now: Date = new Date(),
) {
  authorize(scope, "grades", "write");

  return withScope(scope, async (tx) => {
    const attempt = await tx.onlineExamAttempt.findFirst({
      where: {
        id: attemptId,
        examId,
        workspaceId: scope.workspaceId,
      },
      include: {
        exam: {
          include: {
            questions: true,
          },
        },
        responses: true,
      },
    });
    if (!attempt) throw new AppError("NOT_FOUND");
    if (attempt.status === "in_progress") {
      throw new AppError("CONFLICT", { messageKey: "errors.examAttemptNotSubmitted" });
    }

    const wasAlreadyGraded = attempt.status === "graded" && attempt.gradedAt !== null;
    if (wasAlreadyGraded && (!input.reason || input.reason.trim().length < 3)) {
      throw new AppError("VALIDATION_FAILED", {
        fields: { reason: ["reasonRequiredForGradeCorrection"] },
      });
    }

    const questionById = new Map(attempt.exam.questions.map((q) => [q.id, q]));
    for (const decision of input.decisions) {
      const question = questionById.get(decision.questionId);
      if (!question) {
        throw new AppError("NOT_FOUND");
      }
      if (decision.awardedPoints > Number(question.points) || decision.awardedPoints < 0) {
        throw new AppError("VALIDATION_FAILED", {
          fields: { awardedPoints: ["pointsExceedQuestionMaximum"] },
        });
      }

      const existingResponse = attempt.responses.find(
        (r) => r.questionId === decision.questionId,
      );
      if (existingResponse) {
        await tx.onlineExamResponse.update({
          where: { id: existingResponse.id },
          data: {
            manualAwardedPoints: decision.awardedPoints,
            teacherFeedback: decision.teacherFeedback ?? null,
            isCorrect: decision.awardedPoints >= Number(question.points),
          },
        });
      } else {
        await tx.onlineExamResponse.create({
          data: {
            id: newUuidV7(),
            workspaceId: scope.workspaceId,
            attemptId: attempt.id,
            questionId: decision.questionId,
            answerJson: {},
            manualAwardedPoints: decision.awardedPoints,
            teacherFeedback: decision.teacherFeedback ?? null,
            isCorrect: decision.awardedPoints >= Number(question.points),
            savedAt: now,
          },
        });
      }
    }

    const refreshedResponses = await tx.onlineExamResponse.findMany({
      where: { attemptId: attempt.id, workspaceId: scope.workspaceId },
    });

    let manualScore = 0;
    let totalScore = 0;
    for (const question of attempt.exam.questions) {
      const resp = refreshedResponses.find((r) => r.questionId === question.id);
      if (!resp) continue;
      if (resp.manualAwardedPoints !== null) {
        manualScore += Number(resp.manualAwardedPoints);
        totalScore += Number(resp.manualAwardedPoints);
      } else if (resp.autoAwardedPoints !== null) {
        totalScore += Number(resp.autoAwardedPoints);
      }
    }

    const roundedManual = Math.round(manualScore * 100) / 100;
    const roundedTotal = Math.round(totalScore * 100) / 100;

    const updatedAttempt = await tx.onlineExamAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "graded",
        manualScore: roundedManual,
        totalScore: roundedTotal,
        gradedAt: now,
        gradedByUserId: scope.actorUserId,
        gradingNote: input.gradingNote ?? attempt.gradingNote,
      },
      select: {
        id: true,
        status: true,
        autoScore: true,
        manualScore: true,
        totalScore: true,
        gradedAt: true,
      },
    });

    await syncScoreToLinkedAssessmentTx(tx, {
      workspaceId: scope.workspaceId,
      assessmentId: attempt.exam.assessmentId,
      studentId: attempt.studentId,
      score: roundedTotal,
      actorUserId: scope.actorUserId,
      note: input.gradingNote ?? null,
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "online_exam_attempt",
      entityId: attempt.id,
      action: wasAlreadyGraded ? "exam.grade_corrected" : "exam.manually_graded",
      diff: {
        examId: attempt.examId,
        studentId: attempt.studentId,
        oldTotalScore: attempt.totalScore?.toString() ?? null,
        newTotalScore: roundedTotal.toString(),
        reason: input.reason ?? null,
      },
      requestId: contextId(request),
      ipHash: request?.ipHash ?? null,
    });

    return {
      id: updatedAttempt.id,
      status: updatedAttempt.status,
      autoScore: Number(updatedAttempt.autoScore),
      manualScore: Number(updatedAttempt.manualScore ?? 0),
      totalScore: Number(updatedAttempt.totalScore ?? 0),
      gradedAt: updatedAttempt.gradedAt?.toISOString() ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Authenticated Student Portal Exam Flows (`F-P3-01`)
// ---------------------------------------------------------------------------

function resolveAuthenticatedStudentGrant(portal: PortalContext, requestedStudentId?: string | null) {
  const studentGrants = portal.grants.filter((g) => g.kind === "student");
  if (studentGrants.length === 0) {
    throw new AppError("FORBIDDEN");
  }
  const targetStudentId = requestedStudentId ?? studentGrants[0]!.studentId;
  const grant = resolvePortalStudent(
    { ...portal, grants: studentGrants },
    targetStudentId,
  );
  const perms = resolvePortalPermissions("student", grant.permissions);
  if (!perms.showGrades && !perms.showHomework) {
    throw new AppError("FORBIDDEN");
  }
  return grant;
}

export async function listPortalStudentOnlineExams(
  portal: PortalContext,
  requestedStudentId?: string | null,
  now: Date = new Date(),
) {
  const grant = resolveAuthenticatedStudentGrant(portal, requestedStudentId);
  const rows = await listStudentAssignedOnlineExams({
    workspaceId: grant.workspaceId,
    studentId: grant.studentId,
  });

  return rows.map((exam) => {
    const isWindowOpen =
      exam.status === "published" &&
      now.getTime() >= exam.availableFrom.getTime() &&
      now.getTime() <= exam.availableUntil.getTime();

    const activeAttempt = exam.attempts.find(
      (a) => a.status === "in_progress" && now.getTime() <= a.deadlineAt.getTime(),
    );
    const completedAttemptsCount = exam.attempts.filter(
      (a) => a.status !== "in_progress" || now.getTime() > a.deadlineAt.getTime(),
    ).length;
    const canStartNewAttempt =
      isWindowOpen && !activeAttempt && completedAttemptsCount < exam.maxAttempts;

    return {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      instructions: exam.instructions,
      groupName: exam.group.name,
      status: exam.status,
      availableFrom: exam.availableFrom.toISOString(),
      availableUntil: exam.availableUntil.toISOString(),
      durationMinutes: exam.durationMinutes,
      maxAttempts: exam.maxAttempts,
      resultVisibility: exam.resultVisibility,
      maxScore: Number(exam.maxScore),
      questionCount: exam.questions.length,
      isWindowOpen,
      canStartNewAttempt,
      honestyBoundaryKey: EXAM_HONESTY_BOUNDARY_KEY,
      questions: exam.questions.map((q) => ({
        id: q.id,
        orderIndex: q.orderIndex,
        questionType: q.questionType,
        prompt: q.prompt,
        options: (q.optionsJson as QuestionOption[]) ?? [],
        points: Number(q.points),
        autoGradable: q.autoGradable,
      })),
      attempts: exam.attempts.map((attempt) => {
        const resultsReleased = canStudentSeeExamResults({
          resultVisibility: exam.resultVisibility,
          resultsPublishedAt: exam.resultsPublishedAt,
          availableUntil: exam.availableUntil,
          attemptStatus: attempt.status,
          now,
        });

        return {
          id: attempt.id,
          attemptNumber: attempt.attemptNumber,
          status: attempt.status,
          startedAt: attempt.startedAt.toISOString(),
          deadlineAt: attempt.deadlineAt.toISOString(),
          submittedAt: attempt.submittedAt?.toISOString() ?? null,
          resultsReleased,
          autoScore: resultsReleased ? Number(attempt.autoScore) : null,
          manualScore:
            resultsReleased && attempt.manualScore !== null
              ? Number(attempt.manualScore)
              : null,
          totalScore:
            resultsReleased && attempt.totalScore !== null
              ? Number(attempt.totalScore)
              : null,
          gradingNote: resultsReleased ? attempt.gradingNote : null,
          responses: attempt.responses.map((r) => ({
            questionId: r.questionId,
            answer: r.answerJson,
            isCorrect: resultsReleased ? r.isCorrect : null,
            awardedPoints: resultsReleased
              ? r.manualAwardedPoints !== null
                ? Number(r.manualAwardedPoints)
                : r.autoAwardedPoints !== null
                  ? Number(r.autoAwardedPoints)
                  : null
              : null,
            teacherFeedback: resultsReleased ? r.teacherFeedback : null,
          })),
        };
      }),
    };
  });
}

export async function startStudentOnlineExamAttempt(
  portal: PortalContext,
  examId: string,
  requestedStudentId?: string | null,
  request?: RequestContext,
  now: Date = new Date(),
) {
  const grant = resolveAuthenticatedStudentGrant(portal, requestedStudentId);

  return withScope({ workspaceId: grant.workspaceId }, async (tx) => {
    const exam = await findStudentAssignedExamTx(tx, {
      workspaceId: grant.workspaceId,
      studentId: grant.studentId,
      examId,
    });
    if (!exam) {
      throw new AppError("NOT_FOUND");
    }

    if (
      exam.status !== "published" ||
      now.getTime() < exam.availableFrom.getTime() ||
      now.getTime() > exam.availableUntil.getTime()
    ) {
      throw new AppError("CONFLICT", { messageKey: "errors.examWindowClosed" });
    }

    const studentAttempts = exam.attempts
      .filter((a) => a.studentId === grant.studentId)
      .sort((a, b) => a.attemptNumber - b.attemptNumber);

    // Resume an active in-progress attempt if its deadline has not passed
    const activeAttempt = studentAttempts.find(
      (a) => a.status === "in_progress" && now.getTime() <= a.deadlineAt.getTime(),
    );
    if (activeAttempt) {
      return {
        resumed: true,
        attempt: {
          id: activeAttempt.id,
          attemptNumber: activeAttempt.attemptNumber,
          status: activeAttempt.status,
          startedAt: activeAttempt.startedAt.toISOString(),
          deadlineAt: activeAttempt.deadlineAt.toISOString(),
          responses: activeAttempt.responses.map((r) => ({
            questionId: r.questionId,
            answer: r.answerJson,
          })),
        },
      };
    }

    if (studentAttempts.length >= exam.maxAttempts) {
      throw new AppError("CONFLICT", { messageKey: "errors.examMaxAttemptsReached" });
    }

    const attemptNumber = studentAttempts.length + 1;
    const durationDeadline = new Date(now.getTime() + exam.durationMinutes * 60_000);
    const deadlineAt =
      durationDeadline.getTime() < exam.availableUntil.getTime()
        ? durationDeadline
        : exam.availableUntil;

    const attemptId = newUuidV7();
    const created = await tx.onlineExamAttempt.create({
      data: {
        id: attemptId,
        workspaceId: grant.workspaceId,
        examId: exam.id,
        studentId: grant.studentId,
        attemptNumber,
        status: "in_progress",
        startedAt: now,
        deadlineAt,
      },
      select: {
        id: true,
        attemptNumber: true,
        status: true,
        startedAt: true,
        deadlineAt: true,
      },
    });

    await writeAuditEvent(tx, {
      workspaceId: grant.workspaceId,
      actorUserId: portal.userId,
      actorDisplayName: portal.user?.name ?? "student",
      actorType: "user",
      entityType: "online_exam_attempt",
      entityId: attemptId,
      action: "exam.attempt_started",
      diff: {
        examId: exam.id,
        studentId: grant.studentId,
        attemptNumber,
        deadlineAt: deadlineAt.toISOString(),
      },
      requestId: contextId(request),
      ipHash: request?.ipHash ?? null,
    });

    return {
      resumed: false,
      attempt: {
        id: created.id,
        attemptNumber: created.attemptNumber,
        status: created.status,
        startedAt: created.startedAt.toISOString(),
        deadlineAt: created.deadlineAt.toISOString(),
        responses: [],
      },
    };
  });
}

export async function saveStudentExamResponses(
  portal: PortalContext,
  examId: string,
  attemptId: string,
  input: SaveStudentExamResponsesInput,
  requestedStudentId?: string | null,
  now: Date = new Date(),
) {
  const grant = resolveAuthenticatedStudentGrant(portal, requestedStudentId);

  return withScope({ workspaceId: grant.workspaceId }, async (tx) => {
    const exam = await findStudentAssignedExamTx(tx, {
      workspaceId: grant.workspaceId,
      studentId: grant.studentId,
      examId,
    });
    if (!exam) throw new AppError("NOT_FOUND");

    const attempt = exam.attempts.find(
      (a) => a.id === attemptId && a.studentId === grant.studentId,
    );
    if (!attempt) throw new AppError("NOT_FOUND");

    if (attempt.status !== "in_progress") {
      throw new AppError("CONFLICT", { messageKey: "errors.examAttemptAlreadySubmitted" });
    }
    if (
      exam.status !== "published" ||
      now.getTime() > attempt.deadlineAt.getTime() + SUBMISSION_GRACE_MS
    ) {
      throw new AppError("CONFLICT", { messageKey: "errors.examAttemptDeadlinePassed" });
    }

    const validQuestionIds = new Set(exam.questions.map((q) => q.id));
    for (const item of input.responses) {
      if (!validQuestionIds.has(item.questionId)) {
        throw new AppError("VALIDATION_FAILED", {
          fields: { responses: ["unknownQuestionId"] },
        });
      }
      await tx.onlineExamResponse.upsert({
        where: {
          attemptId_questionId: {
            attemptId: attempt.id,
            questionId: item.questionId,
          },
        },
        create: {
          id: newUuidV7(),
          workspaceId: grant.workspaceId,
          attemptId: attempt.id,
          questionId: item.questionId,
          answerJson: item.answer,
          savedAt: now,
        },
        update: {
          answerJson: item.answer,
          savedAt: now,
        },
      });
    }

    return {
      attemptId: attempt.id,
      savedCount: input.responses.length,
      savedAt: now.toISOString(),
    };
  });
}

export async function submitStudentOnlineExamAttempt(
  portal: PortalContext,
  examId: string,
  attemptId: string,
  input: SaveStudentExamResponsesInput,
  requestedStudentId?: string | null,
  request?: RequestContext,
  now: Date = new Date(),
) {
  const grant = resolveAuthenticatedStudentGrant(portal, requestedStudentId);

  return withScope({ workspaceId: grant.workspaceId }, async (tx) => {
    const exam = await findStudentAssignedExamTx(tx, {
      workspaceId: grant.workspaceId,
      studentId: grant.studentId,
      examId,
    });
    if (!exam) throw new AppError("NOT_FOUND");

    const attempt = await tx.onlineExamAttempt.findFirst({
      where: {
        id: attemptId,
        examId: exam.id,
        studentId: grant.studentId,
        workspaceId: grant.workspaceId,
      },
      include: {
        responses: true,
      },
    });
    if (!attempt) throw new AppError("NOT_FOUND");

    // Idempotent duplicate final submission guard:
    // If already submitted / manual_pending / graded, return the existing submission safely without re-writing
    if (attempt.status !== "in_progress") {
      const resultsReleased = canStudentSeeExamResults({
        resultVisibility: exam.resultVisibility,
        resultsPublishedAt: exam.resultsPublishedAt,
        availableUntil: exam.availableUntil,
        attemptStatus: attempt.status,
        now,
      });
      return {
        alreadySubmitted: true,
        attempt: {
          id: attempt.id,
          status: attempt.status,
          submittedAt: attempt.submittedAt?.toISOString() ?? now.toISOString(),
          resultsReleased,
          autoScore: resultsReleased ? Number(attempt.autoScore) : null,
          totalScore:
            resultsReleased && attempt.totalScore !== null
              ? Number(attempt.totalScore)
              : null,
        },
      };
    }

    if (
      exam.status !== "published" ||
      now.getTime() < exam.availableFrom.getTime() ||
      now.getTime() > attempt.deadlineAt.getTime() + SUBMISSION_GRACE_MS
    ) {
      throw new AppError("CONFLICT", { messageKey: "errors.examAttemptDeadlinePassed" });
    }

    // Merge incoming responses with any previously saved draft responses
    const answerMap = new Map<string, unknown>();
    for (const existing of attempt.responses) {
      answerMap.set(existing.questionId, existing.answerJson);
    }
    const validQuestionIds = new Set(exam.questions.map((q) => q.id));
    for (const incoming of input.responses) {
      if (!validQuestionIds.has(incoming.questionId)) {
        throw new AppError("VALIDATION_FAILED", {
          fields: { responses: ["unknownQuestionId"] },
        });
      }
      answerMap.set(incoming.questionId, incoming.answer);
    }

    const evaluation = evaluateExamResponses(
      exam.questions.map((q) => ({
        id: q.id,
        questionType: q.questionType,
        points: Number(q.points),
        autoGradable: q.autoGradable,
        correctAnswerJson: q.correctAnswerJson,
      })),
      answerMap,
    );

    for (const questionEval of evaluation.perQuestion) {
      const answerJson = (answerMap.get(questionEval.questionId) ?? {}) as object;
      await tx.onlineExamResponse.upsert({
        where: {
          attemptId_questionId: {
            attemptId: attempt.id,
            questionId: questionEval.questionId,
          },
        },
        create: {
          id: newUuidV7(),
          workspaceId: grant.workspaceId,
          attemptId: attempt.id,
          questionId: questionEval.questionId,
          answerJson,
          isCorrect: questionEval.isCorrect,
          autoAwardedPoints: questionEval.autoAwardedPoints,
          savedAt: now,
        },
        update: {
          answerJson,
          isCorrect: questionEval.isCorrect,
          autoAwardedPoints: questionEval.autoAwardedPoints,
          savedAt: now,
        },
      });
    }

    const nextStatus = evaluation.hasManualPending ? "manual_pending" : "graded";
    const updatedAttempt = await tx.onlineExamAttempt.update({
      where: { id: attempt.id },
      data: {
        status: nextStatus,
        submittedAt: now,
        submissionIdempotencyKey: input.idempotencyKey ?? null,
        autoScore: evaluation.autoScore,
        totalScore: evaluation.totalScore,
        gradedAt: nextStatus === "graded" ? now : null,
      },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        autoScore: true,
        totalScore: true,
      },
    });

    if (nextStatus === "graded" && evaluation.totalScore !== null) {
      await syncScoreToLinkedAssessmentTx(tx, {
        workspaceId: grant.workspaceId,
        assessmentId: exam.assessmentId,
        studentId: grant.studentId,
        score: evaluation.totalScore,
        actorUserId: portal.userId,
      });
    }

    await writeAuditEvent(tx, {
      workspaceId: grant.workspaceId,
      actorUserId: portal.userId,
      actorDisplayName: portal.user?.name ?? "student",
      actorType: "user",
      entityType: "online_exam_attempt",
      entityId: attempt.id,
      action: "exam.attempt_submitted",
      diff: {
        examId: exam.id,
        studentId: grant.studentId,
        attemptNumber: attempt.attemptNumber,
        status: nextStatus,
        autoScore: evaluation.autoScore,
        totalScore: evaluation.totalScore,
      },
      requestId: contextId(request),
      ipHash: request?.ipHash ?? null,
    });

    const resultsReleased = canStudentSeeExamResults({
      resultVisibility: exam.resultVisibility,
      resultsPublishedAt: exam.resultsPublishedAt,
      availableUntil: exam.availableUntil,
      attemptStatus: updatedAttempt.status,
      now,
    });

    return {
      alreadySubmitted: false,
      attempt: {
        id: updatedAttempt.id,
        status: updatedAttempt.status,
        submittedAt: updatedAttempt.submittedAt?.toISOString() ?? now.toISOString(),
        resultsReleased,
        autoScore: resultsReleased ? Number(updatedAttempt.autoScore) : null,
        totalScore:
          resultsReleased && updatedAttempt.totalScore !== null
            ? Number(updatedAttempt.totalScore)
            : null,
      },
    };
  });
}
