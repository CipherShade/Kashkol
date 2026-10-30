import { z } from "zod";

const uuid = z.string().uuid();
const scoreValue = z.number().finite().min(0).max(9999.99);

export const createAssessmentSchema = z
  .object({
    groupId: uuid,
    title: z.string().trim().min(1).max(160),
    type: z.enum(["paper_exam", "quiz", "test", "other"]),
    date: z.iso.date(),
    note: z.string().trim().max(2000).nullable().optional(),
    maxScore: z.number().finite().positive().max(9999.99),
    extraCreditAllowance: z.number().finite().min(0).max(9999.99).nullable().optional(),
  })
  .refine(
    (input) =>
      input.extraCreditAllowance == null || input.maxScore + input.extraCreditAllowance <= 9999.99,
    { path: ["extraCreditAllowance"], message: "extraCreditAllowanceOutOfRange" },
  );

export const assessmentQuerySchema = z.object({
  groupId: uuid.optional(),
  studentId: uuid.optional(),
});

export const setAssessmentResultSchema = z
  .object({
    status: z.enum(["graded", "missing", "excused", "not_taken"]),
    score: scoreValue.nullable().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .refine(
    (input) =>
      (input.status === "graded" && typeof input.score === "number") ||
      (input.status !== "graded" && input.score == null),
    { path: ["score"], message: "scoreRequiredForGradedResult" },
  );

export const assessmentLockSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lock") }),
  z.object({ action: z.literal("unlock"), reason: z.string().trim().min(1).max(500) }),
]);

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
export type AssessmentQuery = z.infer<typeof assessmentQuerySchema>;
export type SetAssessmentResultInput = z.infer<typeof setAssessmentResultSchema>;
