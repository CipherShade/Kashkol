import { z } from "zod";

const uuid = z.string().uuid();
const date = z.iso.date();
const status = z.enum(["graded", "missing", "excused", "not_taken"]);
const assessmentType = z.enum(["paper_exam", "quiz", "test", "other"]);

export const performanceOverviewQuerySchema = z.object({
  from: date.optional(),
  to: date.optional(),
  groupId: uuid.optional(),
  subjectId: uuid.optional(),
  q: z.string().trim().max(120).optional(),
});

export const studentPerformanceQuerySchema = z.object({
  from: date.optional(),
  to: date.optional(),
  type: assessmentType.optional(),
});

export const classIntelligenceQuerySchema = z.object({
  groupId: uuid,
  from: date.optional(),
  to: date.optional(),
});

export const riskRuleKeySchema = z.enum(["low_average", "declining_trend", "weak_topic"]);

export const acknowledgeRiskSchema = z.object({
  studentId: uuid,
  ruleKey: riskRuleKeySchema,
  riskKey: z.string().trim().min(16).max(128),
  title: z.string().trim().min(1).max(160),
  from: date.optional(),
  to: date.optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  createFollowUp: z.boolean().default(false),
  dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

export const topicObservationSchema = z.object({
  topic: z.string().trim().min(1).max(120),
  correctCount: z.coerce.number().int().min(0).max(10000),
  incorrectCount: z.coerce.number().int().min(0).max(10000),
});

export const saveTopicResultsSchema = z.object({
  assessmentId: uuid,
  topics: z.array(topicObservationSchema).min(1).max(50),
});

export const saveReportNoteSchema = z.object({
  studentId: uuid,
  body: z.string().trim().min(1).max(2000),
});

export const bulkGradeRowSchema = z.object({
  studentId: uuid,
  score: z.coerce.number().finite().min(0).max(9999.99).nullable().optional(),
  status,
  note: z.string().trim().max(1000).nullable().optional(),
});

export const bulkGradesSchema = z
  .object({
    groupId: uuid,
    assessmentId: uuid.optional(),
    title: z.string().trim().min(1).max(160),
    type: assessmentType,
    date,
    maxScore: z.coerce.number().finite().positive().max(9999.99),
    extraCreditAllowance: z.coerce.number().finite().min(0).max(9999.99).nullable().optional(),
    scores: z.array(bulkGradeRowSchema).min(1).max(1000),
  })
  .refine(
    (input) =>
      input.extraCreditAllowance == null ||
      input.maxScore + input.extraCreditAllowance <= 9999.99,
    { path: ["extraCreditAllowance"], message: "extraCreditAllowanceOutOfRange" },
  )
  .superRefine((input, ctx) => {
    const seen = new Set<string>();
    input.scores.forEach((row, index) => {
      if (seen.has(row.studentId)) {
        ctx.addIssue({
          code: "custom",
          path: ["scores", index, "studentId"],
          message: "duplicateStudentRow",
        });
      }
      seen.add(row.studentId);
    });
  });

export const performanceSettingsSchema = z.object({
  enabled: z.boolean(),
  minAssessments: z.coerce.number().int().min(2).max(20),
  averageBelowPercent: z.coerce.number().int().min(1).max(100),
  consecutiveDeclines: z.coerce.number().int().min(1).max(10),
  weakTopicPercent: z.coerce.number().int().min(1).max(100),
});

export const parentPerformanceReportQuerySchema = z
  .object({
    from: date.optional(),
    to: date.optional(),
    locale: z.enum(["ar", "en"]).default("ar"),
    format: z.enum(["json", "csv", "xlsx", "pdf"]).default("json"),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ["to"],
    message: "dateRangeInvalid",
  });

export type PerformanceOverviewQuery = z.infer<typeof performanceOverviewQuerySchema>;
export type StudentPerformanceQuery = z.infer<typeof studentPerformanceQuerySchema>;
export type ClassIntelligenceQuery = z.infer<typeof classIntelligenceQuerySchema>;
export type AcknowledgeRiskInput = z.infer<typeof acknowledgeRiskSchema>;
export type SaveTopicResultsInput = z.infer<typeof saveTopicResultsSchema>;
export type SaveReportNoteInput = z.infer<typeof saveReportNoteSchema>;
export type BulkGradesInput = z.infer<typeof bulkGradesSchema>;
export type BulkGradeRow = z.infer<typeof bulkGradeRowSchema>;
export type ParentPerformanceReportQuery = z.infer<typeof parentPerformanceReportQuerySchema>;
export type PerformanceSettingsInput = z.infer<typeof performanceSettingsSchema>;
