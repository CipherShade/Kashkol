import { z } from "zod";
import { AppError } from "@/lib/http/errors";

export const onlineExamAssignmentScopeSchema = z.enum(["group", "selected_students"]);
export const onlineExamStatusSchema = z.enum(["draft", "published", "closed", "archived"]);
export const onlineExamQuestionTypeSchema = z.enum([
  "mcq_single",
  "true_false",
  "short_answer",
  "essay",
]);
export const onlineExamResultVisibilitySchema = z.enum([
  "after_manual_publish",
  "immediate_after_submit",
  "after_window_close",
]);

export const questionOptionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  text: z.string().trim().min(1).max(500),
});

export const examQuestionInputSchema = z
  .object({
    questionType: onlineExamQuestionTypeSchema,
    prompt: z.string().trim().min(1).max(2000),
    points: z.coerce.number().positive().max(500),
    explanation: z.string().trim().max(1000).nullable().optional(),
    options: z.array(questionOptionSchema).max(8).default([]),
    correctOptionId: z.string().trim().max(64).nullable().optional(),
    correctBoolean: z.boolean().nullable().optional(),
    acceptedAnswers: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
    caseSensitive: z.boolean().default(false),
    autoGradable: z.boolean().default(true),
  })
  .superRefine((question, ctx) => {
    if (question.questionType === "mcq_single") {
      const nonEmptyOptions = question.options.filter((opt) => opt.text.trim().length > 0);
      if (nonEmptyOptions.length < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "Multiple-choice questions require at least 2 options",
        });
      }
      if (
        !question.correctOptionId ||
        !nonEmptyOptions.some((opt) => opt.id === question.correctOptionId)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["correctOptionId"],
          message: "Multiple-choice questions require a valid correctOptionId",
        });
      }
    }
    if (question.questionType === "true_false") {
      if (typeof question.correctBoolean !== "boolean") {
        ctx.addIssue({
          code: "custom",
          path: ["correctBoolean"],
          message: "True/False questions require a boolean correct answer",
        });
      }
    }
    if (question.questionType === "short_answer" && question.autoGradable) {
      if (question.acceptedAnswers.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["acceptedAnswers"],
          message: "Auto-graded short-answer questions require at least one accepted answer",
        });
      }
    }
  });

export const examsQuerySchema = z.object({
  groupId: z.string().uuid().optional(),
  status: onlineExamStatusSchema.optional(),
});

export const createOnlineExamSchema = z
  .object({
    groupId: z.string().uuid(),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
    instructions: z.string().trim().max(2000).nullable().optional(),
    assignmentScope: onlineExamAssignmentScopeSchema.default("group"),
    studentIds: z.array(z.string().uuid()).max(200).default([]),
    availableFrom: z.string().datetime(),
    availableUntil: z.string().datetime(),
    durationMinutes: z.coerce.number().int().min(5).max(240).default(30),
    maxAttempts: z.coerce.number().int().min(1).max(5).default(1),
    resultVisibility: onlineExamResultVisibilitySchema.default("after_manual_publish"),
    questions: z.array(examQuestionInputSchema).min(1).max(100),
  })
  .superRefine((value, ctx) => {
    const from = new Date(value.availableFrom);
    const until = new Date(value.availableUntil);
    if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime()) || until <= from) {
      ctx.addIssue({
        code: "custom",
        path: ["availableUntil"],
        message: "availableUntil must be after availableFrom",
      });
    }
    if (value.assignmentScope === "selected_students" && value.studentIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["studentIds"],
        message: "At least one student is required when assignmentScope is selected_students",
      });
    }
  });

export const updateOnlineExamActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("publish"),
  }),
  z.object({
    action: z.literal("close"),
  }),
  z.object({
    action: z.literal("publish_results"),
  }),
  z.object({
    action: z.literal("update_window"),
    availableFrom: z.string().datetime(),
    availableUntil: z.string().datetime(),
    durationMinutes: z.coerce.number().int().min(5).max(240).optional(),
    maxAttempts: z.coerce.number().int().min(1).max(5).optional(),
    resultVisibility: onlineExamResultVisibilitySchema.optional(),
  }),
]);

export const studentResponseItemSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.object({
    optionId: z.string().trim().max(64).optional(),
    value: z.boolean().optional(),
    text: z.string().max(4000).optional(),
  }),
});

export const saveStudentExamResponsesSchema = z.object({
  responses: z.array(studentResponseItemSchema).max(100),
  idempotencyKey: z.string().trim().min(4).max(120).optional(),
});

export const gradeExamAttemptSchema = z.object({
  decisions: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        awardedPoints: z.coerce.number().min(0).max(500),
        teacherFeedback: z.string().trim().max(1000).nullable().optional(),
      }),
    )
    .min(1)
    .max(100),
  gradingNote: z.string().trim().max(1000).nullable().optional(),
  reason: z.string().trim().min(3).max(500).optional(),
});

export type ExamsQuery = z.infer<typeof examsQuerySchema>;
export type ExamQuestionInput = z.infer<typeof examQuestionInputSchema>;
export type CreateOnlineExamInput = z.infer<typeof createOnlineExamSchema>;
export type UpdateOnlineExamActionInput = z.infer<typeof updateOnlineExamActionSchema>;
export type SaveStudentExamResponsesInput = z.infer<typeof saveStudentExamResponsesSchema>;
export type GradeExamAttemptInput = z.infer<typeof gradeExamAttemptSchema>;

export function parseExamInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED");
  }
  return parsed.data;
}
