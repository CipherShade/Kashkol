import { describe, it, expect } from "vitest";
import { updateSubmissionSchema, updateHomeworkSchema } from "@/modules/homework/schemas";

describe("homework grading rules — confirmed enforced", () => {
  it("maxScore must be positive (not zero or negative)", () => {
    expect(updateHomeworkSchema.safeParse({ maxScore: 0 }).success).toBe(false);
    expect(updateHomeworkSchema.safeParse({ maxScore: -5 }).success).toBe(false);
    expect(updateHomeworkSchema.safeParse({ maxScore: 10 }).success).toBe(true);
  });

  it("submission score must be non-negative and finite", () => {
    expect(updateSubmissionSchema.safeParse({ status: "submitted", score: -1 }).success).toBe(false);
    expect(updateSubmissionSchema.safeParse({ status: "submitted", score: 0 }).success).toBe(true);
  });

  it("submission score capped at 9999.99", () => {
    expect(updateSubmissionSchema.safeParse({ status: "submitted", score: 10000 }).success).toBe(false);
  });

  it("status enum restricts to allowed values", () => {
    expect(updateSubmissionSchema.safeParse({ status: "submitted" }).success).toBe(true);
    expect(updateSubmissionSchema.safeParse({ status: "late" }).success).toBe(true);
    expect(updateSubmissionSchema.safeParse({ status: "excused" }).success).toBe(true);
    expect(updateSubmissionSchema.safeParse({ status: "bad" }).success).toBe(false);
  });
});
