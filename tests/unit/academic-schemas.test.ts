import { describe, expect, it } from "vitest";
import { createAssessmentSchema, setAssessmentResultSchema } from "@/modules/assessments/schemas";
import { createHomeworkSchema } from "@/modules/homework/schemas";

const groupId = "00000000-0000-4000-8000-000000000010";
const studentId = "00000000-0000-4000-8000-000000000020";

describe("academic input validation", () => {
  it("allows extra credit only through an explicit non-negative allowance", () => {
    const base = {
      groupId,
      title: "Exam",
      type: "paper_exam",
      date: "2026-10-29",
      maxScore: 100,
    };
    expect(createAssessmentSchema.safeParse(base).success).toBe(true);
    expect(createAssessmentSchema.safeParse({ ...base, extraCreditAllowance: 5 }).success).toBe(
      true,
    );
    expect(createAssessmentSchema.safeParse({ ...base, extraCreditAllowance: -1 }).success).toBe(
      false,
    );
    expect(
      createAssessmentSchema.safeParse({ ...base, maxScore: 9999, extraCreditAllowance: 1 })
        .success,
    ).toBe(false);
  });

  it("requires numeric scores only for graded results", () => {
    expect(setAssessmentResultSchema.safeParse({ status: "graded", score: 0 }).success).toBe(true);
    expect(setAssessmentResultSchema.safeParse({ status: "graded", score: null }).success).toBe(
      false,
    );
    expect(setAssessmentResultSchema.safeParse({ status: "excused", score: null }).success).toBe(
      true,
    );
    expect(setAssessmentResultSchema.safeParse({ status: "missing", score: 0 }).success).toBe(
      false,
    );
  });

  it("requires exactly one assignment target and unique selected students", () => {
    const common = {
      title: "Homework",
      dueAt: "2026-10-30T12:00:00.000Z",
      resourceFileIds: [],
    };
    expect(createHomeworkSchema.safeParse({ ...common, groupId }).success).toBe(true);
    expect(createHomeworkSchema.safeParse({ ...common, studentIds: [studentId] }).success).toBe(
      true,
    );
    expect(
      createHomeworkSchema.safeParse({ ...common, groupId, studentIds: [studentId] }).success,
    ).toBe(false);
    expect(
      createHomeworkSchema.safeParse({ ...common, studentIds: [studentId, studentId] }).success,
    ).toBe(false);
  });
});
