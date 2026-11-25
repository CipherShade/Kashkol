import { describe, expect, it } from "vitest";
import {
  PROGRESS_DIRECTION_RULE,
  assessmentValue,
  attendanceValue,
  buildProgressSeries,
  homeworkCompletionValue,
} from "@/modules/performance/progress";

describe("F-P2-06 computed progress (ADR-0040)", () => {
  it("groups observations by populated month and averages each bucket once", () => {
    const series = buildProgressSeries([
      { date: "2026-08-03", value: 40 },
      { date: "2026-08-20", value: 60 },
      { date: "2026-09-04", value: 70 },
      { date: "2026-10-05", value: 80 },
    ]);
    expect(series.points).toEqual([
      { period: "2026-08", value: 50, sampleSize: 2 },
      { period: "2026-09", value: 70, sampleSize: 1 },
      { period: "2026-10", value: 80, sampleSize: 1 },
    ]);
    expect(series.sampleSize).toBe(4);
    expect(series.rule).toBe(PROGRESS_DIRECTION_RULE);
  });

  it("classifies direction from the difference between the two halves", () => {
    const points = (values: number[]) =>
      values.map((value, index) => ({ date: `2026-${String(index + 1).padStart(2, "0")}-01`, value }));
    expect(buildProgressSeries(points([40, 40, 44])).direction).toBe("steady");
    expect(buildProgressSeries(points([40, 50, 60])).direction).toBe("improving");
    expect(buildProgressSeries(points([60, 50, 40])).direction).toBe("declining");
  });

  it("does not invent a direction from fewer than three populated months", () => {
    const series = buildProgressSeries([
      { date: "2026-08-01", value: 20 },
      { date: "2026-08-02", value: 100 },
    ]);
    expect(series.direction).toBe("insufficient_data");
    expect(series.deltaPercent).toBeNull();
    expect(series.points).toHaveLength(1);
  });

  it("ignores malformed or non-finite values instead of coercing them", () => {
    const series = buildProgressSeries([
      { date: "bad-date", value: 50 },
      { date: "2026-09-01", value: Number.NaN },
    ]);
    expect(series.points).toEqual([]);
    expect(series.sampleSize).toBe(0);
  });

  it("maps only real source states to observations", () => {
    expect(attendanceValue("present")).toBe(100);
    expect(attendanceValue("late")).toBe(100);
    expect(attendanceValue("absent")).toBe(0);
    expect(attendanceValue("excused")).toBeNull();

    expect(homeworkCompletionValue("completed")).toBe(true);
    expect(homeworkCompletionValue("submitted")).toBe(true);
    expect(homeworkCompletionValue("late")).toBe(true);
    expect(homeworkCompletionValue("not_completed")).toBe(false);
    expect(homeworkCompletionValue("not_submitted")).toBe(false);
    expect(homeworkCompletionValue("excused")).toBeNull();
    expect(homeworkCompletionValue("not_applicable")).toBeNull();

    expect(assessmentValue("graded", 18, 20)).toBe(90);
    expect(assessmentValue("graded", 0, 20)).toBe(0);
    expect(assessmentValue("missing", null, 20)).toBeNull();
    expect(assessmentValue("excused", 20, 20)).toBeNull();
    expect(assessmentValue("not_taken", null, 20)).toBeNull();
    expect(assessmentValue("graded", 10, 0)).toBeNull();
  });
});
