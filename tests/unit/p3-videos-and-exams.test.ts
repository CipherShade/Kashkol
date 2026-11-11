import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionKey, type Scope } from "@/modules/tenancy/types";
import type { PortalContext } from "@/modules/identity/session";

// ---------------------------------------------------------------------------
// In-memory state mocks for videos, exams, assessments, and audit events
// ---------------------------------------------------------------------------

type MockVideoRecord = {
  id: string;
  workspaceId: string;
  groupId: string | null;
  subjectId: string | null;
  title: string;
  description: string | null;
  topic: string | null;
  scope: "teacher_only" | "groups" | "students";
  publicationStatus: "draft" | "published" | "archived";
  provider: "cloudflare_stream" | "fake";
  providerAssetId: string;
  assetStatus: "pending" | "processing" | "ready" | "failed" | "unavailable";
  durationSeconds: number;
  sizeBytes: number;
  thumbnailPath: string | null;
  requireSignedPlayback: boolean;
  playbackCount: number;
  lastVerifiedAt: Date | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  groupIds: string[];
  studentIds: string[];
};

type MockQuestionRecord = {
  id: string;
  workspaceId: string;
  orderIndex: number;
  questionType: "mcq_single" | "true_false" | "short_answer" | "essay";
  prompt: string;
  optionsJson: unknown;
  correctAnswerJson: unknown;
  explanation: string | null;
  points: number;
  autoGradable: boolean;
};

type MockResponseRecord = {
  id: string;
  workspaceId: string;
  attemptId: string;
  questionId: string;
  answerJson: unknown;
  isCorrect: boolean | null;
  autoAwardedPoints: number | null;
  manualAwardedPoints: number | null;
  teacherFeedback: string | null;
  savedAt: Date;
};

type MockAttemptRecord = {
  id: string;
  workspaceId: string;
  examId: string;
  studentId: string;
  attemptNumber: number;
  status: "in_progress" | "submitted" | "manual_pending" | "graded" | "expired";
  startedAt: Date;
  deadlineAt: Date;
  submittedAt: Date | null;
  submissionIdempotencyKey: string | null;
  autoScore: number;
  manualScore: number | null;
  totalScore: number | null;
  gradedAt: Date | null;
  gradedByUserId: string | null;
  gradingNote: string | null;
};

type MockExamRecord = {
  id: string;
  workspaceId: string;
  groupId: string;
  assessmentId: string | null;
  title: string;
  description: string | null;
  instructions: string | null;
  assignmentScope: "group" | "selected_students";
  status: "draft" | "published" | "closed";
  availableFrom: Date;
  availableUntil: Date;
  durationMinutes: number;
  maxAttempts: number;
  resultVisibility: "after_manual_publish" | "immediate_after_submit" | "after_window_close";
  resultsPublishedAt: Date | null;
  maxScore: number;
  publishedAt: Date | null;
  closedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  studentIds: string[];
  questions: MockQuestionRecord[];
};

const state = vi.hoisted(() => ({
  videos: new Map<string, MockVideoRecord>(),
  exams: new Map<string, MockExamRecord>(),
  attempts: new Map<string, MockAttemptRecord>(),
  responses: new Map<string, MockResponseRecord>(),
  auditEvents: [] as Array<{
    action: string;
    entityType: string;
    entityId: string | null;
    diff?: unknown;
  }>,
  assessmentScores: new Map<
    string,
    {
      id: string;
      assessmentId: string;
      studentId: string;
      score: number | null;
      status: string;
      note: string | null;
    }
  >(),
  lockedAssessments: new Set<string>(),
}));

const GROUP_1 = "00000000-0000-4000-8000-000000000010";
const SUBJECT_1 = "00000000-0000-4000-8000-000000000001";
const ENROLLED_STUDENT = "00000000-0000-4000-8000-000000000101";
const UNASSIGNED_STUDENT = "00000000-0000-4000-8000-000000000102";

function hydrateVideoRow(v: MockVideoRecord) {
  return {
    ...v,
    subject: v.subjectId ? { id: v.subjectId, name: "Physics" } : null,
    groupAccesses: v.groupIds.map((groupId) => ({
      groupId,
      group: { id: groupId, name: "Group 1", archivedAt: null },
    })),
    studentAccesses: v.studentIds.map((studentId) => ({
      studentId,
      student: { id: studentId, firstName: "Omar", lastName: "Student", archivedAt: null },
    })),
  };
}

function hydrateExamRow(e: MockExamRecord) {
  const attempts = [...state.attempts.values()]
    .filter((a) => a.examId === e.id)
    .sort((a, b) => a.attemptNumber - b.attemptNumber)
    .map((a) => ({
      ...a,
      student: {
        id: a.studentId,
        firstName: a.studentId === ENROLLED_STUDENT ? "Omar" : "Other",
        lastName: "Student",
      },
      responses: [...state.responses.values()].filter((r) => r.attemptId === a.id),
    }));

  return {
    ...e,
    group: { id: e.groupId, name: "Physics Grade 11" },
    studentAssignments: e.studentIds.map((studentId) => ({
      studentId,
      student: { id: studentId, firstName: "Omar", lastName: "Student" },
    })),
    questions: [...e.questions].sort((a, b) => a.orderIndex - b.orderIndex),
    attempts,
  };
}

const mockTx = {
  group: {
    count: vi.fn(async ({ where }: { where: { id?: { in?: string[] } } }) => {
      const ids = where.id?.in ?? [];
      return ids.filter((id) => id === GROUP_1).length;
    }),
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
      return where.id === GROUP_1 ? { id: GROUP_1 } : null;
    }),
  },
  student: {
    count: vi.fn(async ({ where }: { where: { id?: { in?: string[] } } }) => {
      const ids = where.id?.in ?? [];
      return ids.filter((id) => id === ENROLLED_STUDENT || id === UNASSIGNED_STUDENT).length;
    }),
  },
  subject: {
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
      return where.id === SUBJECT_1 ? { id: SUBJECT_1 } : null;
    }),
  },
  enrollment: {
    findMany: vi.fn(async ({ where }: { where: { studentId: string } }) => {
      return where.studentId === ENROLLED_STUDENT ? [{ groupId: GROUP_1 }] : [];
    }),
    findFirst: vi.fn(async ({ where }: { where: { studentId: string; groupId: string } }) => {
      return where.studentId === ENROLLED_STUDENT && where.groupId === GROUP_1
        ? { id: "enr-1" }
        : null;
    }),
  },
  videoLesson: {
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: {
          id?: string;
          workspaceId?: string;
          provider?: string;
          providerAssetId?: string;
        };
      }) => {
        for (const v of state.videos.values()) {
          if (v.deletedAt) continue;
          if (where.id && v.id !== where.id) continue;
          if (where.workspaceId && v.workspaceId !== where.workspaceId) continue;
          if (where.provider && v.provider !== where.provider) continue;
          if (where.providerAssetId && v.providerAssetId !== where.providerAssetId) continue;
          return hydrateVideoRow(v);
        }
        return null;
      },
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const groupAccesses =
        (data.groupAccesses as { createMany?: { data?: Array<{ groupId: string }> } })
          ?.createMany?.data ?? [];
      const studentAccesses =
        (data.studentAccesses as { createMany?: { data?: Array<{ studentId: string }> } })
          ?.createMany?.data ?? [];
      const now = new Date();
      const rec: MockVideoRecord = {
        id: String(data.id),
        workspaceId: String(data.workspaceId),
        groupId: (data.groupId as string | null) ?? null,
        subjectId: (data.subjectId as string | null) ?? null,
        title: String(data.title),
        description: (data.description as string | null) ?? null,
        topic: (data.topic as string | null) ?? null,
        scope: data.scope as MockVideoRecord["scope"],
        publicationStatus: data.publicationStatus as MockVideoRecord["publicationStatus"],
        provider: data.provider as MockVideoRecord["provider"],
        providerAssetId: String(data.providerAssetId),
        assetStatus: data.assetStatus as MockVideoRecord["assetStatus"],
        durationSeconds: Number(data.durationSeconds ?? 0),
        sizeBytes: Number(data.sizeBytes ?? 0),
        thumbnailPath: (data.thumbnailPath as string | null) ?? null,
        requireSignedPlayback: Boolean(data.requireSignedPlayback ?? true),
        playbackCount: 0,
        lastVerifiedAt: (data.lastVerifiedAt as Date | null) ?? now,
        publishedAt: (data.publishedAt as Date | null) ?? null,
        archivedAt: null,
        deletedAt: null,
        createdByUserId: String(data.createdByUserId),
        createdAt: now,
        updatedAt: now,
        groupIds: groupAccesses.map((g) => g.groupId),
        studentIds: studentAccesses.map((s) => s.studentId),
      };
      state.videos.set(rec.id, rec);
      return rec;
    }),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id?: string; workspaceId_id?: { id: string } };
        data: Record<string, unknown>;
      }) => {
        const id = where.id ?? where.workspaceId_id?.id ?? "";
        const existing = state.videos.get(id);
        if (!existing) throw new Error("Video not found");
        if (
          typeof data.playbackCount === "object" &&
          data.playbackCount !== null &&
          "increment" in data.playbackCount
        ) {
          existing.playbackCount += Number(
            (data.playbackCount as { increment: number }).increment,
          );
        }
        if (data.title !== undefined) existing.title = String(data.title);
        if (data.description !== undefined)
          existing.description = (data.description as string | null) ?? null;
        if (data.topic !== undefined) existing.topic = (data.topic as string | null) ?? null;
        if (data.scope !== undefined)
          existing.scope = data.scope as MockVideoRecord["scope"];
        if (data.publicationStatus !== undefined)
          existing.publicationStatus =
            data.publicationStatus as MockVideoRecord["publicationStatus"];
        if (data.assetStatus !== undefined)
          existing.assetStatus = data.assetStatus as MockVideoRecord["assetStatus"];
        if (data.durationSeconds !== undefined)
          existing.durationSeconds = Number(data.durationSeconds);
        if (data.sizeBytes !== undefined) existing.sizeBytes = Number(data.sizeBytes);
        if (data.publishedAt !== undefined)
          existing.publishedAt = (data.publishedAt as Date | null) ?? null;
        if (data.archivedAt !== undefined)
          existing.archivedAt = (data.archivedAt as Date | null) ?? null;
        if (data.deletedAt !== undefined)
          existing.deletedAt = (data.deletedAt as Date | null) ?? null;
        if (data.lastVerifiedAt !== undefined)
          existing.lastVerifiedAt = (data.lastVerifiedAt as Date | null) ?? null;
        existing.updatedAt = new Date();
        return existing;
      },
    ),
  },
  videoGroupAccess: {
    deleteMany: vi.fn(async ({ where }: { where: { videoId: string } }) => {
      const v = state.videos.get(where.videoId);
      if (v) v.groupIds = [];
    }),
    createMany: vi.fn(
      async ({ data }: { data: Array<{ videoId: string; groupId: string }> }) => {
        for (const item of data) {
          const v = state.videos.get(item.videoId);
          if (v && !v.groupIds.includes(item.groupId)) v.groupIds.push(item.groupId);
        }
      },
    ),
  },
  videoStudentAccess: {
    deleteMany: vi.fn(async ({ where }: { where: { videoId: string } }) => {
      const v = state.videos.get(where.videoId);
      if (v) v.studentIds = [];
    }),
    createMany: vi.fn(
      async ({ data }: { data: Array<{ videoId: string; studentId: string }> }) => {
        for (const item of data) {
          const v = state.videos.get(item.videoId);
          if (v && !v.studentIds.includes(item.studentId)) v.studentIds.push(item.studentId);
        }
      },
    ),
  },
  assessment: {
    create: vi.fn(async ({ data }: { data: { id: string } }) => ({ id: data.id })),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: { lockedAt?: Date | null } }) => {
        if (data.lockedAt) state.lockedAssessments.add(where.id);
        return { id: where.id };
      },
    ),
  },
  assessmentScore: {
    findUnique: vi.fn(
      async ({
        where,
      }: {
        where: { assessmentId_studentId: { assessmentId: string; studentId: string } };
      }) => {
        const key = `${where.assessmentId_studentId.assessmentId}:${where.assessmentId_studentId.studentId}`;
        return state.assessmentScores.get(key) ?? null;
      },
    ),
    create: vi.fn(
      async ({
        data,
      }: {
        data: {
          id: string;
          assessmentId: string;
          studentId: string;
          score: number;
          status: string;
          note?: string | null;
        };
      }) => {
        const key = `${data.assessmentId}:${data.studentId}`;
        const rec = {
          id: data.id,
          assessmentId: data.assessmentId,
          studentId: data.studentId,
          score: Number(data.score),
          status: data.status,
          note: data.note ?? null,
        };
        state.assessmentScores.set(key, rec);
        return rec;
      },
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { score?: number; status?: string; note?: string | null; updatedBy?: string };
      }) => {
        for (const [k, v] of state.assessmentScores.entries()) {
          if (v.id === where.id) {
            const updated = {
              ...v,
              ...(data.score !== undefined ? { score: Number(data.score) } : {}),
              ...(data.status !== undefined ? { status: data.status } : {}),
              ...(data.note !== undefined ? { note: data.note } : {}),
            };
            state.assessmentScores.set(k, updated);
            return updated;
          }
        }
        return null;
      },
    ),
  },
  onlineExam: {
    findFirst: vi.fn(async ({ where }: { where: { id?: string; workspaceId?: string } }) => {
      const e = where.id ? state.exams.get(where.id) : null;
      if (!e) return null;
      if (where.workspaceId && e.workspaceId !== where.workspaceId) return null;
      return hydrateExamRow(e);
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const studentAssignments =
        (data.studentAssignments as { createMany?: { data?: Array<{ studentId: string }> } })
          ?.createMany?.data ?? [];
      const rawQuestions =
        (data.questions as { create?: Array<Record<string, unknown>> })?.create ?? [];
      const questions: MockQuestionRecord[] = rawQuestions.map((q, idx) => ({
        id: `00000000-0000-4000-8000-00000000020${idx + 1}`,
        workspaceId: String(data.workspaceId),
        orderIndex: Number(q.orderIndex),
        questionType: q.questionType as MockQuestionRecord["questionType"],
        prompt: String(q.prompt),
        optionsJson: q.optionsJson,
        correctAnswerJson: q.correctAnswerJson,
        explanation: (q.explanation as string | null) ?? null,
        points: Number(q.points),
        autoGradable: Boolean(q.autoGradable),
      }));
      const exam: MockExamRecord = {
        id: String(data.id),
        workspaceId: String(data.workspaceId),
        groupId: String(data.groupId),
        assessmentId: (data.assessmentId as string | null) ?? null,
        title: String(data.title),
        description: (data.description as string | null) ?? null,
        instructions: (data.instructions as string | null) ?? null,
        assignmentScope: data.assignmentScope as MockExamRecord["assignmentScope"],
        status: data.status as MockExamRecord["status"],
        availableFrom: data.availableFrom as Date,
        availableUntil: data.availableUntil as Date,
        durationMinutes: Number(data.durationMinutes),
        maxAttempts: Number(data.maxAttempts),
        resultVisibility: data.resultVisibility as MockExamRecord["resultVisibility"],
        resultsPublishedAt: null,
        maxScore: Number(data.maxScore),
        publishedAt: null,
        closedAt: null,
        createdByUserId: String(data.createdByUserId),
        createdAt: now,
        updatedAt: now,
        studentIds: studentAssignments.map((s) => s.studentId),
        questions,
      };
      state.exams.set(exam.id, exam);
      return exam;
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const exam = state.exams.get(where.id);
        if (!exam) throw new Error("Exam not found");
        if (data.status !== undefined) exam.status = data.status as MockExamRecord["status"];
        if (data.publishedAt !== undefined)
          exam.publishedAt = (data.publishedAt as Date | null) ?? null;
        if (data.closedAt !== undefined) exam.closedAt = (data.closedAt as Date | null) ?? null;
        if (data.resultsPublishedAt !== undefined)
          exam.resultsPublishedAt = (data.resultsPublishedAt as Date | null) ?? null;
        if (data.availableFrom !== undefined) exam.availableFrom = data.availableFrom as Date;
        if (data.availableUntil !== undefined) exam.availableUntil = data.availableUntil as Date;
        if (data.durationMinutes !== undefined)
          exam.durationMinutes = Number(data.durationMinutes);
        if (data.maxAttempts !== undefined) exam.maxAttempts = Number(data.maxAttempts);
        if (data.resultVisibility !== undefined)
          exam.resultVisibility = data.resultVisibility as MockExamRecord["resultVisibility"];
        exam.updatedAt = new Date();
        return exam;
      },
    ),
  },
  onlineExamAttempt: {
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: { id: string; examId?: string; studentId?: string; workspaceId?: string };
      }) => {
        const attempt = state.attempts.get(where.id);
        if (!attempt) return null;
        if (where.examId && attempt.examId !== where.examId) return null;
        if (where.studentId && attempt.studentId !== where.studentId) return null;
        if (where.workspaceId && attempt.workspaceId !== where.workspaceId) return null;
        const exam = state.exams.get(attempt.examId);
        if (!exam) return null;
        return {
          ...attempt,
          exam: { ...exam, questions: exam.questions },
          responses: [...state.responses.values()].filter((r) => r.attemptId === attempt.id),
        };
      },
    ),
    findUnique: vi.fn(
      async ({ where }: { where: { id: string } }) => {
        const attempt = state.attempts.get(where.id);
        if (!attempt) return null;
        return { ...attempt };
      },
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const attempt: MockAttemptRecord = {
        id: String(data.id),
        workspaceId: String(data.workspaceId),
        examId: String(data.examId),
        studentId: String(data.studentId),
        attemptNumber: Number(data.attemptNumber),
        status: data.status as MockAttemptRecord["status"],
        startedAt: data.startedAt as Date,
        deadlineAt: data.deadlineAt as Date,
        submittedAt: null,
        submissionIdempotencyKey: null,
        autoScore: 0,
        manualScore: null,
        totalScore: null,
        gradedAt: null,
        gradedByUserId: null,
        gradingNote: null,
      };
      state.attempts.set(attempt.id, attempt);
      return attempt;
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const attempt = state.attempts.get(where.id);
        if (!attempt) throw new Error("Attempt not found");
        if (data.status !== undefined)
          attempt.status = data.status as MockAttemptRecord["status"];
        if (data.submittedAt !== undefined)
          attempt.submittedAt = (data.submittedAt as Date | null) ?? null;
        if (data.submissionIdempotencyKey !== undefined)
          attempt.submissionIdempotencyKey =
            (data.submissionIdempotencyKey as string | null) ?? null;
        if (data.autoScore !== undefined) attempt.autoScore = Number(data.autoScore);
        if (data.manualScore !== undefined)
          attempt.manualScore = data.manualScore !== null ? Number(data.manualScore) : null;
        if (data.totalScore !== undefined)
          attempt.totalScore = data.totalScore !== null ? Number(data.totalScore) : null;
        if (data.gradedAt !== undefined)
          attempt.gradedAt = (data.gradedAt as Date | null) ?? null;
        if (data.gradedByUserId !== undefined)
          attempt.gradedByUserId = (data.gradedByUserId as string | null) ?? null;
        if (data.gradingNote !== undefined)
          attempt.gradingNote = (data.gradingNote as string | null) ?? null;
        return attempt;
      },
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: {
          id?: string;
          workspaceId?: string;
          examId?: string;
          studentId?: string;
          status?: string;
          deadlineAt?: { lt?: Date };
        };
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const attempt of state.attempts.values()) {
          if (where.id && attempt.id !== where.id) continue;
          if (where.workspaceId && attempt.workspaceId !== where.workspaceId) continue;
          if (where.examId && attempt.examId !== where.examId) continue;
          if (where.studentId && attempt.studentId !== where.studentId) continue;
          if (where.status && attempt.status !== where.status) continue;
          if (where.deadlineAt?.lt && attempt.deadlineAt >= where.deadlineAt.lt) continue;
          if (data.status !== undefined) attempt.status = data.status as MockAttemptRecord["status"];
          if (data.submittedAt !== undefined) attempt.submittedAt = (data.submittedAt as Date | null) ?? null;
          if (data.submissionIdempotencyKey !== undefined) attempt.submissionIdempotencyKey = (data.submissionIdempotencyKey as string | null) ?? null;
          if (data.autoScore !== undefined) attempt.autoScore = Number(data.autoScore);
          if (data.totalScore !== undefined) attempt.totalScore = data.totalScore !== null ? Number(data.totalScore) : null;
          if (data.gradedAt !== undefined) attempt.gradedAt = (data.gradedAt as Date | null) ?? null;
          count++;
        }
        return { count };
      },
    ),
  },
  onlineExamResponse: {
    findMany: vi.fn(async ({ where }: { where: { attemptId: string } }) => {
      return [...state.responses.values()].filter((r) => r.attemptId === where.attemptId);
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const rec: MockResponseRecord = {
        id: String(data.id),
        workspaceId: String(data.workspaceId),
        attemptId: String(data.attemptId),
        questionId: String(data.questionId),
        answerJson: data.answerJson,
        isCorrect: (data.isCorrect as boolean | null) ?? null,
        autoAwardedPoints:
          data.autoAwardedPoints !== undefined && data.autoAwardedPoints !== null
            ? Number(data.autoAwardedPoints)
            : null,
        manualAwardedPoints:
          data.manualAwardedPoints !== undefined && data.manualAwardedPoints !== null
            ? Number(data.manualAwardedPoints)
            : null,
        teacherFeedback: (data.teacherFeedback as string | null) ?? null,
        savedAt: (data.savedAt as Date) ?? new Date(),
      };
      state.responses.set(`${rec.attemptId}:${rec.questionId}`, rec);
      return rec;
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        for (const [k, rec] of state.responses.entries()) {
          if (rec.id === where.id) {
            if (data.manualAwardedPoints !== undefined) {
              rec.manualAwardedPoints =
                data.manualAwardedPoints !== null ? Number(data.manualAwardedPoints) : null;
            }
            if (data.teacherFeedback !== undefined) {
              rec.teacherFeedback = (data.teacherFeedback as string | null) ?? null;
            }
            if (data.isCorrect !== undefined) {
              rec.isCorrect = (data.isCorrect as boolean | null) ?? null;
            }
            state.responses.set(k, rec);
            return rec;
          }
        }
        return null;
      },
    ),
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { attemptId_questionId: { attemptId: string; questionId: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const key = `${where.attemptId_questionId.attemptId}:${where.attemptId_questionId.questionId}`;
        const existing = state.responses.get(key);
        if (existing) {
          if (update.answerJson !== undefined) existing.answerJson = update.answerJson;
          if (update.isCorrect !== undefined)
            existing.isCorrect = (update.isCorrect as boolean | null) ?? null;
          if (update.autoAwardedPoints !== undefined)
            existing.autoAwardedPoints =
              update.autoAwardedPoints !== null ? Number(update.autoAwardedPoints) : null;
          if (update.savedAt !== undefined) existing.savedAt = update.savedAt as Date;
          state.responses.set(key, existing);
          return existing;
        }
        const created: MockResponseRecord = {
          id: String(create.id),
          workspaceId: String(create.workspaceId),
          attemptId: String(create.attemptId),
          questionId: String(create.questionId),
          answerJson: create.answerJson,
          isCorrect: (create.isCorrect as boolean | null) ?? null,
          autoAwardedPoints:
            create.autoAwardedPoints !== undefined && create.autoAwardedPoints !== null
              ? Number(create.autoAwardedPoints)
              : null,
          manualAwardedPoints: null,
          teacherFeedback: null,
          savedAt: (create.savedAt as Date) ?? new Date(),
        };
        state.responses.set(key, created);
        return created;
      },
    ),
  },
};

vi.mock("@/lib/db/scope", () => ({
  withScope: vi.fn(async (_scope: unknown, fn: (tx: typeof mockTx) => Promise<unknown>) =>
    fn(mockTx),
  ),
}));

vi.mock("@/modules/audit/service", () => ({
  writeAuditEvent: vi.fn(
    async (
      _tx: unknown,
      event: {
        action: string;
        entityType: string;
        entityId?: string | null;
        diff?: unknown;
      },
    ) => {
      state.auditEvents.push({
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId ?? null,
        diff: event.diff,
      });
    },
  ),
}));

vi.mock("@/modules/videos/repository", () => ({
  listVideoLessonRows: vi.fn(async (scope: { workspaceId: string }) => {
    return [...state.videos.values()]
      .filter((v) => v.workspaceId === scope.workspaceId && !v.deletedAt)
      .map(hydrateVideoRow);
  }),
  findVideoLesson: vi.fn(async (scope: { workspaceId: string }, videoId: string) => {
    const v = state.videos.get(videoId);
    if (!v || v.workspaceId !== scope.workspaceId || v.deletedAt) return null;
    return hydrateVideoRow(v);
  }),
  getWorkspaceVideoUsage: vi.fn(async (scope: { workspaceId: string }) => {
    const rows = [...state.videos.values()].filter(
      (v) => v.workspaceId === scope.workspaceId && !v.deletedAt,
    );
    let storageBytes = 0;
    let totalDurationSeconds = 0;
    let totalPlaybacks = 0;
    let estimatedBandwidthBytes = 0;
    let publishedCount = 0;
    for (const r of rows) {
      storageBytes += r.sizeBytes;
      totalDurationSeconds += r.durationSeconds;
      totalPlaybacks += r.playbackCount;
      estimatedBandwidthBytes += r.sizeBytes * r.playbackCount;
      if (r.publicationStatus === "published") publishedCount += 1;
    }
    return {
      videoCount: rows.length,
      publishedCount,
      storageBytes,
      totalDurationSeconds,
      totalPlaybacks,
      estimatedBandwidthBytes,
    };
  }),
  findAuthorizedPortalVideo: vi.fn(
    async (input: { workspaceId: string; videoId: string; studentIds: string[] }) => {
      const v = state.videos.get(input.videoId);
      if (
        !v ||
        v.workspaceId !== input.workspaceId ||
        v.deletedAt ||
        v.archivedAt ||
        v.publicationStatus !== "published"
      ) {
        return null;
      }
      if (v.scope === "students" && v.studentIds.some((id) => input.studentIds.includes(id))) {
        return hydrateVideoRow(v);
      }
      if (
        v.scope === "groups" &&
        input.studentIds.includes(ENROLLED_STUDENT) &&
        v.groupIds.includes(GROUP_1)
      ) {
        return hydrateVideoRow(v);
      }
      return null;
    },
  ),
  incrementVideoPlaybackCountTx: vi.fn(
    async (_tx: unknown, workspaceId: string, videoId: string) => {
      const v = state.videos.get(videoId);
      if (!v || v.workspaceId !== workspaceId) return null;
      v.playbackCount += 1;
      return { id: v.id, playbackCount: v.playbackCount };
    },
  ),
  applyVideoWebhookStateInScope: vi.fn(
    async (
      workspaceId: string,
      payload: {
        providerAssetId: string;
        state: MockVideoRecord["assetStatus"];
        durationSeconds?: number;
        sizeBytes?: number;
      },
      now: Date = new Date(),
    ) => {
      for (const v of state.videos.values()) {
        if (
          v.workspaceId === workspaceId &&
          v.providerAssetId === payload.providerAssetId &&
          !v.deletedAt
        ) {
          v.assetStatus = payload.state;
          if (payload.durationSeconds !== undefined)
            v.durationSeconds = payload.durationSeconds;
          if (payload.sizeBytes !== undefined) v.sizeBytes = payload.sizeBytes;
          v.lastVerifiedAt = now;
          return {
            id: v.id,
            assetStatus: v.assetStatus,
            durationSeconds: v.durationSeconds,
            sizeBytes: v.sizeBytes,
          };
        }
      }
      return null;
    },
  ),
}));

vi.mock("@/modules/exams/repository", () => ({
  listOnlineExamRows: vi.fn(async (scope: { workspaceId: string }) => {
    return [...state.exams.values()]
      .filter((e) => e.workspaceId === scope.workspaceId)
      .map(hydrateExamRow);
  }),
  findOnlineExamDetail: vi.fn(async (scope: { workspaceId: string }, examId: string) => {
    const e = state.exams.get(examId);
    if (!e || e.workspaceId !== scope.workspaceId) return null;
    return hydrateExamRow(e);
  }),
  listStudentAssignedOnlineExams: vi.fn(
    async (input: { workspaceId: string; studentId: string }) => {
      const out = [];
      for (const e of state.exams.values()) {
        if (e.workspaceId !== input.workspaceId) continue;
        if (e.status !== "published" && e.status !== "closed") continue;
        if (e.assignmentScope === "selected_students") {
          if (!e.studentIds.includes(input.studentId)) continue;
        } else {
          if (input.studentId !== ENROLLED_STUDENT || e.groupId !== GROUP_1) continue;
        }
        const hydrated = hydrateExamRow(e);
        out.push({
          ...hydrated,
          attempts: hydrated.attempts.filter((a) => a.studentId === input.studentId),
        });
      }
      return out;
    },
  ),
  findStudentAssignedExamTx: vi.fn(
    async (
      _tx: unknown,
      input: { workspaceId: string; studentId: string; examId: string },
    ) => {
      const e = state.exams.get(input.examId);
      if (!e || e.workspaceId !== input.workspaceId) return null;
      if (e.status !== "published" && e.status !== "closed") return null;
      if (e.assignmentScope === "selected_students") {
        if (!e.studentIds.includes(input.studentId)) return null;
      } else {
        if (input.studentId !== ENROLLED_STUDENT || e.groupId !== GROUP_1) return null;
      }
      return hydrateExamRow(e);
    },
  ),
}));

import {
  FakeVideoProviderAdapter,
  registerFakeVideoAsset,
  resetFakeVideoProviderStore,
  createFakeWebhookSignature,
  CloudflareStreamAdapter,
  setVideoProviderAdapterForTests,
  listVideoLessons,
  createVideoLesson,
  updateVideoLesson,
  issueStaffVideoPlayback,
  issuePortalVideoPlayback,
  consumeVideoProviderWebhook,
} from "@/modules/videos";
import {
  normalizeShortAnswer,
  evaluateSingleQuestion,
  createOnlineExam,
  previewOnlineExamForTeacher,
  updateOnlineExamLifecycle,
  gradeOnlineExamAttempt,
  listPortalStudentOnlineExams,
  startStudentOnlineExamAttempt,
  saveStudentExamResponses,
  submitStudentOnlineExamAttempt,
} from "@/modules/exams";

const ownerScope: Scope = {
  workspaceId: "ws-1",
  actorUserId: "teacher-1",
  actorDisplayName: "Teacher One",
  role: "owner",
  permissions: new Set([
    permissionKey("files", "read"),
    permissionKey("files", "write"),
    permissionKey("groups", "read"),
    permissionKey("students", "read"),
    permissionKey("grades", "read"),
    permissionKey("grades", "write"),
  ]),
};

const readOnlyAssistantScope: Scope = {
  workspaceId: "ws-1",
  actorUserId: "asst-1",
  actorDisplayName: "Assistant One",
  role: "assistant",
  permissions: new Set([
    permissionKey("students", "read"),
    permissionKey("grades", "read"),
    permissionKey("files", "read"),
  ]),
};

const enrolledStudentContext: PortalContext = {
  userId: "portal-user-1",
  user: {
    id: "portal-user-1",
    email: "student1@example.com",
    name: "Omar Student",
    emailVerified: true,
  },
  workspaceIds: ["ws-1"],
  studentIds: new Set([ENROLLED_STUDENT]),
  grants: [
    {
      id: "grant-stu-1",
      workspaceId: "ws-1",
      studentId: ENROLLED_STUDENT,
      guardianId: null,
      kind: "student",
      expiresAt: null,
      permissions: {
        showSchedule: true,
        showAttendance: true,
        showGrades: true,
        showHomework: true,
        showResources: true,
        showNotifications: true,
        showPayments: false,
      },
    },
  ],
};

const unassignedStudentContext: PortalContext = {
  userId: "portal-user-2",
  user: {
    id: "portal-user-2",
    email: "student2@example.com",
    name: "Other Student",
    emailVerified: true,
  },
  workspaceIds: ["ws-1"],
  studentIds: new Set([UNASSIGNED_STUDENT]),
  grants: [
    {
      id: "grant-stu-2",
      workspaceId: "ws-1",
      studentId: UNASSIGNED_STUDENT,
      guardianId: null,
      kind: "student",
      expiresAt: null,
      permissions: {
        showSchedule: true,
        showAttendance: true,
        showGrades: true,
        showHomework: true,
        showResources: true,
        showNotifications: true,
        showPayments: false,
      },
    },
  ],
};

describe("P3 Recorded Videos via External Provider Adapter (F-P3-02)", () => {
  beforeEach(() => {
    state.videos.clear();
    state.auditEvents.length = 0;
    resetFakeVideoProviderStore();
    setVideoProviderAdapterForTests(null);
  });

  it("shows a truthful setup state when no external video provider is configured and blocks attaching fake hosted videos", async () => {
    const listed = await listVideoLessons(ownerScope, { includeArchived: false });
    expect(listed.providerStatus.configured).toBe(false);
    expect(listed.providerStatus.driver).toBe("none");

    await expect(
      createVideoLesson(ownerScope, {
        title: "Kinematics Lecture 1",
        providerAssetId: "asset-unconfigured",
        description: null,
        topic: "Motion",
        subjectId: null,
        scope: "teacher_only",
        publicationStatus: "draft",
        groupIds: [],
        studentIds: [],
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "errors.videoProviderNotConfigured",
    });
  });

  it("attaches provider video metadata, enforces publication readiness, and issues short-lived signed playback descriptors without exposing secrets", async () => {
    const fakeAdapter = new FakeVideoProviderAdapter();
    setVideoProviderAdapterForTests(fakeAdapter);

    registerFakeVideoAsset({
      providerAssetId: "cf-uid-ready-1",
      assetStatus: "ready",
      durationSeconds: 900,
      sizeBytes: 50 * 1024 * 1024,
      thumbnailPath: "/api/videos/thumbnails/cf-uid-ready-1",
      requireSignedPlayback: true,
    });

    const created = await createVideoLesson(ownerScope, {
      title: "Newton's Second Law",
      providerAssetId: "cf-uid-ready-1",
      description: "Force and acceleration derivation",
      topic: "Dynamics",
      subjectId: SUBJECT_1,
      scope: "groups",
      publicationStatus: "published",
      groupIds: [GROUP_1],
      studentIds: [],
    });

    expect(created.assetStatus).toBe("ready");
    expect(created.durationSeconds).toBe(900);
    expect(created.sizeBytes).toBe(50 * 1024 * 1024);

    // Staff playback descriptor is short-lived and signed, never exposing API tokens or signing secrets
    const staffPlayback = await issueStaffVideoPlayback(ownerScope, created.id);
    expect(staffPlayback.playback.signedToken).toBeTruthy();
    expect(staffPlayback.playback.embedUrl).toContain(
      encodeURIComponent(staffPlayback.playback.signedToken),
    );
    expect(staffPlayback.playback.embedUrl).not.toContain("API_TOKEN");
    expect(staffPlayback.playback.embedUrl).not.toContain("SIGNING_SECRET");

    // Authorized student in GROUP_1 can request signed playback
    const studentPlayback = await issuePortalVideoPlayback(
      enrolledStudentContext,
      created.id,
    );
    expect(studentPlayback.playback.signedToken).toBeTruthy();

    // Unassigned student is denied with 404 (indistinguishable from non-existent)
    await expect(
      issuePortalVideoPlayback(unassignedStudentContext, created.id),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      messageKey: "errors.notFound",
    });
  });

  it("prevents publishing a video asset that is still processing at the provider", async () => {
    setVideoProviderAdapterForTests(new FakeVideoProviderAdapter());
    registerFakeVideoAsset({
      providerAssetId: "cf-uid-processing",
      assetStatus: "processing",
      durationSeconds: 0,
      sizeBytes: 10 * 1024 * 1024,
    });

    await expect(
      createVideoLesson(ownerScope, {
        title: "Processing Video",
        providerAssetId: "cf-uid-processing",
        description: null,
        topic: null,
        subjectId: null,
        scope: "teacher_only",
        publicationStatus: "published",
        groupIds: [],
        studentIds: [],
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "errors.videoNotReadyForPublish",
    });

    // Can save as draft while processing, then webhook transitions it to ready
    const draft = await createVideoLesson(ownerScope, {
      title: "Processing Video",
      providerAssetId: "cf-uid-processing",
      description: null,
      topic: null,
      subjectId: null,
      scope: "teacher_only",
      publicationStatus: "draft",
      groupIds: [],
      studentIds: [],
    });
    expect(draft.assetStatus).toBe("processing");

    const webhookBody = JSON.stringify({
      uid: "cf-uid-processing",
      readyToStream: true,
      status: { state: "ready" },
      duration: 420,
      size: 25 * 1024 * 1024,
    });
    const sig = createFakeWebhookSignature(webhookBody);
    const webhookRes = await consumeVideoProviderWebhook({
      workspaceId: "ws-1",
      rawBody: webhookBody,
      signatureHeader: sig,
    });
    expect(webhookRes.updated).toBe(true);
    expect(webhookRes.assetStatus).toBe("ready");

    const published = await updateVideoLesson(ownerScope, draft.id, {
      publicationStatus: "published",
    });
    expect(published.publicationStatus).toBe("published");
  });

  it("signs Cloudflare Stream playback tokens with RS256 and the signing key id", async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const adapter = new CloudflareStreamAdapter({
      accountId: "cf-account-99",
      apiToken: "cf-secret-api-token-value-123456",
      signingKeyId: "cf-signing-key-id-1",
      signingPrivateKey: privatePem,
      webhookSecret: "cf-webhook-secret-key-12345",
    });

    const now = new Date("2026-10-31T12:00:00Z");
    const descriptor = await adapter.createSignedPlaybackDescriptor({
      providerAssetId: "stream-asset-abc",
      workspaceId: "ws-1",
      videoId: "vid-1",
      viewerKey: `portal:student:${ENROLLED_STUDENT}`,
      ttlSeconds: 600,
      durationSeconds: 900,
      now,
    });

    expect(descriptor.provider).toBe("cloudflare_stream");
    expect(descriptor.embedUrl).toContain("iframe.videodelivery.net/");
    expect(descriptor.embedUrl).not.toContain("cf-secret-api-token-value-123456");
    expect(descriptor.embedUrl).not.toContain("BEGIN PRIVATE KEY");
    expect(descriptor.expiresAt).toBe("2026-10-31T12:10:00.000Z");

    const [encodedHeader, encodedBody, encodedSignature] = descriptor.signedToken.split(".");
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString()) as {
      alg: string;
      kid: string;
    };
    const body = JSON.parse(Buffer.from(encodedBody, "base64url").toString()) as {
      sub: string;
      kid: string;
    };
    expect(header.alg).toBe("RS256");
    expect(header.kid).toBe("cf-signing-key-id-1");
    expect(body.sub).toBe("stream-asset-abc");
    expect(body.kid).toBe("cf-signing-key-id-1");
    expect(
      crypto.verify(
        "RSA-SHA256",
        Buffer.from(`${encodedHeader}.${encodedBody}`),
        publicKey,
        Buffer.from(encodedSignature, "base64url"),
      ),
    ).toBe(true);

    // A forged webhook signature is rejected.
    expect(
      adapter.verifyWebhook({
        rawBody: JSON.stringify({ uid: "stream-asset-abc", status: { state: "ready" } }),
        signatureHeader: "time=1730000000,sig1=deadbeef",
        now,
      }),
    ).toBeNull();

    // A correctly signed webhook is accepted.
    const rawBody = JSON.stringify({ uid: "stream-asset-abc", status: { state: "ready" } });
    const time = Math.floor(now.getTime() / 1000);
    const sig1 = crypto
      .createHmac("sha256", "cf-webhook-secret-key-12345")
      .update(`${time}.${rawBody}`)
      .digest("hex");
    expect(
      adapter.verifyWebhook({
        rawBody,
        signatureHeader: `time=${time},sig1=${sig1}`,
        now,
      }),
    ).toEqual({ providerAssetId: "stream-asset-abc", state: "ready" });

    // Without a configured webhook secret, no webhook is trusted.
    const noSecret = new CloudflareStreamAdapter({
      accountId: "cf-account-99",
      apiToken: "cf-secret-api-token-value-123456",
      signingKeyId: "cf-signing-key-id-1",
      signingPrivateKey: privatePem,
    });
    expect(
      noSecret.verifyWebhook({
        rawBody,
        signatureHeader: `time=${time},sig1=${sig1}`,
        now,
      }),
    ).toBeNull();
  });
});

describe("P3 Online Exams & Quizzes (F-P3-01)", () => {
  const windowStart = "2026-10-31T08:00:00.000Z";
  const windowEnd = "2026-10-31T20:00:00.000Z";
  const duringWindow = new Date("2026-10-31T10:00:00.000Z");
  const beforeWindow = new Date("2026-10-31T07:00:00.000Z");
  const afterWindow = new Date("2026-10-31T21:00:00.000Z");

  beforeEach(() => {
    state.exams.clear();
    state.attempts.clear();
    state.responses.clear();
    state.auditEvents.length = 0;
    state.assessmentScores.clear();
    state.lockedAssessments.clear();
  });

  it("normalizes Arabic and English short answers deterministically and evaluates all question types", () => {
    expect(normalizeShortAnswer("  الإجابةُ الصَّحيحة  ", false)).toBe("الاجابه الصحيحه");
    expect(normalizeShortAnswer("  Newton's   Law ", false)).toBe("newton's law");

    const mcq = evaluateSingleQuestion(
      {
        id: "q1",
        questionType: "mcq_single",
        points: 5,
        autoGradable: true,
        correctAnswerJson: { kind: "mcq_single", optionId: "b" },
      },
      { optionId: "b" },
    );
    expect(mcq).toEqual({
      questionId: "q1",
      isCorrect: true,
      autoAwardedPoints: 5,
      needsManualGrading: false,
    });

    const tf = evaluateSingleQuestion(
      {
        id: "q2",
        questionType: "true_false",
        points: 5,
        autoGradable: true,
        correctAnswerJson: { kind: "true_false", value: false },
      },
      { value: true },
    );
    expect(tf).toEqual({
      questionId: "q2",
      isCorrect: false,
      autoAwardedPoints: 0,
      needsManualGrading: false,
    });

    const shortAr = evaluateSingleQuestion(
      {
        id: "q3",
        questionType: "short_answer",
        points: 10,
        autoGradable: true,
        correctAnswerJson: {
          kind: "short_answer",
          acceptedAnswers: ["أحمد زويل"],
          caseSensitive: false,
        },
      },
      { text: "  احمد   زويل " },
    );
    expect(shortAr.isCorrect).toBe(true);
    expect(shortAr.autoAwardedPoints).toBe(10);

    const essay = evaluateSingleQuestion(
      {
        id: "q4",
        questionType: "essay",
        points: 15,
        autoGradable: false,
        correctAnswerJson: { kind: "manual" },
      },
      { text: "Free-response explanation of momentum conservation." },
    );
    expect(essay.needsManualGrading).toBe(true);
    expect(essay.autoAwardedPoints).toBeNull();
  });

  it("supports teacher preview, server-enforced availability windows, attempt limits, duplicate-submit protection, publish-gated results, and audited grade corrections", async () => {
    // 1. Teacher creates an exam with MCQ, True/False, Short Answer, and Essay
    const exam = await createOnlineExam(ownerScope, {
      groupId: GROUP_1,
      title: "Unit 3 Mechanics Quiz",
      description: "Covers Newton's laws and momentum",
      instructions: "Read each question carefully.",
      assignmentScope: "group",
      studentIds: [],
      availableFrom: windowStart,
      availableUntil: windowEnd,
      durationMinutes: 45,
      maxAttempts: 1,
      resultVisibility: "after_manual_publish",
      questions: [
        {
          questionType: "mcq_single",
          prompt: "What is the SI unit of force?",
          points: 5,
          options: [
            { id: "a", text: "Newton" },
            { id: "b", text: "Joule" },
          ],
          correctOptionId: "a",
          acceptedAnswers: [],
          caseSensitive: false,
          autoGradable: true,
          explanation: "1 N = 1 kg·m/s²",
        },
        {
          questionType: "true_false",
          prompt: "Momentum is a scalar quantity.",
          points: 5,
          options: [],
          correctBoolean: false,
          acceptedAnswers: [],
          caseSensitive: false,
          autoGradable: true,
          explanation: "Momentum is a vector.",
        },
        {
          questionType: "short_answer",
          prompt: "Name the scientist who formulated the three laws of motion.",
          points: 5,
          options: [],
          acceptedAnswers: ["Newton", "Isaac Newton", "نيوتن"],
          caseSensitive: false,
          autoGradable: true,
          explanation: null,
        },
        {
          questionType: "essay",
          prompt: "Explain why action and reaction forces do not cancel each other.",
          points: 5,
          options: [],
          acceptedAnswers: [],
          caseSensitive: false,
          autoGradable: false,
          explanation: "They act on two different bodies.",
        },
      ],
    });

    expect(exam.maxScore).toBe(20);
    expect(exam.status).toBe("draft");

    // Read-only assistant cannot publish exams
    await expect(
      updateOnlineExamLifecycle(
        readOnlyAssistantScope,
        exam.id,
        { action: "publish" },
        undefined,
        duringWindow,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // 2. Teacher previews before publishing (includes honesty boundary notice and questions)
    const preview = await previewOnlineExamForTeacher(ownerScope, exam.id);
    expect(preview.isTeacherPreview).toBe(true);
    expect(preview.exam.questions).toHaveLength(4);
    expect(preview.exam.honestyBoundaryKey).toBe(
      "Academics.onlineExams.honestyBoundaryNotice",
    );

    const qIds = preview.exam.questions.map((q) => q.id);

    // 3. Teacher publishes the exam
    const published = await updateOnlineExamLifecycle(
      ownerScope,
      exam.id,
      { action: "publish" },
      undefined,
      duringWindow,
    );
    expect(published.status).toBe("published");

    // 4. Student cannot start before availability window opens
    await expect(
      startStudentOnlineExamAttempt(
        enrolledStudentContext,
        exam.id,
        ENROLLED_STUDENT,
        undefined,
        beforeWindow,
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "errors.examWindowClosed",
    });

    // 5. Unassigned student cannot access or start the exam (404)
    await expect(
      startStudentOnlineExamAttempt(
        unassignedStudentContext,
        exam.id,
        UNASSIGNED_STUDENT,
        undefined,
        duringWindow,
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      messageKey: "errors.notFound",
    });

    // 6. Authenticated assigned student starts attempt during window; answer keys are never exposed in student list
    const studentListDuring = await listPortalStudentOnlineExams(
      enrolledStudentContext,
      ENROLLED_STUDENT,
      duringWindow,
    );
    expect(studentListDuring).toHaveLength(1);
    expect("correctAnswerJson" in studentListDuring[0]!.questions[0]!).toBe(false);

    const started = await startStudentOnlineExamAttempt(
      enrolledStudentContext,
      exam.id,
      ENROLLED_STUDENT,
      undefined,
      duringWindow,
    );
    expect(started.resumed).toBe(false);
    expect(started.attempt.attemptNumber).toBe(1);

    // 7. Student saves draft responses safely
    const saved = await saveStudentExamResponses(
      enrolledStudentContext,
      exam.id,
      started.attempt.id,
      {
        responses: [
          { questionId: qIds[0]!, answer: { optionId: "a" } },
          { questionId: qIds[1]!, answer: { value: false } },
          { questionId: qIds[2]!, answer: { text: "إسحاق نيوتن" } },
          { questionId: qIds[3]!, answer: { text: "Because they act on different objects." } },
        ],
      },
      ENROLLED_STUDENT,
      duringWindow,
    );
    expect(saved.savedCount).toBe(4);

    // 8. Student submits final attempt (updating q-3 to accepted answer "نيوتن")
    const submitted = await submitStudentOnlineExamAttempt(
      enrolledStudentContext,
      exam.id,
      started.attempt.id,
      {
        responses: [
          { questionId: qIds[0]!, answer: { optionId: "a" } },
          { questionId: qIds[1]!, answer: { value: false } },
          { questionId: qIds[2]!, answer: { text: "نيوتن" } },
          { questionId: qIds[3]!, answer: { text: "Because they act on different objects." } },
        ],
      },
      ENROLLED_STUDENT,
      undefined,
      duringWindow,
    );
    expect(submitted.alreadySubmitted).toBe(false);
    expect(submitted.attempt.status).toBe("manual_pending"); // essay requires manual review

    // 9. Accidental duplicate final submission is safely handled idempotently
    const duplicateSubmit = await submitStudentOnlineExamAttempt(
      enrolledStudentContext,
      exam.id,
      started.attempt.id,
      { responses: [] },
      ENROLLED_STUDENT,
      undefined,
      duringWindow,
    );
    expect(duplicateSubmit.alreadySubmitted).toBe(true);

    // 10. Student cannot exceed maxAttempts (1)
    await expect(
      startStudentOnlineExamAttempt(
        enrolledStudentContext,
        exam.id,
        ENROLLED_STUDENT,
        undefined,
        duringWindow,
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "errors.examMaxAttemptsReached",
    });

    // 11. Results are hidden from student before teacher publishes results
    const studentViewBeforePublish = await listPortalStudentOnlineExams(
      enrolledStudentContext,
      ENROLLED_STUDENT,
      afterWindow,
    );
    expect(studentViewBeforePublish[0]!.attempts[0]!.resultsReleased).toBe(false);
    expect(studentViewBeforePublish[0]!.attempts[0]!.totalScore).toBeNull();

    // 12. Teacher grades the attempt (including the essay question)
    const graded = await gradeOnlineExamAttempt(
      ownerScope,
      exam.id,
      started.attempt.id,
      {
        decisions: [
          { questionId: qIds[3]!, awardedPoints: 4, teacherFeedback: "Clear explanation" },
        ],
      },
      undefined,
      afterWindow,
    );
    expect(graded.totalScore).toBe(19);
    expect(state.auditEvents.some((e) => e.action === "exam.manually_graded")).toBe(true);

    // 13. Modifying an already-graded attempt requires a correction reason and writes exam.grade_corrected audit event
    await expect(
      gradeOnlineExamAttempt(
        ownerScope,
        exam.id,
        started.attempt.id,
        {
          decisions: [{ questionId: qIds[3]!, awardedPoints: 5 }],
        },
        undefined,
        afterWindow,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    const corrected = await gradeOnlineExamAttempt(
      ownerScope,
      exam.id,
      started.attempt.id,
      {
        decisions: [
          {
            questionId: qIds[3]!,
            awardedPoints: 5,
            teacherFeedback: "Full credit awarded on review",
          },
        ],
        reason: "Awarded full credit for Newton third law body diagram explanation",
      },
      undefined,
      afterWindow,
    );
    expect(corrected.totalScore).toBe(20);
    expect(
      state.auditEvents.some(
        (e) =>
          e.action === "exam.grade_corrected" &&
          (e.diff as { oldTotalScore: string; newTotalScore: string }).oldTotalScore === "19" &&
          (e.diff as { oldTotalScore: string; newTotalScore: string }).newTotalScore === "20",
      ),
    ).toBe(true);

    // 14. Teacher publishes results -> locks linked Assessment and makes score visible to student
    await updateOnlineExamLifecycle(
      ownerScope,
      exam.id,
      { action: "publish_results" },
      undefined,
      afterWindow,
    );
    expect(state.lockedAssessments.has(String(exam.assessmentId))).toBe(true);

    const studentViewAfterPublish = await listPortalStudentOnlineExams(
      enrolledStudentContext,
      ENROLLED_STUDENT,
      afterWindow,
    );
    expect(studentViewAfterPublish[0]!.attempts[0]!.resultsReleased).toBe(true);
    expect(studentViewAfterPublish[0]!.attempts[0]!.totalScore).toBe(20);
  });

  it("grading sync preserves an existing teacher note unless gradingNote is explicitly provided", async () => {
    // Essay-only exam: submission lands in manual_pending and never creates the linked score,
    // so we can seed a pre-existing AssessmentScore that carries a teacher note.
    const exam = await createOnlineExam(ownerScope, {
      groupId: GROUP_1,
      title: "Note Preservation Quiz",
      assignmentScope: "group",
      studentIds: [],
      availableFrom: windowStart,
      availableUntil: windowEnd,
      durationMinutes: 45,
      maxAttempts: 1,
      resultVisibility: "after_manual_publish",
      questions: [
        {
          questionType: "essay",
          prompt: "Explain why inertia occurs.",
          points: 10,
          options: [],
          acceptedAnswers: [],
          caseSensitive: false,
          autoGradable: false,
          explanation: null,
        },
      ],
    });

    await updateOnlineExamLifecycle(
      ownerScope,
      exam.id,
      { action: "publish" },
      undefined,
      duringWindow,
    );

    const preview = await previewOnlineExamForTeacher(ownerScope, exam.id);
    const qIds = preview.exam.questions.map((q) => q.id);

    const started = await startStudentOnlineExamAttempt(
      enrolledStudentContext,
      exam.id,
      ENROLLED_STUDENT,
      undefined,
      duringWindow,
    );

    const submitted = await submitStudentOnlineExamAttempt(
      enrolledStudentContext,
      exam.id,
      started.attempt.id,
      {
        responses: [
          { questionId: qIds[0]!, answer: { text: "An object resists changes to its motion." } },
        ],
      },
      ENROLLED_STUDENT,
      undefined,
      duringWindow,
    );
    expect(submitted.attempt.status).toBe("manual_pending");

    // A pre-existing linked AssessmentScore carries a teacher note (e.g. from manual scoring).
    const assessmentId = String(exam.assessmentId);
    state.assessmentScores.set(`${assessmentId}:${ENROLLED_STUDENT}`, {
      id: "score-note-preservation",
      assessmentId,
      studentId: ENROLLED_STUDENT,
      score: 6,
      status: "graded",
      note: "Teacher: strong participation in labs",
    });

    // 1. Grading without gradingNote preserves the existing teacher note
    const graded = await gradeOnlineExamAttempt(
      ownerScope,
      exam.id,
      started.attempt.id,
      { decisions: [{ questionId: qIds[0]!, awardedPoints: 8 }] },
      undefined,
      afterWindow,
    );
    expect(graded.totalScore).toBe(8);
    expect(state.assessmentScores.get(`${assessmentId}:${ENROLLED_STUDENT}`)?.score).toBe(8);
    expect(state.assessmentScores.get(`${assessmentId}:${ENROLLED_STUDENT}`)?.note).toBe(
      "Teacher: strong participation in labs",
    );

    // 2. Grading correction with a gradingNote updates the linked note
    const corrected = await gradeOnlineExamAttempt(
      ownerScope,
      exam.id,
      started.attempt.id,
      {
        decisions: [{ questionId: qIds[0]!, awardedPoints: 9 }],
        reason: "Re-reviewed essay and awarded additional credit",
        gradingNote: "Strong improvement after review",
      },
      undefined,
      afterWindow,
    );
    expect(corrected.totalScore).toBe(9);
    expect(state.assessmentScores.get(`${assessmentId}:${ENROLLED_STUDENT}`)?.note).toBe(
      "Strong improvement after review",
    );

    // 3. Grading correction without gradingNote still preserves the updated note
    const correctedAgain = await gradeOnlineExamAttempt(
      ownerScope,
      exam.id,
      started.attempt.id,
      {
        decisions: [{ questionId: qIds[0]!, awardedPoints: 10 }],
        reason: "Awarded full credit after department review",
      },
      undefined,
      afterWindow,
    );
    expect(correctedAgain.totalScore).toBe(10);
    expect(state.assessmentScores.get(`${assessmentId}:${ENROLLED_STUDENT}`)?.score).toBe(10);
    expect(state.assessmentScores.get(`${assessmentId}:${ENROLLED_STUDENT}`)?.note).toBe(
      "Strong improvement after review",
    );
  });

  it("concurrent submissions with different answers keep only winner responses", async () => {
    // Create a simple exam with two MCQ questions
    const exam = await createOnlineExam(ownerScope, {
      groupId: GROUP_1,
      title: "Race Condition Test",
      assignmentScope: "group",
      studentIds: [],
      availableFrom: "2026-10-31T08:00:00.000Z",
      availableUntil: "2026-10-31T20:00:00.000Z",
      durationMinutes: 30,
      maxAttempts: 1,
      resultVisibility: "immediate_after_submit",
      questions: [
        {
          questionType: "mcq_single",
          prompt: "Q1",
          points: 5,
          autoGradable: true,
          options: [{ id: "a", text: "Option A" }, { id: "b", text: "Option B" }],
          correctOptionId: "a",
          acceptedAnswers: [],
          caseSensitive: false,
          explanation: null,
        },
        {
          questionType: "mcq_single",
          prompt: "Q2",
          points: 5,
          autoGradable: true,
          options: [{ id: "a", text: "Option A" }, { id: "b", text: "Option B" }],
          correctOptionId: "a",
          acceptedAnswers: [],
          caseSensitive: false,
          explanation: null,
        },
      ],
    });

    await updateOnlineExamLifecycle(ownerScope, exam.id, { action: "publish" }, undefined, duringWindow);

    const preview = await previewOnlineExamForTeacher(ownerScope, exam.id);
    const qIds = preview.exam.questions.map((q) => q.id);
    const started = await startStudentOnlineExamAttempt(
      enrolledStudentContext,
      exam.id,
      ENROLLED_STUDENT,
      undefined,
      duringWindow,
    );
    expect(started.attempt.status).toBe("in_progress");

    // First submission: both questions answered correctly
    const first = await submitStudentOnlineExamAttempt(
      enrolledStudentContext,
      exam.id,
      started.attempt.id,
      {
        responses: [
          { questionId: qIds[0]!, answer: { optionId: "a" } },
          { questionId: qIds[1]!, answer: { optionId: "a" } },
        ],
      },
      ENROLLED_STUDENT,
      undefined,
      duringWindow,
    );
    expect(first.alreadySubmitted).toBe(false);
    expect(first.attempt.status).toBe("graded");

    // Second submission with different answers should be rejected as already submitted
    const second = await submitStudentOnlineExamAttempt(
      enrolledStudentContext,
      exam.id,
      started.attempt.id,
      {
        responses: [
          { questionId: qIds[0]!, answer: { optionId: "b" } },
          { questionId: qIds[1]!, answer: { optionId: "b" } },
        ],
      },
      ENROLLED_STUDENT,
      undefined,
      duringWindow,
    );
    expect(second.alreadySubmitted).toBe(true);

    // Verify saved responses belong entirely to the first (winning) submission
    const savedResponses = [...state.responses.values()].filter((r) => r.attemptId === started.attempt.id);
    expect(savedResponses).toHaveLength(2);
    const q0 = savedResponses.find((r) => r.questionId === qIds[0])!;
    const q1 = savedResponses.find((r) => r.questionId === qIds[1])!;
    expect((q0.answerJson as { optionId: string }).optionId).toBe("a");
    expect((q1.answerJson as { optionId: string }).optionId).toBe("a");
  });

  it("expired in-progress attempts are marked expired on next access", async () => {
    const exam = await createOnlineExam(ownerScope, {
      groupId: GROUP_1,
      title: "Expiry Test Exam",
      assignmentScope: "group",
      studentIds: [],
      availableFrom: "2026-10-31T08:00:00.000Z",
      availableUntil: "2026-10-31T20:00:00.000Z",
      durationMinutes: 2,
      maxAttempts: 2,
      resultVisibility: "immediate_after_submit",
      questions: [
        {
          questionType: "mcq_single",
          prompt: "Q1",
          points: 5,
          autoGradable: true,
          options: [{ id: "a", text: "Option A" }, { id: "b", text: "Option B" }],
          correctOptionId: "a",
          acceptedAnswers: [],
          caseSensitive: false,
          explanation: null,
        },
      ],
    });

    await updateOnlineExamLifecycle(ownerScope, exam.id, { action: "publish" }, undefined, duringWindow);

    const preview = await previewOnlineExamForTeacher(ownerScope, exam.id);
    const qIds = preview.exam.questions.map((q) => q.id);

    // Start first attempt - it will have deadline ~2 minutes from duringWindow
    const first = await startStudentOnlineExamAttempt(
      enrolledStudentContext,
      exam.id,
      ENROLLED_STUDENT,
      undefined,
      duringWindow,
    );
    expect(first.attempt.status).toBe("in_progress");

    // Simulate time passing past the first attempt's deadline
    const expiredAttempt = state.attempts.get(first.attempt.id);
    expiredAttempt!.deadlineAt = new Date("2026-10-31T09:59:00.000Z");
    state.attempts.set(first.attempt.id, expiredAttempt!);

    // Call startStudentOnlineExamAttempt again — it should mark the expired attempt as expired and create attempt #2
    const result = await startStudentOnlineExamAttempt(
      enrolledStudentContext,
      exam.id,
      ENROLLED_STUDENT,
      undefined,
      duringWindow,
    );

    // The old expired attempt should now be marked expired
    const updatedAttempt = state.attempts.get(first.attempt.id)!;
    expect(updatedAttempt.status).toBe("expired");

    // New attempt should have been created (attempt #2)
    expect(result.resumed).toBe(false);
    expect(result.attempt.attemptNumber).toBe(2);

    // Submit the new attempt to change its status from in_progress, freeing up the count
    // The submit function will evaluate MCQ and mark it submitted/graded
    const submitted = await submitStudentOnlineExamAttempt(
      enrolledStudentContext,
      exam.id,
      result.attempt.id,
      {
        responses: [
          { questionId: qIds[0]!, answer: { optionId: "a" } },
        ],
      },
      ENROLLED_STUDENT,
      undefined,
      duringWindow,
    );
    expect(submitted.alreadySubmitted).toBe(false);
    expect(submitted.attempt.status).toBe("graded");

    // Now the attempts are: #1 expired, #2 submitted/graded. Total attempts = 2.
    // Third start attempt should fail with maxAttemptsReached
    await expect(
      startStudentOnlineExamAttempt(
        enrolledStudentContext,
        exam.id,
        ENROLLED_STUDENT,
        undefined,
        duringWindow,
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "errors.examMaxAttemptsReached",
    });
  });

  it("expired attempt cannot be submitted", async () => {
    const exam = await createOnlineExam(ownerScope, {
      groupId: GROUP_1,
      title: "Submit Expiry Test",
      assignmentScope: "group",
      studentIds: [],
      availableFrom: "2026-10-31T08:00:00.000Z",
      availableUntil: "2026-10-31T20:00:00.000Z",
      durationMinutes: 5,
      maxAttempts: 1,
      resultVisibility: "immediate_after_submit",
      questions: [
        {
          questionType: "mcq_single",
          prompt: "Q1",
          points: 5,
          autoGradable: true,
          options: [{ id: "a", text: "Option A" }, { id: "b", text: "Option B" }],
          correctOptionId: "a",
          acceptedAnswers: [],
          caseSensitive: false,
          explanation: null,
        },
      ],
    });

    await updateOnlineExamLifecycle(ownerScope, exam.id, { action: "publish" }, undefined, duringWindow);

    const preview = await previewOnlineExamForTeacher(ownerScope, exam.id);
    const qIds = preview.exam.questions.map((q) => q.id);

    const started = await startStudentOnlineExamAttempt(
      enrolledStudentContext,
      exam.id,
      ENROLLED_STUDENT,
      undefined,
      duringWindow,
    );

    // Simulate deadline passing
    const expiredAttempt = state.attempts.get(started.attempt.id);
    expiredAttempt!.deadlineAt = new Date(Date.now() - 60_000);
    state.attempts.set(started.attempt.id, expiredAttempt!);

    // Submitting an expired attempt should return alreadySubmitted=true
    const result = await submitStudentOnlineExamAttempt(
      enrolledStudentContext,
      exam.id,
      started.attempt.id,
      {
        responses: [
          { questionId: qIds[0]!, answer: { optionId: "a" } },
        ],
      },
      ENROLLED_STUDENT,
      undefined,
      new Date(Date.now() + 120_000),
    );

    expect(result.alreadySubmitted).toBe(true);
    expect(result.attempt.status).toBe("expired");
  });
});
