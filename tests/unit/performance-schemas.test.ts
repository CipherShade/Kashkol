import { describe, expect, it } from "vitest";
import { ROUTES } from "@/lib/routes/registry";
import { examQuestionInputSchema } from "@/modules/exams/schemas";
import {
  acknowledgeRiskSchema,
  bulkGradesSchema,
  parentPerformanceReportQuerySchema,
  performanceSettingsSchema,
  saveTopicResultsSchema,
} from "@/modules/performance/schemas";

const STUDENT_A = "30000000-0000-4000-8000-000000000001";
const STUDENT_B = "30000000-0000-4000-8000-000000000002";
const GROUP = "40000000-0000-4000-8000-000000000001";
const ASSESSMENT = "40000000-0000-4000-8000-000000000002";

describe("performance validation schemas", () => {
  it("requires at least two assessments before a risk threshold is meaningful", () => {
    const base = {
      enabled: true,
      averageBelowPercent: 60,
      consecutiveDeclines: 2,
      weakTopicPercent: 60,
    };
    expect(performanceSettingsSchema.safeParse({ ...base, minAssessments: 1 }).success).toBe(false);
    expect(performanceSettingsSchema.safeParse({ ...base, minAssessments: 2 }).success).toBe(true);
    expect(performanceSettingsSchema.safeParse({ ...base, minAssessments: 21 }).success).toBe(false);
  });

  it("rejects duplicate student rows before any bulk write", () => {
    const input = {
      groupId: GROUP,
      title: "Weekly paper",
      type: "paper_exam",
      date: "2026-11-18",
      maxScore: 100,
      scores: [
        { studentId: STUDENT_A, status: "graded", score: 80 },
        { studentId: STUDENT_A, status: "graded", score: 90 },
      ],
    };
    const parsed = bulkGradesSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message === "duplicateStudentRow")).toBe(true);
    }
  });

  it("accepts non-graded rows without a score and rejects extra-credit overflow", () => {
    const base = {
      groupId: GROUP,
      title: "Weekly paper",
      type: "paper_exam",
      date: "2026-11-18",
      maxScore: 100,
    };
    expect(
      bulkGradesSchema.safeParse({
        ...base,
        scores: [{ studentId: STUDENT_A, status: "missing", score: null }],
      }).success,
    ).toBe(true);
    expect(
      bulkGradesSchema.safeParse({
        ...base,
        extraCreditAllowance: 10,
        maxScore: 9995,
        scores: [{ studentId: STUDENT_A, status: "graded", score: 90 }],
      }).success,
    ).toBe(false);
  });

  it("validates topic observations, risk acknowledgement, and report periods", () => {
    expect(
      saveTopicResultsSchema.safeParse({
        assessmentId: ASSESSMENT,
        topics: [{ topic: "Fractions", correctCount: 2, incorrectCount: 3 }],
      }).success,
    ).toBe(true);
    expect(
      saveTopicResultsSchema.safeParse({
        assessmentId: ASSESSMENT,
        topics: [{ topic: " ", correctCount: 2, incorrectCount: 3 }],
      }).success,
    ).toBe(false);
    expect(
      acknowledgeRiskSchema.safeParse({
        studentId: STUDENT_A,
        ruleKey: "low_average",
        riskKey: "a".repeat(64),
        title: "Follow up",
        createFollowUp: true,
      }).success,
    ).toBe(true);
    expect(
      parentPerformanceReportQuerySchema.safeParse({ from: "2026-05-01", to: "2026-04-01" }).success,
    ).toBe(false);
    expect(parentPerformanceReportQuerySchema.parse({})).toEqual({ locale: "ar", format: "json" });
  });

  it("stores question topics only as the real-question evidence field", () => {
    const base = {
      questionType: "mcq_single",
      prompt: "What is 1 + 1?",
      points: 10,
      options: [
        { id: "a", text: "1" },
        { id: "b", text: "2" },
      ],
      correctOptionId: "b",
    };
    expect(examQuestionInputSchema.safeParse({ ...base, topic: "Arithmetic" }).success).toBe(true);
    expect(examQuestionInputSchema.safeParse({ ...base, topic: null }).success).toBe(true);
    expect(examQuestionInputSchema.safeParse({ ...base, topic: "x".repeat(121) }).success).toBe(false);
  });

  it("registers every performance API route as tenant scoped", () => {
    const expected: Record<string, { methods: string[]; access: string }> = {
      "/api/performance/overview": { methods: ["GET"], access: "workspace" },
      "/api/performance/settings": { methods: ["GET", "PATCH"], access: "workspace" },
      "/api/performance/bulk-grades/form": { methods: ["GET"], access: "workspace" },
      "/api/performance/students/[studentId]": { methods: ["GET"], access: "workspace" },
      "/api/performance/classes/[groupId]": { methods: ["GET"], access: "workspace" },
      "/api/performance/risks/acknowledge": { methods: ["POST"], access: "workspace" },
      "/api/performance/students/[studentId]/topic-results": { methods: ["POST"], access: "workspace" },
      "/api/performance/report-notes": { methods: ["POST"], access: "workspace" },
      "/api/performance/bulk-grades": { methods: ["POST"], access: "workspace" },
      "/api/portal/parent/performance": { methods: ["GET"], access: "session" },
    };
    for (const [path, rule] of Object.entries(expected)) {
      const route = ROUTES.find((entry) => entry.path === path);
      expect(route, `${path} must be in the route registry`).toBeDefined();
      expect(route?.methods).toEqual(rule.methods);
      expect(route?.access).toBe(rule.access);
      expect(route?.tenantScoped).toBe(true);
    }
  });

  it("rejects another duplicate row shape with a stable field error", () => {
    const parsed = bulkGradesSchema.safeParse({
      groupId: GROUP,
      title: "Paper",
      type: "test",
      date: "2026-11-18",
      maxScore: 100,
      scores: [
        { studentId: STUDENT_B, status: "graded", score: 50 },
        { studentId: STUDENT_B, status: "graded", score: 60 },
      ],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((entry) => entry.message === "duplicateStudentRow");
      expect(issue?.path).toEqual(["scores", 1, "studentId"]);
    }
  });
});
