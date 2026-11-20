import { Prisma } from "@/generated/prisma/client";
import { withScope, type DbTransactionClient } from "@/lib/db/scope";
import { newUuidV7 } from "@/lib/id";
import type { Scope } from "@/modules/tenancy/types";
import type {
  ManualTopicEvidenceRow,
  ScoreRecord,
  TopicEvidenceRow,
} from "./calculations";
import type {
  AcknowledgeRiskInput,
  BulkGradeRow,
  BulkGradesInput,
  ParentPerformanceReportQuery,
  PerformanceOverviewQuery,
  SaveReportNoteInput,
  SaveTopicResultsInput,
  StudentPerformanceQuery,
} from "./schemas";

export type PerformanceSettings = {
  enabled: boolean;
  minAssessments: number;
  averageBelowPercent: number;
  consecutiveDeclines: number;
  weakTopicPercent: number;
};

export type PerformanceScoreRow = ScoreRecord & {
  studentId: string;
  groupId: string;
  groupName: string;
  subjectId: string | null;
  subjectName: string | null;
  scoreValue: number | null;
};

export type PerformanceOverviewRaw = {
  settings: PerformanceSettings;
  groups: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
  students: Array<{ id: string; firstName: string; lastName: string; grade: string | null }>;
  scores: PerformanceScoreRow[];
  questionEvidence: TopicEvidenceRow[];
  manualEvidence: ManualTopicEvidenceRow[];
};

export type StudentPerformanceRaw = {
  settings: PerformanceSettings;
  student: { id: string; firstName: string; lastName: string; grade: string | null };
  scores: PerformanceScoreRow[];
  questionEvidence: TopicEvidenceRow[];
  manualEvidence: ManualTopicEvidenceRow[];
  riskStates: Array<{
    ruleKey: string;
    riskKey: string;
    status: string;
    note: string | null;
    acknowledgedAt: string;
    followUpId: string | null;
  }>;
  reportNotes: Array<{ id: string; body: string; createdAt: string }>;
};

export type ClassIntelligenceRaw = {
  settings: PerformanceSettings;
  group: { id: string; name: string; subjectId: string | null; subjectName: string | null };
  students: Array<{ studentId: string; name: string }>;
  scores: PerformanceScoreRow[];
  assessments: Array<{ id: string; title: string; date: string }>;
  questionEvidence: TopicEvidenceRow[];
  manualEvidence: ManualTopicEvidenceRow[];
};

export type ParentReportRaw = {
  settings: PerformanceSettings;
  student: { id: string; firstName: string; lastName: string; grade: string | null };
  teacherName: string;
  timezone: string;
  scores: PerformanceScoreRow[];
  questionEvidence: TopicEvidenceRow[];
  manualEvidence: ManualTopicEvidenceRow[];
  notes: Array<{ id: string; body: string; createdAt: string }>;
};

export function withPerformanceTransaction<T>(
  scope: Pick<Scope, "workspaceId">,
  fn: (tx: DbTransactionClient) => Promise<T>,
): Promise<T> {
  return withScope(scope, fn);
}

function dateBounds(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
  };
}

function settingsFrom(row: {
  performanceRiskEnabled: boolean;
  performanceRiskMinAssessments: number;
  performanceRiskAverageBelowPercent: number;
  performanceRiskConsecutiveDeclines: number;
  performanceRiskWeakTopicPercent: number;
}): PerformanceSettings {
  return {
    enabled: row.performanceRiskEnabled,
    minAssessments: row.performanceRiskMinAssessments,
    averageBelowPercent: row.performanceRiskAverageBelowPercent,
    consecutiveDeclines: row.performanceRiskConsecutiveDeclines,
    weakTopicPercent: row.performanceRiskWeakTopicPercent,
  };
}

const DEFAULT_SETTINGS: PerformanceSettings = {
  enabled: true,
  minAssessments: 3,
  averageBelowPercent: 60,
  consecutiveDeclines: 2,
  weakTopicPercent: 60,
};

async function findSettings(tx: DbTransactionClient, workspaceId: string): Promise<PerformanceSettings> {
  const row = await tx.workspaceSettings.findUnique({
    where: { workspaceId },
    select: {
      performanceRiskEnabled: true,
      performanceRiskMinAssessments: true,
      performanceRiskAverageBelowPercent: true,
      performanceRiskConsecutiveDeclines: true,
      performanceRiskWeakTopicPercent: true,
    },
  });
  return row ? settingsFrom(row) : DEFAULT_SETTINGS;
}

export async function loadPerformanceSettings(
  scope: Scope,
): Promise<PerformanceSettings> {
  return withScope(scope, async (tx) => {
    const row = await tx.workspaceSettings.findUnique({
      where: { workspaceId: scope.workspaceId },
      select: {
        performanceRiskEnabled: true,
        performanceRiskMinAssessments: true,
        performanceRiskAverageBelowPercent: true,
        performanceRiskConsecutiveDeclines: true,
        performanceRiskWeakTopicPercent: true,
      },
    });
    return row ? settingsFrom(row) : DEFAULT_SETTINGS;
  });
}

export async function savePerformanceSettingsTx(
  tx: DbTransactionClient,
  workspaceId: string,
  settings: PerformanceSettings,
) {
  return tx.workspaceSettings.update({
    where: { workspaceId },
    data: {
      performanceRiskEnabled: settings.enabled,
      performanceRiskMinAssessments: settings.minAssessments,
      performanceRiskAverageBelowPercent: settings.averageBelowPercent,
      performanceRiskConsecutiveDeclines: settings.consecutiveDeclines,
      performanceRiskWeakTopicPercent: settings.weakTopicPercent,
    },
    select: {
      performanceRiskEnabled: true,
      performanceRiskMinAssessments: true,
      performanceRiskAverageBelowPercent: true,
      performanceRiskConsecutiveDeclines: true,
      performanceRiskWeakTopicPercent: true,
    },
  });
}

type ScoreSelect = Prisma.AssessmentScoreGetPayload<{
  select: {
    id: true;
    studentId: true;
    score: true;
    status: true;
    assessment: {
      select: {
        id: true;
        title: true;
        type: true;
        date: true;
        maxScore: true;
        groupId: true;
        group: { select: { name: true; subjectId: true; subject: { select: { name: true } } } };
      };
    };
  };
}>;

function mapScore(row: ScoreSelect): PerformanceScoreRow {
  return {
    id: row.id,
    assessmentId: row.assessment.id,
    studentId: row.studentId,
    date: row.assessment.date.toISOString().slice(0, 10),
    status: row.status,
    score: row.score === null ? null : Number(row.score),
    scoreValue: row.score === null ? null : Number(row.score),
    maxScore: Number(row.assessment.maxScore),
    title: row.assessment.title,
    type: row.assessment.type,
    groupId: row.assessment.groupId,
    groupName: row.assessment.group.name,
    subjectId: row.assessment.group.subjectId,
    subjectName: row.assessment.group.subject?.name ?? null,
  };
}

const scoreSelect = {
  id: true,
  studentId: true,
  score: true,
  status: true,
  assessment: {
    select: {
      id: true,
      title: true,
      type: true,
      date: true,
      maxScore: true,
      groupId: true,
      group: {
        select: {
          name: true,
          subjectId: true,
          subject: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.AssessmentScoreSelect;

function searchWhere(q?: string): Prisma.StudentWhereInput | undefined {
  if (!q) return undefined;
  return {
    OR: [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { searchKey: { contains: q, mode: "insensitive" } },
      { phoneticKey: { contains: q, mode: "insensitive" } },
    ],
  };
}

function mapQuestionEvidence(
  rows: Array<{
    id: string;
    isCorrect: boolean | null;
    savedAt: Date;
    question: { id: string; topic: string | null; prompt: string };
    attempt: {
      studentId: string;
      exam: {
        assessment: { date: Date } | null;
        availableFrom: Date;
      };
    };
  }>,
): TopicEvidenceRow[] {
  return rows
    .filter((row) => row.question.topic && row.isCorrect !== null)
    .map((row) => ({
      topic: row.question.topic!,
      correct: row.isCorrect === true,
      responseId: row.id,
      questionId: row.question.id,
      at: (row.attempt.exam.assessment?.date ?? row.attempt.exam.availableFrom).toISOString(),
      studentId: row.attempt.studentId,
      prompt: row.question.prompt,
    }));
}

function mapManualEvidence(
  rows: Array<{
    id: string;
    studentId: string;
    assessmentId: string;
    topic: string;
    correctCount: number;
    incorrectCount: number;
    createdAt: Date;
    assessment: { date: Date };
  }>,
): ManualTopicEvidenceRow[] {
  return rows.map((row) => ({
    topic: row.topic,
    correctCount: row.correctCount,
    incorrectCount: row.incorrectCount,
    resultId: row.id,
    assessmentId: row.assessmentId,
    at: row.assessment.date.toISOString(),
    studentId: row.studentId,
  }));
}

export async function loadOverviewData(
  scope: Scope,
  query: PerformanceOverviewQuery,
): Promise<PerformanceOverviewRaw> {
  return withScope(scope, async (tx) => {
    const dateFilter = dateBounds(query.from, query.to);
    const [settings, groups, subjects, students] = await Promise.all([
      findSettings(tx, scope.workspaceId),
      tx.group.findMany({
        where: { workspaceId: scope.workspaceId, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      tx.subject.findMany({
        where: { workspaceId: scope.workspaceId, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      tx.student.findMany({
        where: {
          workspaceId: scope.workspaceId,
          archivedAt: null,
          ...(searchWhere(query.q) ?? {}),
        },
        select: { id: true, firstName: true, lastName: true, grade: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        take: 200,
      }),
    ]);

    const matchingStudentIds = students.map((student) => student.id);
    const studentFilter = query.q ? { studentId: { in: matchingStudentIds } } : {};
    const [scoreRows, responseRows, topicRows] = await Promise.all([
      tx.assessmentScore.findMany({
          where: {
            workspaceId: scope.workspaceId,
            ...(dateFilter
              ? { assessment: { date: dateFilter } }
              : {}),
            ...(query.groupId ? { assessment: { groupId: query.groupId } } : {}),
            ...(query.subjectId
              ? { assessment: { group: { subjectId: query.subjectId } } }
              : {}),
            ...studentFilter,
          },
          select: scoreSelect,
          orderBy: { assessment: { date: "desc" } },
          take: 20000,
        }),
        tx.onlineExamResponse.findMany({
          where: {
            workspaceId: scope.workspaceId,
            isCorrect: { not: null },
            question: { topic: { not: null } },
            attempt: {
              status: { in: ["submitted", "graded", "manual_pending"] },
              exam: {
                ...(query.groupId ? { groupId: query.groupId } : {}),
                ...(query.subjectId ? { group: { subjectId: query.subjectId } } : {}),
              },
            },
          },
          select: {
            id: true,
            isCorrect: true,
            savedAt: true,
            question: { select: { id: true, topic: true, prompt: true } },
            attempt: {
              select: {
                studentId: true,
                exam: {
                  select: {
                    assessment: { select: { date: true } },
                    availableFrom: true,
                  },
                },
              },
            },
          },
          take: 20000,
        }),
        tx.assessmentTopicResult.findMany({
          where: {
            workspaceId: scope.workspaceId,
            ...(query.groupId ? { assessment: { groupId: query.groupId } } : {}),
            ...(query.subjectId
              ? { assessment: { group: { subjectId: query.subjectId } } }
              : {}),
            ...(dateFilter ? { assessment: { date: dateFilter } } : {}),
          },
          select: {
            id: true,
            studentId: true,
            assessmentId: true,
            topic: true,
            correctCount: true,
            incorrectCount: true,
            createdAt: true,
            assessment: { select: { date: true } },
          },
          take: 20000,
        }),
      ]);

    const allowedStudentIds = new Set(matchingStudentIds);
    const filteredResponses = query.q
      ? responseRows.filter((row) => allowedStudentIds.has(row.attempt.studentId))
      : responseRows;
    const filteredManual = query.q
      ? topicRows.filter((row) => allowedStudentIds.has(row.studentId))
      : topicRows;

    const questionEvidence = mapQuestionEvidence(filteredResponses).filter((row) => {
      if (!dateFilter) return true;
      const at = new Date(row.at);
      return (!dateFilter.gte || at >= dateFilter.gte) && (!dateFilter.lte || at <= dateFilter.lte);
    });
    const manualEvidence = mapManualEvidence(filteredManual);

    return {
      settings,
      groups,
      subjects,
      students,
      scores: scoreRows.map(mapScore),
      questionEvidence,
      manualEvidence,
    };
  });
}

export async function loadStudentPerformanceData(
  scope: Scope,
  studentId: string,
  query: StudentPerformanceQuery,
): Promise<StudentPerformanceRaw | null> {
  return withScope(scope, async (tx) => {
    const student = await tx.student.findFirst({
      where: { id: studentId, workspaceId: scope.workspaceId, archivedAt: null },
      select: { id: true, firstName: true, lastName: true, grade: true },
    });
    if (!student) return null;

    const dateFilter = dateBounds(query.from, query.to);
    const [settings, scoreRows, responseRows, topicRows, riskStates, reportNotes] = await Promise.all([
      findSettings(tx, scope.workspaceId),
      tx.assessmentScore.findMany({
        where: {
          workspaceId: scope.workspaceId,
          studentId,
          ...(dateFilter ? { assessment: { date: dateFilter } } : {}),
          ...(query.type ? { assessment: { type: query.type } } : {}),
        },
        select: scoreSelect,
        orderBy: { assessment: { date: "asc" } },
        take: 5000,
      }),
      tx.onlineExamResponse.findMany({
        where: {
          workspaceId: scope.workspaceId,
          isCorrect: { not: null },
          question: { topic: { not: null } },
          attempt: {
            studentId,
            status: { in: ["submitted", "graded", "manual_pending"] },
            ...(query.type && query.type !== "quiz" ? { exam: { assessment: { type: query.type } } } : {}),
          },
        },
        select: {
          id: true,
          isCorrect: true,
          savedAt: true,
          question: { select: { id: true, topic: true, prompt: true } },
          attempt: {
            select: {
              studentId: true,
              exam: {
                select: {
                  assessment: { select: { date: true, type: true } },
                  availableFrom: true,
                },
              },
            },
          },
        },
        take: 10000,
      }),
      tx.assessmentTopicResult.findMany({
        where: {
          workspaceId: scope.workspaceId,
          studentId,
          ...(dateFilter ? { assessment: { date: dateFilter } } : {}),
          ...(query.type ? { assessment: { type: query.type } } : {}),
        },
        select: {
          id: true,
          studentId: true,
          assessmentId: true,
          topic: true,
          correctCount: true,
          incorrectCount: true,
          createdAt: true,
          assessment: { select: { date: true } },
        },
        take: 5000,
      }),
      tx.performanceRiskState.findMany({
        where: { workspaceId: scope.workspaceId, studentId },
        select: {
          ruleKey: true,
          riskKey: true,
          status: true,
          note: true,
          acknowledgedAt: true,
          followUpId: true,
        },
        orderBy: { acknowledgedAt: "desc" },
        take: 100,
      }),
      tx.performanceReportNote.findMany({
        where: { workspaceId: scope.workspaceId, studentId },
        select: { id: true, body: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    const questionEvidence = mapQuestionEvidence(responseRows as never).filter((row) => {
      if (!dateFilter) return true;
      const at = new Date(row.at);
      return (!dateFilter.gte || at >= dateFilter.gte) && (!dateFilter.lte || at <= dateFilter.lte);
    });

    return {
      settings,
      student,
      scores: scoreRows.map(mapScore),
      questionEvidence,
      manualEvidence: mapManualEvidence(topicRows),
      riskStates: riskStates.map((row) => ({
        ruleKey: row.ruleKey,
        riskKey: row.riskKey,
        status: row.status,
        note: row.note,
        acknowledgedAt: row.acknowledgedAt.toISOString(),
        followUpId: row.followUpId,
      })),
      reportNotes: reportNotes.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });
}

export async function loadClassIntelligenceData(
  scope: Scope,
  groupId: string,
  query: Omit<PerformanceOverviewQuery, "groupId" | "subjectId" | "q">,
): Promise<ClassIntelligenceRaw | null> {
  return withScope(scope, async (tx) => {
    const group = await tx.group.findFirst({
      where: { id: groupId, workspaceId: scope.workspaceId, archivedAt: null },
      select: {
        id: true,
        name: true,
        subjectId: true,
        subject: { select: { name: true } },
        enrollments: {
          where: { leftAt: null, student: { archivedAt: null } },
          select: {
            student: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
    if (!group) return null;

    const dateFilter = dateBounds(query.from, query.to);
    const [settings, scoreRows, assessments, responseRows, topicRows] = await Promise.all([
      findSettings(tx, scope.workspaceId),
      tx.assessmentScore.findMany({
        where: {
          workspaceId: scope.workspaceId,
          ...(dateFilter ? { assessment: { date: dateFilter } } : {}),
          assessment: { groupId },
        },
        select: scoreSelect,
        orderBy: { assessment: { date: "asc" } },
        take: 20000,
      }),
      tx.assessment.findMany({
        where: {
          workspaceId: scope.workspaceId,
          groupId,
          ...(dateFilter ? { date: dateFilter } : {}),
        },
        select: { id: true, title: true, date: true },
        orderBy: { date: "asc" },
        take: 1000,
      }),
      tx.onlineExamResponse.findMany({
        where: {
          workspaceId: scope.workspaceId,
          isCorrect: { not: null },
          question: { topic: { not: null } },
          attempt: {
            status: { in: ["submitted", "graded", "manual_pending"] },
            exam: { groupId },
          },
        },
        select: {
          id: true,
          isCorrect: true,
          savedAt: true,
          question: { select: { id: true, topic: true, prompt: true } },
          attempt: {
            select: {
              studentId: true,
              exam: {
                select: {
                  assessment: { select: { date: true } },
                  availableFrom: true,
                },
              },
            },
          },
        },
        take: 20000,
      }),
      tx.assessmentTopicResult.findMany({
        where: {
          workspaceId: scope.workspaceId,
          assessment: { groupId, ...(dateFilter ? { date: dateFilter } : {}) },
        },
        select: {
          id: true,
          studentId: true,
          assessmentId: true,
          topic: true,
          correctCount: true,
          incorrectCount: true,
          createdAt: true,
          assessment: { select: { date: true } },
        },
        take: 20000,
      }),
    ]);

    return {
      settings,
      group: {
        id: group.id,
        name: group.name,
        subjectId: group.subjectId,
        subjectName: group.subject?.name ?? null,
      },
      students: group.enrollments.map((enrollment) => ({
        studentId: enrollment.student.id,
        name: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
      })),
      scores: scoreRows.map(mapScore),
      assessments: assessments.map((assessment) => ({
        id: assessment.id,
        title: assessment.title,
        date: assessment.date.toISOString().slice(0, 10),
      })),
      questionEvidence: mapQuestionEvidence(responseRows as never).filter((row) => {
        if (!dateFilter) return true;
        const at = new Date(row.at);
        return (!dateFilter.gte || at >= dateFilter.gte) && (!dateFilter.lte || at <= dateFilter.lte);
      }),
      manualEvidence: mapManualEvidence(topicRows),
    };
  });
}

export type BulkGradeFormData = {
  group: { id: string; name: string; subjectName: string | null };
  students: Array<{ id: string; name: string }>;
  assessments: Array<{
    id: string;
    title: string;
    date: string;
    type: string;
    maxScore: number;
    extraCreditAllowance: number | null;
    lockedAt: string | null;
    scores: Array<{
      studentId: string;
      score: number | null;
      status: string;
      note: string | null;
    }>;
  }>;
};

export async function loadBulkGradeFormData(
  scope: Scope,
  groupId: string,
): Promise<BulkGradeFormData | null> {
  return withScope(scope, async (tx) => {
    const group = await tx.group.findFirst({
      where: { id: groupId, workspaceId: scope.workspaceId, archivedAt: null },
      select: {
        id: true,
        name: true,
        subject: { select: { name: true } },
        enrollments: {
          where: { leftAt: null, student: { archivedAt: null } },
          select: {
            student: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { enrolledAt: "asc" },
        },
        assessments: {
          orderBy: { date: "desc" },
          select: {
            id: true,
            title: true,
            date: true,
            type: true,
            maxScore: true,
            extraCreditAllowance: true,
            lockedAt: true,
            scores: {
              select: { studentId: true, score: true, status: true, note: true },
            },
          },
        },
      },
    });
    if (!group) return null;
    return {
      group: { id: group.id, name: group.name, subjectName: group.subject?.name ?? null },
      students: group.enrollments.map((entry) => ({
        id: entry.student.id,
        name: `${entry.student.firstName} ${entry.student.lastName}`.trim(),
      })),
      assessments: group.assessments.map((assessment) => ({
        id: assessment.id,
        title: assessment.title,
        date: assessment.date.toISOString().slice(0, 10),
        type: assessment.type,
        maxScore: Number(assessment.maxScore),
        extraCreditAllowance:
          assessment.extraCreditAllowance === null
            ? null
            : Number(assessment.extraCreditAllowance),
        lockedAt: assessment.lockedAt?.toISOString() ?? null,
        scores: assessment.scores.map((score) => ({
          studentId: score.studentId,
          score: score.score === null ? null : Number(score.score),
          status: score.status,
          note: score.note,
        })),
      })),
    };
  });
}

export type PaperAssessmentOption = {
  id: string;
  title: string;
  date: string;
  type: string;
  maxScore: number;
};

/** Unlocked non-quiz assessments on a student's active groups, for teacher topic observations. */
export async function loadPaperAssessmentsForStudent(
  scope: Scope,
  studentId: string,
): Promise<PaperAssessmentOption[]> {
  return withScope(scope, async (tx) => {
    const student = await tx.student.findFirst({
      where: { id: studentId, workspaceId: scope.workspaceId, archivedAt: null },
      select: { id: true },
    });
    if (!student) return [];

    const enrollments = await tx.enrollment.findMany({
      where: {
        workspaceId: scope.workspaceId,
        studentId,
        leftAt: null,
      },
      select: { groupId: true },
    });
    const groupIds = enrollments.map((entry) => entry.groupId);
    if (groupIds.length === 0) return [];

    const assessments = await tx.assessment.findMany({
      where: {
        workspaceId: scope.workspaceId,
        groupId: { in: groupIds },
        type: { not: "quiz" },
        lockedAt: null,
      },
      select: {
        id: true,
        title: true,
        date: true,
        type: true,
        maxScore: true,
      },
      orderBy: { date: "desc" },
      take: 100,
    });
    return assessments.map((assessment) => ({
      id: assessment.id,
      title: assessment.title,
      date: assessment.date.toISOString().slice(0, 10),
      type: assessment.type,
      maxScore: Number(assessment.maxScore),
    }));
  });
}

export async function findPerformanceAssessmentTx(
  tx: DbTransactionClient,
  workspaceId: string,
  assessmentId: string,
) {
  return tx.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    select: {
      id: true,
      groupId: true,
      title: true,
      type: true,
      date: true,
      maxScore: true,
      extraCreditAllowance: true,
      lockedAt: true,
    },
  });
}

export async function findDuplicateAssessmentTx(
  tx: DbTransactionClient,
  workspaceId: string,
  groupId: string,
  title: string,
  date: string,
) {
  return tx.assessment.findFirst({
    where: {
      workspaceId,
      groupId,
      date: new Date(`${date}T00:00:00.000Z`),
      title: { equals: title, mode: "insensitive" },
    },
    select: { id: true, title: true },
  });
}

export async function findActiveRosterTx(
  tx: DbTransactionClient,
  workspaceId: string,
  groupId: string,
) {
  return tx.enrollment.findMany({
    where: {
      workspaceId,
      groupId,
      leftAt: null,
      student: { archivedAt: null },
    },
    select: { studentId: true },
  });
}

export async function findScoresForAssessmentTx(
  tx: DbTransactionClient,
  workspaceId: string,
  assessmentId: string,
) {
  return tx.assessmentScore.findMany({
    where: { workspaceId, assessmentId },
    select: { id: true, studentId: true, score: true, status: true, note: true },
  });
}

export async function createPerformanceAssessmentTx(
  tx: DbTransactionClient,
  input: {
    id: string;
    workspaceId: string;
    groupId: string;
    title: string;
    type: BulkGradesInput["type"];
    date: string;
    maxScore: number;
    extraCreditAllowance: number | null;
  },
) {
  return tx.assessment.create({
    data: {
      id: input.id,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      title: input.title,
      type: input.type,
      date: new Date(`${input.date}T00:00:00.000Z`),
      maxScore: input.maxScore,
      extraCreditAllowance: input.extraCreditAllowance,
    },
    select: { id: true },
  });
}

export async function updatePerformanceAssessmentTx(
  tx: DbTransactionClient,
  input: {
    workspaceId: string;
    assessmentId: string;
    title: string;
    type: BulkGradesInput["type"];
    date: string;
    maxScore: number;
    extraCreditAllowance: number | null;
  },
) {
  return tx.assessment.updateMany({
    where: { workspaceId: input.workspaceId, id: input.assessmentId },
    data: {
      title: input.title,
      type: input.type,
      date: new Date(`${input.date}T00:00:00.000Z`),
      maxScore: input.maxScore,
      extraCreditAllowance: input.extraCreditAllowance,
    },
  });
}

export async function upsertBulkScoreTx(
  tx: DbTransactionClient,
  input: {
    workspaceId: string;
    assessmentId: string;
    row: BulkGradeRow;
    actorUserId: string;
  },
): Promise<"created" | "updated" | "unchanged"> {
  const existing = await tx.assessmentScore.findUnique({
    where: {
      assessmentId_studentId: {
        assessmentId: input.assessmentId,
        studentId: input.row.studentId,
      },
    },
    select: { id: true, score: true, status: true, note: true },
  });
  const nextScore = input.row.status === "graded" ? (input.row.score ?? null) : null;
  const nextNote = input.row.note ?? null;
  if (
    existing &&
    Number(existing.score ?? null) === nextScore &&
    existing.status === input.row.status &&
    existing.note === nextNote
  ) {
    return "unchanged";
  }

  await tx.assessmentScore.upsert({
    where: {
      assessmentId_studentId: {
        assessmentId: input.assessmentId,
        studentId: input.row.studentId,
      },
    },
    create: {
      id: newUuidV7(),
      workspaceId: input.workspaceId,
      assessmentId: input.assessmentId,
      studentId: input.row.studentId,
      score: nextScore,
      status: input.row.status,
      note: nextNote,
      updatedBy: input.actorUserId,
    },
    update: {
      score: nextScore,
      status: input.row.status,
      note: nextNote,
      updatedBy: input.actorUserId,
    },
  });
  return existing ? "updated" : "created";
}

export async function saveTopicResultsTx(
  tx: DbTransactionClient,
  input: SaveTopicResultsInput & {
    workspaceId: string;
    studentId: string;
    actorUserId: string;
  },
) {
  for (const topic of input.topics) {
    await tx.assessmentTopicResult.upsert({
      where: {
        assessmentId_studentId_topic: {
          assessmentId: input.assessmentId,
          studentId: input.studentId,
          topic: topic.topic,
        },
      },
      create: {
        id: newUuidV7(),
        workspaceId: input.workspaceId,
        assessmentId: input.assessmentId,
        studentId: input.studentId,
        topic: topic.topic,
        correctCount: topic.correctCount,
        incorrectCount: topic.incorrectCount,
        updatedBy: input.actorUserId,
      },
      update: {
        correctCount: topic.correctCount,
        incorrectCount: topic.incorrectCount,
        updatedBy: input.actorUserId,
      },
    });
  }
}

export async function saveReportNoteTx(
  tx: DbTransactionClient,
  input: SaveReportNoteInput & { workspaceId: string; actorUserId: string },
) {
  return tx.performanceReportNote.create({
    data: {
      id: newUuidV7(),
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      body: input.body,
      authorId: input.actorUserId,
    },
    select: { id: true, createdAt: true },
  });
}

export async function acknowledgeRiskTx(
  tx: DbTransactionClient,
  input: AcknowledgeRiskInput & {
    workspaceId: string;
    actorUserId: string;
    actorDisplayName: string;
    followUpId: string | null;
  },
) {
  return tx.performanceRiskState.upsert({
    where: {
      workspaceId_riskKey: {
        workspaceId: input.workspaceId,
        riskKey: input.riskKey,
      },
    },
    create: {
      id: newUuidV7(),
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      ruleKey: input.ruleKey,
      riskKey: input.riskKey,
      note: input.note ?? null,
      followUpId: input.followUpId,
      acknowledgedBy: input.actorUserId,
    },
    update: {
      studentId: input.studentId,
      ruleKey: input.ruleKey,
      note: input.note ?? null,
      followUpId: input.followUpId,
      acknowledgedBy: input.actorUserId,
      acknowledgedAt: new Date(),
    },
    select: { id: true, acknowledgedAt: true },
  });
}

export async function createLinkedFollowUpTx(
  tx: DbTransactionClient,
  input: {
    id: string;
    workspaceId: string;
    studentId: string;
    actorUserId: string;
    actorDisplayName: string;
    title: string;
    note: string | null;
    dueAt: Date | null;
  },
) {
  await tx.studentFollowUp.create({
    data: {
      id: input.id,
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      ownerUserId: input.actorUserId,
      title: input.title,
      note: input.note,
      dueAt: input.dueAt,
      status: "open",
      createdBy: input.actorUserId,
    },
  });
  await tx.studentFollowUpEvent.create({
    data: {
      id: newUuidV7(),
      workspaceId: input.workspaceId,
      followUpId: input.id,
      actorUserId: input.actorUserId,
      actorDisplayName: input.actorDisplayName,
      action: "created",
    },
  });
}

export async function loadParentReportData(
  workspaceId: string,
  studentId: string,
  query: ParentPerformanceReportQuery,
): Promise<ParentReportRaw | null> {
  return withScope({ workspaceId }, async (tx) => {
    const student = await tx.student.findFirst({
      where: { id: studentId, workspaceId, archivedAt: null },
      select: { id: true, firstName: true, lastName: true, grade: true },
    });
    if (!student) return null;

    const [workspace, settings, scoreRows, responseRows, topicRows, notes] = await Promise.all([
      tx.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true, teachingName: true, settings: { select: { timezone: true } } },
      }),
      findSettings(tx, workspaceId),
      tx.assessmentScore.findMany({
        where: {
          workspaceId,
          studentId,
          status: "graded",
          assessment: {
            lockedAt: { not: null },
            ...(query.from || query.to
              ? { date: dateBounds(query.from, query.to) ?? {} }
              : {}),
          },
        },
        select: scoreSelect,
        orderBy: { assessment: { date: "asc" } },
        take: 1000,
      }),
      tx.onlineExamResponse.findMany({
        where: {
          workspaceId,
          isCorrect: { not: null },
          question: { topic: { not: null } },
          attempt: {
            studentId,
            status: { in: ["submitted", "graded", "manual_pending"] },
            exam: { resultsPublishedAt: { not: null } },
          },
        },
        select: {
          id: true,
          isCorrect: true,
          savedAt: true,
          question: { select: { id: true, topic: true, prompt: true } },
          attempt: {
            select: {
              studentId: true,
              exam: {
                select: {
                  assessment: { select: { date: true } },
                  availableFrom: true,
                },
              },
            },
          },
        },
        take: 10000,
      }),
      tx.assessmentTopicResult.findMany({
        where: {
          workspaceId,
          studentId,
          ...(query.from || query.to
            ? { assessment: { date: dateBounds(query.from, query.to) ?? {} } }
            : {}),
          assessment: { lockedAt: { not: null } },
        },
        select: {
          id: true,
          studentId: true,
          assessmentId: true,
          topic: true,
          correctCount: true,
          incorrectCount: true,
          createdAt: true,
          assessment: { select: { date: true } },
        },
        take: 5000,
      }),
      tx.performanceReportNote.findMany({
        where: { workspaceId, studentId },
        select: { id: true, body: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const dateFilter = dateBounds(query.from, query.to);
    const questionEvidence = mapQuestionEvidence(responseRows as never).filter((row) => {
      if (!dateFilter) return true;
      const at = new Date(row.at);
      return (!dateFilter.gte || at >= dateFilter.gte) && (!dateFilter.lte || at <= dateFilter.lte);
    });

    return {
      settings,
      student,
      teacherName: workspace?.teachingName ?? workspace?.name ?? "",
      timezone: workspace?.settings?.timezone ?? "Africa/Cairo",
      scores: scoreRows.map(mapScore),
      questionEvidence,
      manualEvidence: mapManualEvidence(topicRows),
      notes: notes.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });
}
