import { z } from "zod";

const uuid = z.string().uuid();

export const createHomeworkSchema = z
  .object({
    groupId: uuid.nullable().optional(),
    studentIds: z.array(uuid).min(1).max(500).optional(),
    title: z.string().trim().min(1).max(160),
    instructions: z.string().trim().max(4000).nullable().optional(),
    dueAt: z.iso.datetime({ offset: true }),
    resourceFileIds: z.array(uuid).max(10).default([]),
    maxScore: z.number().finite().positive().max(9999.99).nullable().optional(),
  })
  .refine((value) => Boolean(value.groupId) !== Boolean(value.studentIds?.length), {
    message: "chooseGroupOrStudents",
  })
  .refine(
    (value) => !value.studentIds || new Set(value.studentIds).size === value.studentIds.length,
    { path: ["studentIds"], message: "duplicateStudents" },
  )
  .refine((value) => new Set(value.resourceFileIds).size === value.resourceFileIds.length, {
    path: ["resourceFileIds"],
    message: "duplicateResources",
  });

export const updateHomeworkSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  instructions: z.string().trim().max(4000).nullable().optional(),
  dueAt: z.iso.datetime({ offset: true }).optional(),
  maxScore: z.number().finite().positive().max(9999.99).nullable().optional(),
});

export const homeworkQuerySchema = z.object({
  showArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  studentId: uuid.optional(),
});

export const updateSubmissionSchema = z.object({
  status: z.enum(["not_submitted", "submitted", "late", "excused"]),
  teacherFeedback: z.string().trim().max(2000).nullable().optional(),
  score: z.number().finite().min(0).max(9999.99).nullable().optional(),
});

export const archiveHomeworkSchema = z.object({ archived: z.boolean() });

export const homeworkCompletionStatusSchema = z.enum(["completed", "not_completed", "not_applicable"]);
export type HomeworkCompletionStatus = z.infer<typeof homeworkCompletionStatusSchema>;

export const recordHomeworkCompletionMarkSchema = z.object({
  homeworkId: uuid,
  sessionId: uuid.optional().nullable(),
  studentId: uuid,
  status: homeworkCompletionStatusSchema,
  note: z.string().trim().max(500).optional().nullable(),
});
export type RecordHomeworkCompletionMarkInput = z.infer<typeof recordHomeworkCompletionMarkSchema>;

export const bulkRecordHomeworkCompletionSchema = z.object({
  homeworkId: uuid,
  sessionId: uuid.optional().nullable(),
  marks: z
    .array(
      z.object({
        studentId: uuid,
        status: homeworkCompletionStatusSchema,
        note: z.string().trim().max(500).optional().nullable(),
      }),
    )
    .min(1, { message: "noMarks" }),
});
export type BulkRecordHomeworkCompletionInput = z.infer<typeof bulkRecordHomeworkCompletionSchema>;

export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>;
export type UpdateHomeworkInput = z.infer<typeof updateHomeworkSchema>;
export type HomeworkQuery = z.infer<typeof homeworkQuerySchema>;
export type UpdateSubmissionInput = z.infer<typeof updateSubmissionSchema>;
