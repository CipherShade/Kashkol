import { sanitizeSpreadsheetFormula } from "@/modules/students/schemas";
import type { ReportTable } from "@/modules/reports/adapters";
import type {
  ComputedRisk,
  StudentScoreSummary,
  TopicAggregate,
  TrendResult,
} from "./calculations";

export type ParentReportLabels = {
  title: string;
  overview: string;
  history: string;
  topics: string;
  notes: string;
  recommendations: string;
  student: string;
  teacher: string;
  period: string;
  generatedAt: string;
  average: string;
  latest: string;
  previous: string;
  trend: string;
  completed: string;
  missed: string;
  trendInsufficient: string;
  trendImproving: string;
  trendSteady: string;
  trendDeclining: string;
  noHistory: string;
  noTopicEvidence: string;
  noNotes: string;
  noRecommendations: string;
  topicObservation: string;
  incorrectRate: string;
  observedCount: string;
  score: string;
  status: string;
  date: string;
  allPeriod: string;
  status_graded: string;
  status_missing: string;
  status_excused: string;
  status_not_taken: string;
  title_low_average: string;
  title_declining_trend: string;
  title_weak_topic: string;
  description_low_average: string;
  description_declining_trend: string;
  description_weak_topic: string;
  action_low_average: string;
  action_declining_trend: string;
  action_weak_topic: string;
};

export type ParentReportData = {
  student: { id: string; firstName: string; lastName: string; name: string; grade: string | null };
  teacherName: string;
  timezone: string;
  from: string | null;
  to: string | null;
  generatedAt: string;
  summary: StudentScoreSummary;
  trend: TrendResult;
  topics: TopicAggregate[];
  notes: Array<{ id: string; body: string; createdAt: string }>;
  recommendations: ComputedRisk[];
  history: Array<{
    assessmentId: string;
    title: string;
    date: string;
    score: number | null;
    maxScore: number;
    status: string;
  }>;
};

function formatPercent(value: number | null, locale: "ar" | "en"): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value / 100);
}

function formatDate(value: string, locale: "ar" | "en", timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone,
  }).format(date);
}

function trendLabel(trend: TrendResult, labels: ParentReportLabels): string {
  if (trend.classification === "improving") return labels.trendImproving;
  if (trend.classification === "steady") return labels.trendSteady;
  if (trend.classification === "declining") return labels.trendDeclining;
  return labels.trendInsufficient;
}

function statusLabel(status: string, labels: ParentReportLabels): string {
  const key = `status_${status}` as keyof ParentReportLabels;
  const value = labels[key];
  return typeof value === "string" ? value : status;
}

/** F-P3-10: one format-independent table, so every export shows the same truth. */
export function buildParentReportTable(
  report: ParentReportData,
  labels: ParentReportLabels,
  locale: "ar" | "en",
): ReportTable {
  const columns = ["section", "label", "value"] as const;
  const rows: Array<{ section: string; label: string; value: string | number | null }> = [];
  const add = (section: string, label: string, value: string | number | null) => {
    rows.push({ section, label, value });
  };

  const period =
    report.from || report.to
      ? `${report.from ?? labels.allPeriod} — ${report.to ?? labels.allPeriod}`
      : labels.allPeriod;

  add(labels.overview, labels.student, `${report.student.firstName} ${report.student.lastName}`);
  add(labels.overview, labels.teacher, report.teacherName);
  add(labels.overview, labels.period, period);
  add(labels.overview, labels.generatedAt, formatDate(report.generatedAt, locale, report.timezone));
  add(labels.overview, labels.average, formatPercent(report.summary.averagePercent, locale));
  add(labels.overview, labels.latest, formatPercent(report.summary.latestPercent, locale));
  add(labels.overview, labels.previous, formatPercent(report.summary.previousPercent, locale));
  add(labels.overview, labels.trend, trendLabel(report.trend, labels));
  add(labels.overview, labels.completed, report.summary.completedCount);
  add(labels.overview, labels.missed, report.summary.missedCount);

  if (report.history.length === 0) {
    add(labels.history, labels.noHistory, null);
  } else {
    for (const item of report.history) {
      add(
        labels.history,
        item.title,
        `${formatDate(item.date, locale, report.timezone)} · ${item.score === null ? "—" : item.score}/${item.maxScore} · ${statusLabel(item.status, labels)}`,
      );
    }
  }

  if (report.topics.length === 0) {
    add(labels.topics, labels.noTopicEvidence, null);
  } else {
    for (const topic of report.topics) {
      add(
        labels.topics,
        topic.topic,
        `${labels.incorrectRate}: ${formatPercent(topic.incorrectRatePercent, locale)} · ${labels.observedCount}: ${topic.observedCount}`,
      );
    }
  }

  if (report.notes.length === 0) {
    add(labels.notes, labels.noNotes, null);
  } else {
    for (const note of report.notes) {
      add(labels.notes, formatDate(note.createdAt, locale, report.timezone), note.body);
    }
  }

  if (report.recommendations.length === 0) {
    add(labels.recommendations, labels.noRecommendations, null);
  } else {
    for (const risk of report.recommendations) {
      add(
        labels.recommendations,
        labels[`title_${risk.ruleKey}` as keyof ParentReportLabels] as string ?? risk.ruleKey,
        labels[`action_${risk.ruleKey}` as keyof ParentReportLabels] as string ?? risk.ruleKey,
      );
    }
  }

  return {
    columns: [...columns],
    headers: [labels.overview, labels.history, labels.topics],
    rows: rows.map((row) => ({
      section: sanitizeSpreadsheetFormula(row.section),
      label: sanitizeSpreadsheetFormula(row.label),
      value: row.value === null ? null : sanitizeSpreadsheetFormula(String(row.value)),
    })),
  };
}

export function buildParentReportCsv(table: ReportTable): Buffer {
  const cell = (value: string | number | null) => {
    const safe = sanitizeSpreadsheetFormula(value === null ? "" : String(value));
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const body = [
    table.headers.map(cell).join(","),
    ...table.rows.map((row) => table.columns.map((key) => cell(row[key] ?? null)).join(",")),
  ].join("\r\n");
  return Buffer.from(`\uFEFF${body}`, "utf8");
}
