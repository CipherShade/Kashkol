import type { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";
import type { ExamsQuery } from "./schemas";

const examSummarySelect = {
  id: true,
  workspaceId: true,
  groupId: true,
  assessmentId: true,
  title: true,
  description: true,
  instructions: true,
  assignmentScope: true,
  status: true,
  availableFrom: true,
  availableUntil: true,
  durationMinutes: true,
  maxAttempts: true,
  resultVisibility: true,
  resultsPublishedAt: true,
  maxScore: true,
  publishedAt: true,
  closedAt: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  group: {
    select: {
      id: true,
      name: true,
    },
  },
  studentAssignments: {
    select: {
      studentId: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  },
  questions: {
    orderBy: { orderIndex: "asc" as const },
    select: {
      id: true,
      orderIndex: true,
      questionType: true,
      prompt: true,
      optionsJson: true,
      correctAnswerJson: true,
      explanation: true,
      points: true,
      autoGradable: true,
    },
  },
  attempts: {
    orderBy: [{ submittedAt: "desc" as const }, { startedAt: "desc" as const }],
    select: {
      id: true,
      studentId: true,
      attemptNumber: true,
      status: true,
      startedAt: true,
      deadlineAt: true,
      submittedAt: true,
      autoScore: true,
      manualScore: true,
      totalScore: true,
      gradedAt: true,
      gradedByUserId: true,
      gradingNote: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      responses: {
        select: {
          id: true,
          questionId: true,
          answerJson: true,
          isCorrect: true,
          autoAwardedPoints: true,
          manualAwardedPoints: true,
          teacherFeedback: true,
          savedAt: true,
        },
      },
    },
  },
} satisfies Prisma.OnlineExamSelect;

export async function listOnlineExamRows(scope: Scope, query: ExamsQuery) {
  return withScope(scope, (tx) =>
    tx.onlineExam.findMany({
      where: {
        workspaceId: scope.workspaceId,
        groupId: query.groupId,
        status: query.status,
      },
      orderBy: [{ createdAt: "desc" }],
      select: examSummarySelect,
    }),
  );
}

export async function findOnlineExamDetail(scope: Pick<Scope, "workspaceId">, examId: string) {
  return withScope(scope, (tx) =>
    tx.onlineExam.findFirst({
      where: {
        id: examId,
        workspaceId: scope.workspaceId,
      },
      select: examSummarySelect,
    }),
  );
}

export async function listStudentAssignedOnlineExams(input: {
  workspaceId: string;
  studentId: string;
}) {
  return withScope({ workspaceId: input.workspaceId }, async (tx) => {
    const enrollments = await tx.enrollment.findMany({
      where: {
        workspaceId: input.workspaceId,
        studentId: input.studentId,
        leftAt: null,
        group: { archivedAt: null },
      },
      select: { groupId: true },
    });
    const activeGroupIds = enrollments.map((e) => e.groupId);

    return tx.onlineExam.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: { in: ["published", "closed"] },
        OR: [
          ...(activeGroupIds.length > 0
            ? [
                {
                  assignmentScope: "group" as const,
                  groupId: { in: activeGroupIds },
                },
              ]
            : []),
          {
            assignmentScope: "selected_students",
            studentAssignments: {
              some: { studentId: input.studentId },
            },
          },
        ],
      },
      orderBy: [{ availableFrom: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        workspaceId: true,
        groupId: true,
        title: true,
        description: true,
        instructions: true,
        assignmentScope: true,
        status: true,
        availableFrom: true,
        availableUntil: true,
        durationMinutes: true,
        maxAttempts: true,
        resultVisibility: true,
        resultsPublishedAt: true,
        maxScore: true,
        group: { select: { id: true, name: true } },
        questions: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            orderIndex: true,
            questionType: true,
            prompt: true,
            optionsJson: true,
            points: true,
            autoGradable: true,
            explanation: true,
          },
        },
        attempts: {
          where: { studentId: input.studentId },
          orderBy: { attemptNumber: "asc" },
          select: {
            id: true,
            attemptNumber: true,
            status: true,
            startedAt: true,
            deadlineAt: true,
            submittedAt: true,
            submissionIdempotencyKey: true,
            autoScore: true,
            manualScore: true,
            totalScore: true,
            gradedAt: true,
            gradingNote: true,
            responses: {
              select: {
                questionId: true,
                answerJson: true,
                isCorrect: true,
                autoAwardedPoints: true,
                manualAwardedPoints: true,
                teacherFeedback: true,
                savedAt: true,
              },
            },
          },
        },
      },
    });
  });
}

export async function findStudentAssignedExamTx(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    studentId: string;
    examId: string;
  },
) {
  const exam = await tx.onlineExam.findFirst({
    where: {
      id: input.examId,
      workspaceId: input.workspaceId,
      status: { in: ["published", "closed"] },
    },
    select: examSummarySelect,
  });
  if (!exam) return null;

  if (exam.assignmentScope === "selected_students") {
    const assigned = exam.studentAssignments.some((a) => a.studentId === input.studentId);
    if (!assigned) return null;
  } else {
    const enrollment = await tx.enrollment.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: exam.groupId,
        studentId: input.studentId,
        leftAt: null,
        student: { archivedAt: null },
      },
      select: { id: true },
    });
    if (!enrollment) return null;
  }

  return exam;
}
