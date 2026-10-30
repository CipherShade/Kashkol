import { describe, expect, it } from "vitest";
import {
  assessmentTrend,
  averagePercentage,
  groupScoreSummary,
} from "@/modules/assessments/calculations";

describe("assessment calculations", () => {
  it("normalizes each result by its own maximum before averaging", () => {
    expect(
      averagePercentage([
        { status: "graded", score: 8, maxScore: 10 },
        { status: "graded", score: 40, maxScore: 100 },
      ]),
    ).toBe(60);
  });

  it("excludes missing, excused, and not-taken results instead of counting them as zero", () => {
    const results = [
      { status: "graded", score: 80, maxScore: 100 },
      { status: "missing", score: null, maxScore: 100 },
      { status: "excused", score: null, maxScore: 100 },
      { status: "not_taken", score: null, maxScore: 100 },
    ] as const;
    expect(averagePercentage(results)).toBe(80);
    expect(groupScoreSummary(results).gradedCount).toBe(1);
  });

  it("returns null when no result is graded", () => {
    expect(averagePercentage([{ status: "missing", score: null, maxScore: 20 }])).toBeNull();
    expect(
      groupScoreSummary([{ status: "excused", score: null, maxScore: 20 }]).averagePercent,
    ).toBeNull();
  });

  it("computes a date-ordered trend using graded percentages only", () => {
    expect(
      assessmentTrend([
        { date: "2026-04-02", status: "graded", score: 50, maxScore: 100 },
        { date: "2026-04-01", status: "graded", score: 9, maxScore: 10 },
        { date: "2026-04-03", status: "excused", score: null, maxScore: 100 },
      ]),
    ).toBe("declining");
    expect(
      assessmentTrend([{ date: "2026-04-01", status: "missing", score: null, maxScore: 100 }]),
    ).toBe("insufficient_data");
  });
});
