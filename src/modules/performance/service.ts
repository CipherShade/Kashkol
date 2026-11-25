import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { writeAuditEvent } from "@/modules/audit/service";
import { resolvePortalStudent, type PortalContext } from "@/modules/identity/session";
import { resolvePortalPermissions } from "@/modules/portals/tokens";
import {
  generateReportXlsx,
  getPdfRendererAdapter,
  renderReportPdfHtml,
} from "@/modules/reports/adapters";
import { reportExportContentType, reportExportExtension } from "@/modules/reports/formats";
import { authorize, isAllowed, type Scope } from "@/modules/tenancy/types";
import {
  aggregateTopicEvidence,
  buildClassIntelligence,
  classifyTrend,
  evaluateRiskRules,
  selectStrongTopics,
  selectWeakTopics,
  summarizeScores,
  type ComputedRisk,
  type RiskConfig,
  type StudentScoreSummary,
  type TopicAggregate,
  type TrendResult,
} from "./calculations";
import {
  assessmentValue,
  attendanceValue,
  buildProgressSeries,
  homeworkCompletionValue,
  type ProgressSeries,
} from "./progress";
import {
  buildParentReportCsv,
  buildParentReportTable,
  type ParentReportData,
  type ParentReportLabels,
} from "./parent-report";
import {
  acknowledgeRiskTx,
  createLinkedFollowUpTx,
  createPerformanceAssessmentTx,
  findActiveRosterTx,
  loadBulkGradeFormData,
  findDuplicateAssessmentTx,
  findPerformanceAssessmentTx,
  findScoresForAssessmentTx,
  loadClassIntelligenceData,
  loadOverviewData,
  loadPaperAssessmentsForStudent,
  loadPerformanceSettings,
  loadParentReportData,
  loadStudentPerformanceData,
  loadStudentProgressData,
  savePerformanceSettingsTx,
  saveReportNoteTx,
  saveTopicResultsTx,
  updatePerformanceAssessmentTx,
  upsertBulkScoreTx,
  withPerformanceTransaction,
  type PerformanceScoreRow,
  type PerformanceSettings,
} from "./repository";
import {
  acknowledgeRiskSchema,
  classIntelligenceQuerySchema,
  parentPerformanceReportQuerySchema,
  performanceOverviewQuerySchema,
  performanceSettingsSchema,
  saveReportNoteSchema,
  saveTopicResultsSchema,
  studentPerformanceQuerySchema,
  bulkGradesSchema,
  type AcknowledgeRiskInput,
  type BulkGradeRow,
  type BulkGradesInput,
  type ClassIntelligenceQuery,
  type ParentPerformanceReportQuery,
  type PerformanceOverviewQuery,
  type PerformanceSettingsInput,
  type SaveReportNoteInput,
  type SaveTopicResultsInput,
  type StudentPerformanceQuery,
} from "./schemas";

type RequestContext = { requestId?: string; ipHash?: string | null };

function auditContext(value?: RequestContext) {
  return { requestId: value?.requestId ?? newRequestId(), ipHash: value?.ipHash ?? null };
}

function period(from?: string, to?: string): { from: string; to: string } {
  return { from: from ?? "all", to: to ?? "all" };
}

function riskConfig(settings: PerformanceSettings): RiskConfig {
  return {
    enabled: settings.enabled,
    minAssessments: settings.minAssessments,
    averageBelowPercent: settings.averageBelowPercent,
    consecutiveDeclines: settings.consecutiveDeclines,
    weakTopicPercent: settings.weakTopicPercent,
  };
}

export async function getPerformanceSettings(scope: Scope): Promise<PerformanceSettings> {
  authorize(scope, "grades", "read");
  return loadPerformanceSettings(scope);
}

export async function updatePerformanceSettings(
  scope: Scope,
  input: PerformanceSettingsInput,
  req?: RequestContext,
): Promise<PerformanceSettings> {
  authorize(scope, "settings", "write");
  const payload = performanceSettingsSchema.parse(input);
  const ctx = auditContext(req);

  return withPerformanceTransaction(scope, async (tx) => {
    const saved = await savePerformanceSettingsTx(tx, scope.workspaceId, payload);
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "workspace_settings",
      entityId: scope.workspaceId,
      action: "performance.settings_updated",
      diff: {
        enabled: saved.performanceRiskEnabled,
        minAssessments: saved.performanceRiskMinAssessments,
        averageBelowPercent: saved.performanceRiskAverageBelowPercent,
        consecutiveDeclines: saved.performanceRiskConsecutiveDeclines,
        weakTopicPercent: saved.performanceRiskWeakTopicPercent,
      },
      ...ctx,
    });
    return settingsFromRow(saved);
  });
}

function settingsFromRow(row: {
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

function byStudent(scores: readonly PerformanceScoreRow[]): Map<string, PerformanceScoreRow[]> {
  const map = new Map<string, PerformanceScoreRow[]>();
  for (const score of scores) {
    map.set(score.studentId, [...(map.get(score.studentId) ?? []), score]);
  }
  return map;
}

function studentName(
  student: { firstName: string; lastName: string },
): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

function risksForStudent(
  studentId: string,
  from: string | undefined,
  to: string | undefined,
  settings: PerformanceSettings,
  summary: StudentScoreSummary,
  trend: TrendResult,
  topics: readonly TopicAggregate[],
): ComputedRisk[] {
  const bounds = period(from, to);
  return evaluateRiskRules({
    studentId,
    from: bounds.from,
    to: bounds.to,
    config: riskConfig(settings),
    summary,
    trend,
    topics,
  });
}

export async function getPerformanceOverview(scope: Scope, input: PerformanceOverviewQuery) {
  const query = performanceOverviewQuerySchema.parse(input);
  authorize(scope, "grades", "read");
  if (query.q) authorize(scope, "students", "read");

  const raw = await loadOverviewData(scope, query);
  const scoresByStudent = byStudent(raw.scores);
  const bounds = period(query.from, query.to);

  const overallSummary = summarizeScores(raw.scores, raw.settings.minAssessments);
  const overallTrend = classifyTrend(overallSummary, raw.scores, raw.settings.minAssessments);
  const topics = aggregateTopicEvidence(raw.questionEvidence, raw.manualEvidence);
  const weakTopics = selectWeakTopics(topics, raw.settings.weakTopicPercent);
  const students = raw.students.map((student) => {
    const scores = scoresByStudent.get(student.id) ?? [];
    const summary = summarizeScores(scores, raw.settings.minAssessments);
    const trend = classifyTrend(summary, scores, raw.settings.minAssessments);
    const studentTopics = aggregateTopicEvidence(
      raw.questionEvidence.filter((row) => row.studentId === student.id),
      raw.manualEvidence.filter((row) => row.studentId === student.id),
    );
    const risks = risksForStudent(
      student.id,
      bounds.from,
      bounds.to,
      raw.settings,
      summary,
      trend,
      studentTopics,
    );
    return {
      studentId: student.id,
      name: studentName(student),
      grade: student.grade,
      summary,
      trend,
      riskCount: risks.length,
      risks,
    };
  });

  const groupSummaries = raw.groups
    .map((group) => {
      const scores = raw.scores.filter((score) => score.groupId === group.id);
      const summary = summarizeScores(scores, raw.settings.minAssessments);
      return { groupId: group.id, groupName: group.name, summary, gradedCount: summary.gradedCount };
    })
    .filter((group) => group.gradedCount > 0);

  const assessmentVolume = new Map<string, { id: string; title: string; date: string; gradedCount: number }>();
  const assessmentAverages = new Map<string, { id: string; title: string; date: string; totalPercent: number; averagePercent: number; gradedCount: number }>();
  for (const score of raw.scores) {
    if (score.status !== "graded" || score.score === null || score.maxScore <= 0) continue;
    const existing = assessmentVolume.get(score.assessmentId) ?? {
      id: score.assessmentId,
      title: score.title ?? score.assessmentId,
      date: score.date,
      gradedCount: 0,
    };
    existing.gradedCount += 1;
    assessmentVolume.set(score.assessmentId, existing);

    const average = assessmentAverages.get(score.assessmentId) ?? {
      id: score.assessmentId,
      title: score.title ?? score.assessmentId,
      date: score.date,
      totalPercent: 0,
      averagePercent: 0,
      gradedCount: 0,
    };
    average.totalPercent += (score.score / score.maxScore) * 100;
    average.gradedCount += 1;
    average.averagePercent = Math.round((average.totalPercent / average.gradedCount) * 10) / 10;
    assessmentAverages.set(score.assessmentId, average);
  }

  const dataState =
    raw.scores.length === 0
      ? "no_data"
      : overallSummary.insufficientData
        ? "insufficient_data"
        : "ready";

  return {
    settings: raw.settings,
    filters: { ...query, from: bounds.from, to: bounds.to },
    dataState,
    groups: raw.groups,
    subjects: raw.subjects,
    students: raw.students.map((student) => ({
      id: student.id,
      name: studentName(student),
      grade: student.grade,
    })),
    overall: {
      summary: overallSummary,
      trend: overallTrend,
      assessmentCount: assessmentVolume.size,
      gradedResultCount: overallSummary.gradedCount,
      atRiskStudentCount: students.filter((student) => student.riskCount > 0).length,
      insufficientDataStudentCount: students.filter((student) => student.summary.insufficientData).length,
      studentCount: students.length,
    },
    groupSummaries,
    assessmentVolume: [...assessmentVolume.values()].sort((left, right) => right.date.localeCompare(left.date)),
    assessmentAverages: [...assessmentAverages.values()]
      .map(({ totalPercent: _totalPercent, ...average }) => average)
      .sort((left, right) => left.date.localeCompare(right.date)),
    topics,
    weakTopics,
    studentSummaries: students,
  };
}

export async function getStudentPerformance(
  scope: Scope,
  studentId: string,
  input: StudentPerformanceQuery,
) {
  authorize(scope, "grades", "read");
  const query = studentPerformanceQuerySchema.parse(input);
  const raw = await loadStudentPerformanceData(scope, studentId, query);
  if (!raw) throw new AppError("NOT_FOUND");

  const summary = summarizeScores(raw.scores, raw.settings.minAssessments);
  const trend = classifyTrend(summary, raw.scores, raw.settings.minAssessments);
  const topics = aggregateTopicEvidence(raw.questionEvidence, raw.manualEvidence);
  const risks = risksForStudent(
    studentId,
    query.from,
    query.to,
    raw.settings,
    summary,
    trend,
    topics,
  );
  const states = new Map(raw.riskStates.map((state) => [state.riskKey, state]));

  const history = [...raw.scores]
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
    .map((score, index) => ({
      assessmentId: score.assessmentId,
      title: score.title ?? score.assessmentId,
      type: score.type ?? null,
      groupName: score.groupName,
      date: score.date,
      status: score.status,
      score: score.score,
      maxScore: score.maxScore,
      percent:
        score.status === "graded" && score.score !== null && score.maxScore > 0
          ? Math.round((score.score / score.maxScore) * 1000) / 10
          : null,
      changePercent: index === 0 ? null : (summary.consecutiveChanges[index - 1] ?? null),
    }));

  return {
    settings: raw.settings,
    query: { ...query, from: period(query.from, query.to).from, to: period(query.from, query.to).to },
    student: { ...raw.student, name: studentName(raw.student) },
    dataState:
      raw.scores.length === 0
        ? "no_data"
        : summary.insufficientData
          ? "insufficient_data"
          : "ready",
    summary,
    trend,
    topics,
    weakTopics: selectWeakTopics(topics, raw.settings.weakTopicPercent),
    strongTopics: selectStrongTopics(topics),
    risks: risks.map((risk) => ({
      ...risk,
      state: states.get(risk.riskKey) ?? null,
    })),
    reportNotes: raw.reportNotes,
    history,
    changedAssessmentCount: summary.consecutiveChanges.filter((change) => change !== 0).length,
  };
}

/**
 * F-P2-06 AC-1/AC-2: three read-time series. A source the viewer may not read
 * is returned as `null`, never as an empty or fabricated series (ADR-0040).
 */
export async function getStudentProgress(
  scope: Scope,
  studentId: string,
  input: StudentPerformanceQuery,
): Promise<{
  student: { id: string; name: string; grade: string | null };
  query: { from: string | null; to: string | null };
  sources: { attendance: boolean; assessment: boolean; homework: boolean };
  series: {
    attendance: ProgressSeries | null;
    assessment: ProgressSeries | null;
    homework: ProgressSeries | null;
  };
}> {
  authorize(scope, "students", "read");
  const query = studentPerformanceQuerySchema.parse(input);
  const sources = {
    attendance: isAllowed(scope, "attendance", "read"),
    assessment: isAllowed(scope, "grades", "read"),
    homework: isAllowed(scope, "homework", "read"),
  };
  const raw = await loadStudentProgressData(scope, studentId, query, sources);
  if (!raw) throw new AppError("NOT_FOUND");

  const attendance = sources.attendance
    ? buildProgressSeries(
        raw.attendance.flatMap((row) => {
          const value = attendanceValue(row.mark);
          return value === null ? [] : [{ date: row.date, value }];
        }),
      )
    : null;
  const assessment = sources.assessment
    ? buildProgressSeries(
        raw.scores.flatMap((row) => {
          const value = assessmentValue(row.status, row.score, row.maxScore);
          return value === null ? [] : [{ date: row.date, value }];
        }),
      )
    : null;
  const homework = sources.homework
    ? buildProgressSeries(
        raw.homework.flatMap((row) => {
          const value = homeworkCompletionValue(
            row.completed === null ? "unknown" : row.completed ? "completed" : "not_completed",
          );
          return value === null ? [] : [{ date: row.date, value: value ? 100 : 0 }];
        }),
      )
    : null;

  return {
    student: {
      id: raw.student.id,
      name: studentName(raw.student),
      grade: raw.student.grade,
    },
    query: { from: query.from ?? null, to: query.to ?? null },
    sources,
    series: { attendance, assessment, homework },
  };
}

export async function getClassIntelligence(scope: Scope, input: ClassIntelligenceQuery) {
  authorize(scope, "grades", "read");
  const query = classIntelligenceQuerySchema.parse(input);
  const raw = await loadClassIntelligenceData(scope, query.groupId, query);
  if (!raw) throw new AppError("NOT_FOUND");

  const scoresByStudent = byStudent(raw.scores);
  const students = raw.students.map((student) => {
    const scores = scoresByStudent.get(student.studentId) ?? [];
    const summary = summarizeScores(scores, raw.settings.minAssessments);
    return {
      studentId: student.studentId,
      name: student.name,
      summary,
      trend: classifyTrend(summary, scores, raw.settings.minAssessments),
    };
  });

  const intelligence = buildClassIntelligence({
    students,
    assessments: raw.assessments.map((assessment) => ({
      ...assessment,
      results: raw.scores.filter((score) => score.assessmentId === assessment.id),
    })),
    questionEvidence: raw.questionEvidence,
    manualEvidence: raw.manualEvidence,
  });

  return {
    settings: raw.settings,
    group: raw.group,
    query,
    ...intelligence,
  };
}

export async function getBulkGradeFormData(scope: Scope, groupId: string) {
  authorize(scope, "grades", "read");
  authorize(scope, "students", "read");
  const data = await loadBulkGradeFormData(scope, groupId);
  if (!data) throw new AppError("NOT_FOUND");
  return data;
}

export async function getPerformancePaperAssessments(scope: Scope, studentId: string) {
  authorize(scope, "grades", "write");
  authorize(scope, "students", "read");
  return loadPaperAssessmentsForStudent(scope, studentId);
}

export async function acknowledgeRisk(
  scope: Scope,
  input: AcknowledgeRiskInput,
  req?: RequestContext,
) {
  authorize(scope, "grades", "write");
  authorize(scope, "students", "read");
  const payload = acknowledgeRiskSchema.parse(input);
  const profile = await getStudentPerformance(scope, payload.studentId, {
    from: payload.from,
    to: payload.to,
  });
  const risk = profile.risks.find(
    (candidate) => candidate.ruleKey === payload.ruleKey && candidate.riskKey === payload.riskKey,
  );
  if (!risk) {
    throw new AppError("CONFLICT", { messageKey: "Performance.errors.staleRisk" });
  }

  const ctx = auditContext(req);
  const followUpId = payload.createFollowUp ? newUuidV7() : null;

  return withPerformanceTransaction(scope, async (tx) => {
    if (followUpId) {
      await createLinkedFollowUpTx(tx, {
        id: followUpId,
        workspaceId: scope.workspaceId,
        studentId: payload.studentId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        title: payload.title,
        note: payload.note ?? null,
        dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
      });
    }

    const state = await acknowledgeRiskTx(tx, {
      ...payload,
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      followUpId,
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "performance_risk",
      entityId: state.id,
      action: "performance.risk_acknowledged",
      diff: {
        studentId: payload.studentId,
        ruleKey: payload.ruleKey,
        riskKey: payload.riskKey,
        from: period(payload.from, payload.to).from,
        to: period(payload.from, payload.to).to,
        followUpCreated: Boolean(followUpId),
        hasNote: Boolean(payload.note),
      },
      ...ctx,
    });

    return { id: state.id, followUpId, acknowledgedAt: state.acknowledgedAt.toISOString() };
  });
}

export async function saveTopicResults(
  scope: Scope,
  studentId: string,
  input: SaveTopicResultsInput,
  req?: RequestContext,
) {
  authorize(scope, "grades", "write");
  authorize(scope, "students", "read");
  const payload = saveTopicResultsSchema.parse(input);
  const ctx = auditContext(req);

  return withPerformanceTransaction(scope, async (tx) => {
    const assessment = await findPerformanceAssessmentTx(tx, scope.workspaceId, payload.assessmentId);
    if (!assessment || assessment.groupId === undefined) throw new AppError("NOT_FOUND");
    if (assessment.type === "quiz") {
      throw new AppError("CONFLICT", { messageKey: "Performance.errors.paperOnly" });
    }
    if (assessment.lockedAt) {
      throw new AppError("CONFLICT", { messageKey: "errors.assessmentLocked" });
    }
    const active = await findActiveRosterTx(tx, scope.workspaceId, assessment.groupId);
    if (!active.some((entry) => entry.studentId === studentId)) {
      throw new AppError("NOT_FOUND");
    }

    await saveTopicResultsTx(tx, {
      ...payload,
      workspaceId: scope.workspaceId,
      studentId,
      actorUserId: scope.actorUserId,
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "assessment_topic_result",
      entityId: payload.assessmentId,
      action: "performance.topic_results_saved",
      diff: {
        studentId,
        assessmentId: payload.assessmentId,
        topicCount: payload.topics.length,
        observationCount: payload.topics.reduce(
          (total, topic) => total + topic.correctCount + topic.incorrectCount,
          0,
        ),
      },
      ...ctx,
    });
    return { saved: payload.topics.length };
  });
}

export async function saveReportNote(
  scope: Scope,
  input: SaveReportNoteInput,
  req?: RequestContext,
) {
  authorize(scope, "grades", "write");
  authorize(scope, "students", "read");
  const payload = saveReportNoteSchema.parse(input);
  const ctx = auditContext(req);

  return withPerformanceTransaction(scope, async (tx) => {
    const student = await tx.student.findFirst({
      where: { id: payload.studentId, workspaceId: scope.workspaceId, archivedAt: null },
      select: { id: true },
    });
    if (!student) throw new AppError("NOT_FOUND");

    const note = await saveReportNoteTx(tx, {
      ...payload,
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "performance_report_note",
      entityId: note.id,
      action: "performance.report_note_saved",
      diff: {
        studentId: payload.studentId,
        hasBody: true,
      },
      ...ctx,
    });
    return { id: note.id, createdAt: note.createdAt.toISOString() };
  });
}

export type BulkGradeRowResult = {
  studentId: string;
  outcome: "saved" | "updated" | "unchanged" | "skipped";
  reasonKey?: string;
};

export async function saveBulkGrades(
  scope: Scope,
  input: BulkGradesInput,
  req?: RequestContext,
): Promise<{
  assessmentId: string | null;
  createdAssessment: boolean;
  results: BulkGradeRowResult[];
  savedCount: number;
  skippedCount: number;
}> {
  authorize(scope, "grades", "write");
  authorize(scope, "students", "read");
  const payload = bulkGradesSchema.parse(input);
  const ctx = auditContext(req);

  return withPerformanceTransaction(scope, async (tx) => {
    const group = await tx.group.findFirst({
      where: { id: payload.groupId, workspaceId: scope.workspaceId, archivedAt: null },
      select: { id: true },
    });
    if (!group) throw new AppError("NOT_FOUND");

    const existingAssessment = payload.assessmentId
      ? await findPerformanceAssessmentTx(tx, scope.workspaceId, payload.assessmentId)
      : null;
    if (payload.assessmentId && (!existingAssessment || existingAssessment.groupId !== payload.groupId)) {
      throw new AppError("NOT_FOUND");
    }
    if (existingAssessment?.lockedAt) {
      throw new AppError("CONFLICT", { messageKey: "errors.assessmentLocked" });
    }

    const duplicate = await findDuplicateAssessmentTx(
      tx,
      scope.workspaceId,
      payload.groupId,
      payload.title,
      payload.date,
    );
    if (duplicate && duplicate.id !== payload.assessmentId) {
      throw new AppError("CONFLICT", {
        messageKey: "Performance.errors.duplicateAssessment",
        fields: { assessmentId: [duplicate.id] },
      });
    }

    const roster = await findActiveRosterTx(tx, scope.workspaceId, payload.groupId);
    const activeStudentIds = new Set(roster.map((entry) => entry.studentId));
    const maxAllowed = payload.maxScore + (payload.extraCreditAllowance ?? 0);
    const validated: Array<{ row: BulkGradeRow; reasonKey?: string }> = payload.scores.map((row) => {
      if (!activeStudentIds.has(row.studentId)) {
        return { row, reasonKey: "Performance.bulkErrors.notEnrolled" };
      }
      if (row.status === "graded") {
        if (row.score === null || row.score === undefined) {
          return { row, reasonKey: "Performance.bulkErrors.scoreRequired" };
        }
        if (row.score > maxAllowed) {
          return { row, reasonKey: "Performance.bulkErrors.scoreExceedsMaximum" };
        }
      } else if (row.score !== null && row.score !== undefined) {
        return { row, reasonKey: "Performance.bulkErrors.scoreNotAllowed" };
      }
      return { row };
    });
    const validRows = validated.filter((entry) => !entry.reasonKey).map((entry) => entry.row);

    const results: BulkGradeRowResult[] = validated.map(({ row, reasonKey }) =>
      reasonKey
        ? { studentId: row.studentId, outcome: "skipped", reasonKey }
        : { studentId: row.studentId, outcome: "saved" },
    );
    if (validRows.length === 0) {
      return {
        assessmentId: existingAssessment?.id ?? null,
        createdAssessment: false,
        results,
        savedCount: 0,
        skippedCount: results.length,
      };
    }

    let assessmentId = existingAssessment?.id ?? null;
    let createdAssessment = false;
    if (!assessmentId) {
      const created = await createPerformanceAssessmentTx(tx, {
        id: newUuidV7(),
        workspaceId: scope.workspaceId,
        groupId: payload.groupId,
        title: payload.title,
        type: payload.type,
        date: payload.date,
        maxScore: payload.maxScore,
        extraCreditAllowance: payload.extraCreditAllowance ?? null,
      });
      assessmentId = created.id;
      createdAssessment = true;
    } else {
      await updatePerformanceAssessmentTx(tx, {
        workspaceId: scope.workspaceId,
        assessmentId,
        title: payload.title,
        type: payload.type,
        date: payload.date,
        maxScore: payload.maxScore,
        extraCreditAllowance: payload.extraCreditAllowance ?? null,
      });
    }

    for (const row of validRows) {
      const outcome = await upsertBulkScoreTx(tx, {
        workspaceId: scope.workspaceId,
        assessmentId: assessmentId!,
        row,
        actorUserId: scope.actorUserId,
      });
      const result = results.find((entry) => entry.studentId === row.studentId && !entry.reasonKey);
      if (result) result.outcome = outcome === "created" ? "saved" : outcome;
    }

    const before = await findScoresForAssessmentTx(tx, scope.workspaceId, assessmentId);
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "assessment",
      entityId: assessmentId,
      action: "performance.bulk_grades_saved",
      diff: {
        groupId: payload.groupId,
        createdAssessment,
        submittedRows: payload.scores.length,
        savedRows: results.filter((row) => row.outcome !== "skipped").length,
        skippedRows: results.filter((row) => row.outcome === "skipped").length,
        existingScoreCount: before.length,
      },
      ...ctx,
    });

    return {
      assessmentId,
      createdAssessment,
      results,
      savedCount: results.filter((row) => row.outcome === "saved" || row.outcome === "updated").length,
      skippedCount: results.filter((row) => row.outcome === "skipped").length,
    };
  });
}

async function buildParentReport(
  portal: PortalContext,
  studentId: string,
  input: ParentPerformanceReportQuery,
  now: Date,
): Promise<ParentReportData> {
  const query = parentPerformanceReportQuerySchema.parse(input);
  const { grant } = await resolvePortalStudent(portal, studentId, "parent");
  const permissions = resolvePortalPermissions("parent", grant.permissions);
  if (!permissions.showGrades) {
    throw new AppError("FORBIDDEN", { messageKey: "Performance.errors.parentGradesHidden" });
  }

  const raw = await loadParentReportData(grant.workspaceId, studentId, query);
  if (!raw) throw new AppError("NOT_FOUND");

  const summary = summarizeScores(raw.scores, raw.settings.minAssessments);
  const trend = classifyTrend(summary, raw.scores, raw.settings.minAssessments);
  const topics = aggregateTopicEvidence(raw.questionEvidence, raw.manualEvidence);
  const bounds = period(query.from, query.to);
  const recommendations = evaluateRiskRules({
    studentId,
    from: bounds.from,
    to: bounds.to,
    config: riskConfig(raw.settings),
    summary,
    trend,
    topics,
  });

  return {
    student: { ...raw.student, name: studentName(raw.student) },
    teacherName: raw.teacherName,
    timezone: raw.timezone,
    from: query.from ?? null,
    to: query.to ?? null,
    generatedAt: now.toISOString(),
    summary,
    trend,
    topics,
    notes: raw.notes,
    recommendations,
    history: [...raw.scores]
      .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
      .map((score) => ({
        assessmentId: score.assessmentId,
        title: score.title ?? score.assessmentId,
        date: score.date,
        score: score.score,
        maxScore: score.maxScore,
        status: score.status,
      })),
  };
}

export async function getParentPerformanceReport(
  portal: PortalContext,
  studentId: string,
  input: unknown,
  now: Date = new Date(),
) {
  const query = parentPerformanceReportQuerySchema.parse(input);
  return buildParentReport(portal, studentId, query, now);
}

export async function exportParentPerformanceReport(
  portal: PortalContext,
  studentId: string,
  input: unknown,
  labels: ParentReportLabels,
  now: Date = new Date(),
): Promise<{ filename: string; contentType: string; content: Buffer }> {
  const query = parentPerformanceReportQuerySchema.parse(input);
  const report = await buildParentReport(portal, studentId, query, now);
  const table = buildParentReportTable(report, labels, query.locale);
  const extension = reportExportExtension(query.format === "json" ? "csv" : query.format);

  let content: Buffer;
  if (query.format === "xlsx") {
    content = await generateReportXlsx(table, query.locale);
  } else if (query.format === "pdf") {
    content = await getPdfRendererAdapter().render(
      renderReportPdfHtml(table, {
        locale: query.locale,
        type: labels.title,
        from: query.from,
        to: query.to,
      }),
    );
  } else {
    content = buildParentReportCsv(table);
  }

  return {
    filename: `performance-report-${studentId}.${extension}`,
    contentType: reportExportContentType(query.format === "json" ? "csv" : query.format),
    content,
  };
}
