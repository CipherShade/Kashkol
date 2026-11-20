import { createHash } from "node:crypto";
import { scorePercentage } from "@/modules/assessments/calculations";

export type AssessmentStatus = "graded" | "missing" | "excused" | "not_taken";

export type ScoreRecord = {
  id: string;
  assessmentId: string;
  date: string;
  status: AssessmentStatus;
  score: number | null;
  maxScore: number;
  title?: string;
  type?: string;
  studentId?: string;
};

export type TrendClassification =
  | "improving"
  | "steady"
  | "declining"
  | "insufficient_data";

export type RiskRuleKey = "low_average" | "declining_trend" | "weak_topic";

export type RiskConfig = {
  enabled: boolean;
  minAssessments: number;
  averageBelowPercent: number;
  consecutiveDeclines: number;
  weakTopicPercent: number;
};

export type TopicEvidenceRow = {
  topic: string;
  correct: boolean;
  responseId: string;
  questionId: string;
  at: string;
  studentId?: string;
  prompt?: string;
};

export type ManualTopicEvidenceRow = {
  topic: string;
  correctCount: number;
  incorrectCount: number;
  resultId: string;
  assessmentId: string;
  at: string;
  studentId?: string;
};

export type TopicAggregate = {
  topic: string;
  observedCount: number;
  correctCount: number;
  incorrectCount: number;
  incorrectRatePercent: number;
  questionCount: number;
  manualObservationCount: number;
  latestAt: string;
  evidenceIds: string[];
  sourceIds: string[];
};

export type StudentScoreSummary = {
  gradedCount: number;
  completedCount: number;
  missedCount: number;
  excusedCount: number;
  notTakenCount: number;
  totalRecords: number;
  averagePercent: number | null;
  highestPercent: number | null;
  lowestPercent: number | null;
  latestPercent: number | null;
  previousPercent: number | null;
  consecutiveChanges: number[];
  evidenceIds: string[];
  assessmentIds: string[];
  latestEvidenceAt: string | null;
  insufficientData: boolean;
};

export type TrendResult = {
  classification: TrendClassification;
  sampleSize: number;
  thresholdPercent: number;
  deltaPercent: number | null;
  priorAveragePercent: number | null;
  recentAveragePercent: number | null;
  rule: string;
};

export type ComputedRisk = {
  ruleKey: RiskRuleKey;
  riskKey: string;
  detectedAt: string;
  severity: "attention" | "warning";
  threshold: number;
  evidenceIds: string[];
  titleKey: string;
  descriptionKey: string;
  suggestedActionKey: string;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isGraded(result: ScoreRecord): result is ScoreRecord & { score: number } {
  return (
    result.status === "graded" &&
    typeof result.score === "number" &&
    Number.isFinite(result.score) &&
    Number.isFinite(result.maxScore) &&
    result.maxScore > 0
  );
}

function percentage(result: ScoreRecord & { score: number }): number {
  return scorePercentage(result.score, result.maxScore);
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sortedGraded(results: readonly ScoreRecord[]): Array<ScoreRecord & { score: number }> {
  return results
    .filter(isGraded)
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
}

/** F-P3-10: summarize only real graded results. Absence is never a zero. */
export function summarizeScores(
  results: readonly ScoreRecord[],
  minResults = 3,
): StudentScoreSummary {
  const graded = sortedGraded(results);
  const percentages = graded.map(percentage);
  const missedCount = results.filter(
    (result) => result.status === "missing" || result.status === "not_taken",
  ).length;
  const excusedCount = results.filter((result) => result.status === "excused").length;
  const notTakenCount = results.filter((result) => result.status === "not_taken").length;
  const latest = percentages.at(-1) ?? null;
  const previous = percentages.at(-2) ?? null;

  return {
    gradedCount: graded.length,
    completedCount: graded.length,
    missedCount,
    excusedCount,
    notTakenCount,
    totalRecords: results.length,
    averagePercent: mean(percentages) === null ? null : round1(mean(percentages)!),
    highestPercent: percentages.length === 0 ? null : round1(Math.max(...percentages)),
    lowestPercent: percentages.length === 0 ? null : round1(Math.min(...percentages)),
    latestPercent: latest === null ? null : round1(latest),
    previousPercent: previous === null ? null : round1(previous),
    consecutiveChanges: percentages.slice(1).map((value, index) => round1(value - percentages[index]!)),
    evidenceIds: graded.map((result) => result.id),
    assessmentIds: [...new Set(graded.map((result) => result.assessmentId))],
    latestEvidenceAt: graded.at(-1)?.date ?? null,
    insufficientData: graded.length < minResults,
  };
}

/**
 * F-P3-10: compare the mean of the most recent half with the mean of the
 * preceding half. A 5-point band is treated as steady; small samples are not
 * classified at all.
 */
export function classifyTrend(summary: StudentScoreSummary, results: readonly ScoreRecord[], minResults = 3): TrendResult {
  const graded = sortedGraded(results);
  const rule = "mean(latest half) - mean(previous half); >=+5 improving, <=-5 declining, otherwise steady";
  if (graded.length < minResults) {
    return {
      classification: "insufficient_data",
      sampleSize: graded.length,
      thresholdPercent: 5,
      deltaPercent: null,
      priorAveragePercent: null,
      recentAveragePercent: null,
      rule,
    };
  }

  const recentSize = Math.ceil(graded.length / 2);
  const prior = graded.slice(0, graded.length - recentSize);
  const recent = graded.slice(graded.length - recentSize);
  const priorAverage = mean(prior.map(percentage)) ?? 0;
  const recentAverage = mean(recent.map(percentage)) ?? 0;
  const delta = recentAverage - priorAverage;
  return {
    classification: delta >= 5 ? "improving" : delta <= -5 ? "declining" : "steady",
    sampleSize: graded.length,
    thresholdPercent: 5,
    deltaPercent: round1(delta),
    priorAveragePercent: round1(priorAverage),
    recentAveragePercent: round1(recentAverage),
    rule,
  };
}

export function normalizeTopic(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function topicKey(value: string): string {
  return normalizeTopic(value).toLocaleLowerCase();
}

function latest(first: string, second: string): string {
  return first > second ? first : second;
}

/** F-P3-10: aggregate only question-level or explicitly entered topic counts. */
export function aggregateTopicEvidence(
  questionRows: readonly TopicEvidenceRow[],
  manualRows: readonly ManualTopicEvidenceRow[],
): TopicAggregate[] {
  const byTopic = new Map<
    string,
    {
      label: string;
      correctCount: number;
      incorrectCount: number;
      questionCount: number;
      manualObservationCount: number;
      latestAt: string;
      evidenceIds: string[];
      sourceIds: string[];
    }
  >();

  function bucket(label: string, at: string) {
    const key = topicKey(label);
    const existing = byTopic.get(key);
    if (existing) {
      existing.latestAt = latest(existing.latestAt, at);
      byTopic.set(key, existing);
      return existing;
    }
    const created = {
      label: normalizeTopic(label),
      correctCount: 0,
      incorrectCount: 0,
      questionCount: 0,
      manualObservationCount: 0,
      latestAt: at,
      evidenceIds: [] as string[],
      sourceIds: [] as string[],
    };
    byTopic.set(key, created);
    return created;
  }

  for (const row of questionRows) {
    if (!normalizeTopic(row.topic)) continue;
    const entry = bucket(row.topic, row.at);
    entry.questionCount += 1;
    if (row.correct) entry.correctCount += 1;
    else entry.incorrectCount += 1;
    entry.evidenceIds.push(row.responseId);
    entry.sourceIds.push(row.questionId);
  }

  for (const row of manualRows) {
    if (!normalizeTopic(row.topic)) continue;
    const entry = bucket(row.topic, row.at);
    entry.correctCount += row.correctCount;
    entry.incorrectCount += row.incorrectCount;
    entry.manualObservationCount += row.correctCount + row.incorrectCount;
    entry.evidenceIds.push(row.resultId);
    entry.sourceIds.push(row.assessmentId);
  }

  return [...byTopic.values()]
    .map((entry) => {
      const observedCount = entry.correctCount + entry.incorrectCount;
      return {
        topic: entry.label,
        observedCount,
        correctCount: entry.correctCount,
        incorrectCount: entry.incorrectCount,
        incorrectRatePercent: observedCount === 0 ? 0 : round1((entry.incorrectCount / observedCount) * 100),
        questionCount: entry.questionCount,
        manualObservationCount: entry.manualObservationCount,
        latestAt: entry.latestAt,
        evidenceIds: [...new Set(entry.evidenceIds)].sort(),
        sourceIds: [...new Set(entry.sourceIds)].sort(),
      };
    })
    .sort(
      (left, right) =>
        right.incorrectRatePercent - left.incorrectRatePercent ||
        right.observedCount - left.observedCount ||
        left.topic.localeCompare(right.topic),
    );
}

export function selectWeakTopics(
  topics: readonly TopicAggregate[],
  thresholdPercent: number,
  minSamples = 3,
): TopicAggregate[] {
  return topics.filter(
    (topic) => topic.observedCount >= minSamples && topic.incorrectRatePercent >= thresholdPercent,
  );
}

export function selectStrongTopics(
  topics: readonly TopicAggregate[],
  maxIncorrectPercent = 30,
  minSamples = 3,
): TopicAggregate[] {
  return topics.filter(
    (topic) => topic.observedCount >= minSamples && topic.incorrectRatePercent <= maxIncorrectPercent,
  );
}

function makeRiskKey(input: {
  studentId: string;
  ruleKey: RiskRuleKey;
  from: string;
  to: string;
  detectedAt: string;
  evidenceIds: string[];
  threshold: number;
}): string {
  const payload = [
    input.studentId,
    input.ruleKey,
    input.from,
    input.to,
    input.detectedAt,
    String(input.threshold),
    [...input.evidenceIds].sort().join(","),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

/** F-P3-10: deterministic rules with evidence, never diagnosis. */
export function evaluateRiskRules(input: {
  studentId: string;
  from: string;
  to: string;
  config: RiskConfig;
  summary: StudentScoreSummary;
  trend: TrendResult;
  topics: readonly TopicAggregate[];
}): ComputedRisk[] {
  if (!input.config.enabled) return [];
  const risks: ComputedRisk[] = [];
  const scoreDetectedAt = input.summary.latestEvidenceAt ?? input.to;

  function addRisk(ruleKey: RiskRuleKey, threshold: number, evidenceIds: string[], detectedAt: string) {
    const ids = [...new Set(evidenceIds)].sort();
    risks.push({
      ruleKey,
      riskKey: makeRiskKey({
        studentId: input.studentId,
        ruleKey,
        from: input.from,
        to: input.to,
        detectedAt,
        evidenceIds: ids,
        threshold,
      }),
      detectedAt,
      severity: ruleKey === "weak_topic" ? "warning" : "attention",
      threshold,
      evidenceIds: ids,
      titleKey: `Performance.risks.${ruleKey}.title`,
      descriptionKey: `Performance.risks.${ruleKey}.description`,
      suggestedActionKey: `Performance.risks.${ruleKey}.action`,
    });
  }

  if (
    input.summary.gradedCount >= input.config.minAssessments &&
    input.summary.averagePercent !== null &&
    input.summary.averagePercent < input.config.averageBelowPercent
  ) {
    addRisk(
      "low_average",
      input.config.averageBelowPercent,
      input.summary.evidenceIds,
      scoreDetectedAt,
    );
  }

  const decliningChanges = input.summary.consecutiveChanges.filter((change) => change < 0);
  if (
    input.trend.classification === "declining" &&
    input.summary.gradedCount >= input.config.minAssessments &&
    decliningChanges.length >= input.config.consecutiveDeclines
  ) {
    addRisk(
      "declining_trend",
      input.config.consecutiveDeclines,
      input.summary.evidenceIds,
      scoreDetectedAt,
    );
  }

  const weak = selectWeakTopics(input.topics, input.config.weakTopicPercent);
  if (weak.length > 0) {
    addRisk(
      "weak_topic",
      input.config.weakTopicPercent,
      weak.flatMap((topic) => topic.evidenceIds),
      weak.map((topic) => topic.latestAt).sort().at(-1) ?? input.to,
    );
  }

  return risks.sort((left, right) => left.ruleKey.localeCompare(right.ruleKey));
}

export type ClassIntelligenceInput = {
  students: Array<{
    studentId: string;
    name: string;
    summary: StudentScoreSummary;
    trend: TrendResult;
  }>;
  assessments: Array<{ id: string; title: string; date: string; results: readonly ScoreRecord[] }>;
  questionEvidence: readonly TopicEvidenceRow[];
  manualEvidence?: readonly ManualTopicEvidenceRow[];
  minSamples?: number;
};

/** F-P3-10: compare only students who have the same graded assessment set. */
export function buildClassIntelligence(input: ClassIntelligenceInput) {
  const cohorts = new Map<string, string[]>();
  for (const student of input.students) {
    const key = [...student.summary.assessmentIds].sort().join(",");
    cohorts.set(key, [...(cohorts.get(key) ?? []), student.studentId]);
  }
  const largest = [...cohorts.values()].sort((left, right) => right.length - left.length)[0] ?? [];
  const comparable = largest.length >= 2;
  const comparableIds = new Set(comparable ? largest : []);
  const cohort = input.students.filter((student) => comparableIds.has(student.studentId));

  const assessmentAverages = input.assessments
    .map((assessment) => {
      const values = assessment.results
        .filter(
          (result) =>
            result.assessmentId === assessment.id &&
            result.studentId !== undefined &&
            comparableIds.has(result.studentId),
        )
        .filter(isGraded)
        .map(percentage);
      return {
        id: assessment.id,
        title: assessment.title,
        date: assessment.date,
        averagePercent: mean(values) === null ? null : round1(mean(values)!),
        sampleSize: values.length,
      };
    })
    .filter((item) => item.averagePercent !== null && item.sampleSize >= 2)
    .sort((left, right) => (left.averagePercent ?? 0) - (right.averagePercent ?? 0));

  const cohortEvidence = input.questionEvidence.filter(
    (row) => row.studentId && comparableIds.has(row.studentId),
  );
  const cohortManualEvidence = (input.manualEvidence ?? []).filter(
    (row) => row.studentId && comparableIds.has(row.studentId),
  );
  const topicRows = aggregateTopicEvidence(cohortEvidence, cohortManualEvidence);
  const questionStats = new Map<string, { prompt: string; observed: number; incorrect: number; topic: string }>();
  for (const row of cohortEvidence) {
    const current = questionStats.get(row.questionId) ?? {
      prompt: row.prompt ?? "",
      observed: 0,
      incorrect: 0,
      topic: normalizeTopic(row.topic),
    };
    current.observed += 1;
    if (!row.correct) current.incorrect += 1;
    questionStats.set(row.questionId, current);
  }

  const questionIncorrectRates = [...questionStats.entries()]
    .map(([questionId, value]) => ({
      questionId,
      prompt: value.prompt,
      topic: value.topic,
      observedCount: value.observed,
      incorrectCount: value.incorrect,
      incorrectRatePercent: value.observed === 0 ? 0 : round1((value.incorrect / value.observed) * 100),
    }))
    .filter((row) => row.observedCount >= (input.minSamples ?? 3))
    .sort((left, right) => right.incorrectRatePercent - left.incorrectRatePercent)
    .slice(0, 5);

  const percent = (count: number) =>
    cohort.length === 0 ? 0 : round1((count / cohort.length) * 100);

  return {
    comparable,
    comparableStudentCount: cohort.length,
    students: cohort,
    comparisonNoteKey: comparable
      ? "Performance.class.comparableNote"
      : "Performance.class.notComparableNote",
    improvingPercent: percent(
      cohort.filter((student) => student.trend.classification === "improving").length,
    ),
    decliningPercent: percent(
      cohort.filter((student) => student.trend.classification === "declining").length,
    ),
    steadyPercent: percent(cohort.filter((student) => student.trend.classification === "steady").length),
    insufficientPercent: percent(
      cohort.filter((student) => student.trend.classification === "insufficient_data").length,
    ),
    difficultTopics: selectWeakTopics(topicRows, 60, input.minSamples ?? 3).slice(0, 5),
    strongTopics: selectStrongTopics(topicRows, 30, input.minSamples ?? 3).slice(0, 5),
    weakestAssessments: assessmentAverages.slice(0, 5),
    questionIncorrectRates,
  };
}
