import { z } from "zod";

export const GROUP_COLOR_PALETTE = [
  "indigo",
  "emerald",
  "amber",
  "rose",
  "sky",
  "violet",
  "teal",
  "orange",
] as const;

export type GroupColor = (typeof GROUP_COLOR_PALETTE)[number];

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const createGroupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { message: "groupNameRequired" })
      .max(100, { message: "groupNameTooLong" }),
    subjectId: z.string().uuid({ message: "invalidSubjectId" }).optional().nullable(),
    subjectName: z.string().trim().max(60).optional().nullable(),
    grade: z
      .string()
      .trim()
      .max(40, { message: "gradeTooLong" })
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
    room: z
      .string()
      .trim()
      .max(60, { message: "roomTooLong" })
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
    color: z
      .enum(GROUP_COLOR_PALETTE, { message: "invalidColor" })
      .optional()
      .default("indigo"),
    weekday: z
      .coerce
      .number()
      .int()
      .min(0, { message: "weekdayRange" })
      .max(6, { message: "weekdayRange" }), // 0 = Saturday, 6 = Friday
    startTime: z
      .string()
      .trim()
      .regex(timeRegex, { message: "invalidStartTimeFormat" }),
    endTime: z
      .string()
      .trim()
      .regex(timeRegex, { message: "invalidEndTimeFormat" })
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
    capacity: z
      .coerce
      .number()
      .int()
      .min(1, { message: "capacityMin" })
      .max(500, { message: "capacityMax" })
      .optional()
      .nullable(),
    teacherNote: z
      .string()
      .trim()
      .max(1000, { message: "teacherNoteTooLong" })
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
  })
  .refine(
    (data) => {
      if (!data.endTime) return true;
      return data.endTime > data.startTime;
    },
    { message: "endTimeMustBeAfterStartTime", path: ["endTime"] },
  );

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = z
  .object({
    id: z.string().uuid({ message: "invalidGroupId" }),
    name: z
      .string()
      .trim()
      .min(1, { message: "groupNameRequired" })
      .max(100, { message: "groupNameTooLong" }),
    subjectId: z.string().uuid({ message: "invalidSubjectId" }).optional().nullable(),
    grade: z
      .string()
      .trim()
      .max(40, { message: "gradeTooLong" })
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
    room: z
      .string()
      .trim()
      .max(60, { message: "roomTooLong" })
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
    color: z
      .enum(GROUP_COLOR_PALETTE, { message: "invalidColor" })
      .optional()
      .default("indigo"),
    weekday: z
      .coerce
      .number()
      .int()
      .min(0, { message: "weekdayRange" })
      .max(6, { message: "weekdayRange" }),
    startTime: z
      .string()
      .trim()
      .regex(timeRegex, { message: "invalidStartTimeFormat" }),
    endTime: z
      .string()
      .trim()
      .regex(timeRegex, { message: "invalidEndTimeFormat" })
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
    capacity: z
      .coerce
      .number()
      .int()
      .min(1, { message: "capacityMin" })
      .max(500, { message: "capacityMax" })
      .optional()
      .nullable(),
    teacherNote: z
      .string()
      .trim()
      .max(1000, { message: "teacherNoteTooLong" })
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
  })
  .refine(
    (data) => {
      if (!data.endTime) return true;
      return data.endTime > data.startTime;
    },
    { message: "endTimeMustBeAfterStartTime", path: ["endTime"] },
  );

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const groupQuerySchema = z.object({
  search: z.string().trim().optional(),
  subjectId: z.string().uuid().optional(),
  grade: z.string().trim().optional(),
  weekday: z.coerce.number().int().min(0).max(6).optional(),
  showArchived: z
    .union([z.boolean(), z.string().transform((v) => v === "true" || v === "1")])
    .optional()
    .default(false),
});

export type GroupQueryParams = z.infer<typeof groupQuerySchema>;

export const enrollStudentSchema = z.object({
  groupId: z.string().uuid({ message: "invalidGroupId" }),
  studentId: z.string().uuid({ message: "invalidStudentId" }),
});

export type EnrollStudentInput = z.infer<typeof enrollStudentSchema>;

export const removeStudentSchema = z.object({
  groupId: z.string().uuid({ message: "invalidGroupId" }),
  studentId: z.string().uuid({ message: "invalidStudentId" }),
});

export type RemoveStudentInput = z.infer<typeof removeStudentSchema>;

export const transferStudentSchema = z.object({
  fromGroupId: z.string().uuid({ message: "invalidFromGroupId" }),
  toGroupId: z.string().uuid({ message: "invalidToGroupId" }),
  studentId: z.string().uuid({ message: "invalidStudentId" }),
});

export type TransferStudentInput = z.infer<typeof transferStudentSchema>;

export function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key) {
      if (!fields[key]) fields[key] = [];
      fields[key].push(issue.message);
    }
  }
  return fields;
}
