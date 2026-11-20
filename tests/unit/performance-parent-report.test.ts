import { describe, expect, it } from "vitest";
import { UnconfiguredPdfRendererAdapter } from "@/modules/reports/adapters";
import { renderReportPdfHtml } from "@/modules/reports/adapters/pdf-html";
import {
  classifyTrend,
  summarizeScores,
  type ComputedRisk,
  type ScoreRecord,
} from "@/modules/performance/calculations";
import {
  buildParentReportCsv,
  buildParentReportTable,
  type ParentReportData,
  type ParentReportLabels,
} from "@/modules/performance/parent-report";

const labels = new Proxy({}, { get: (_target, key) => String(key) }) as ParentReportLabels;

function report(overrides: Partial<ParentReportData> = {}): ParentReportData {
  const scores: ScoreRecord[] = [
    {
      id: "score-1",
      assessmentId: "assessment-1",
      date: "2026-01-01",
      status: "graded",
      score: 60,
      maxScore: 100,
      studentId: "student-1",
    },
    {
      id: "score-2",
      assessmentId: "assessment-2",
      date: "2026-02-01",
      status: "graded",
      score: 80,
      maxScore: 100,
      studentId: "student-1",
    },
  ];
  const risk: ComputedRisk = {
    ruleKey: "weak_topic",
    riskKey: "a".repeat(64),
    detectedAt: "2026-02-01",
    severity: "warning",
    threshold: 60,
    evidenceIds: ["result-1"],
    titleKey: "Performance.risks.weak_topic.title",
    descriptionKey: "Performance.risks.weak_topic.description",
    suggestedActionKey: "Performance.risks.weak_topic.action",
  };
  return {
    student: {
      id: "student-1",
      firstName: "Lina",
      lastName: "Ahmed",
      name: "Lina Ahmed",
      grade: "3",
    },
    teacherName: "=1+1",
    timezone: "Africa/Cairo",
    from: "2026-01-01",
    to: "2026-02-28",
    generatedAt: "2026-02-28T10:00:00.000Z",
    summary: summarizeScores(scores, 2),
    trend: classifyTrend(summarizeScores(scores, 2), scores, 2),
    topics: [
      {
        topic: "Fractions",
        observedCount: 5,
        correctCount: 1,
        incorrectCount: 4,
        incorrectRatePercent: 80,
        questionCount: 0,
        manualObservationCount: 5,
        latestAt: "2026-02-01",
        evidenceIds: ["result-1"],
        sourceIds: ["assessment-1"],
      },
    ],
    notes: [{ id: "note-1", body: "Shareable note only", createdAt: "2026-02-10T10:00:00.000Z" }],
    recommendations: [risk],
    history: scores.map((score) => ({
      assessmentId: score.assessmentId,
      title: "Paper",
      date: score.date,
      score: score.score,
      maxScore: score.maxScore,
      status: score.status,
    })),
    ...overrides,
  };
}

describe("parent performance report table", () => {
  it("uses the same computed rows for every export and sanitizes formulas", () => {
    const table = buildParentReportTable(report(), labels, "en");
    expect(table.columns).toEqual(["section", "label", "value"]);
    expect(table.headers).toEqual(["overview", "history", "topics"]);
    expect(table.rows.some((row) => row.value === "'=1+1")).toBe(true);
    expect(table.rows.some((row) => row.value === "Shareable note only")).toBe(true);
    expect(table.rows.some((row) => row.label === "title_weak_topic")).toBe(true);
    expect(JSON.stringify(table)).not.toContain("private-note-must-not-appear");

    const csv = buildParentReportCsv(table).toString("utf8");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\"'=1+1\"");
    expect(csv).toContain("\"Fractions\"");
  });

  it("renders self-contained RTL HTML from the same table", () => {
    const table = buildParentReportTable(report(), labels, "ar");
    const html = renderReportPdfHtml(table, {
      locale: "ar",
      type: labels.title,
      from: "2026-01-01",
      to: "2026-02-28",
    });
    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain("Fractions");
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  });

  it("fails closed when no PDF renderer is configured", async () => {
    const adapter = new UnconfiguredPdfRendererAdapter();
    expect(adapter.isConfigured).toBe(false);
    await expect(adapter.render()).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "errors.pdfRendererNotConfigured",
    });
  });
});
