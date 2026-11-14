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

// One recurring weekly meeting of a group (ADR-0029). A group may meet
// several times a week; each slot carries its own room and capacity.
export const groupSlotSchema = z
  .object({
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
    room: z
      .string()
      .trim()
      .max(60, { message: "roomTooLong" })
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
  });

export type GroupSlotInput = z.infer<typeof groupSlotSchema>;

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
    color: z
      .enum(GROUP_COLOR_PALETTE, { message: "invalidColor" })
      .optional()
      .default("indigo"),
    slots: z
      .array(groupSlotSchema)
      .min(1, { message: "atLeastOneScheduleSlot" }),
    teacherNote: z
      .string()
      .trim()
      .max(1000, { message: "teacherNoteTooLong" })
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
    defaultPricePerStudentMinor: z.coerce.number().int().min(0).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    // No two slots of the same group may overlap in time on the same weekday,
    // and a slot's end must be after its start.
    const seen = new Map<number, { startTime: string; endTime: string | null }[]>();
    for (const slot of data.slots) {
      if (slot.endTime && slot.endTime <= slot.startTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "endTimeMustBeAfterStartTime",
          path: ["slots"],
        });
        return;
      }
      const day = seen.get(slot.weekday) ?? [];
      const newStart = slot.startTime;
      const newEnd = slot.endTime ?? slot.startTime;
      for (const other of day) {
        const otherStart = other.startTime;
        const otherEnd = other.endTime ?? other.startTime;
        if (newStart < otherEnd && newEnd > otherStart) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "slotOverlapsSameGroup",
            path: ["slots"],
          });
          return;
        }
      }
      day.push({ startTime: slot.startTime, endTime: slot.endTime });
      seen.set(slot.weekday, day);
    }
  });

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
    color: z
      .enum(GROUP_COLOR_PALETTE, { message: "invalidColor" })
      .optional()
      .default("indigo"),
    slots: z
      .array(groupSlotSchema)
      .min(1, { message: "atLeastOneScheduleSlot" }),
    teacherNote: z
      .string()
      .trim()
      .max(1000, { message: "teacherNoteTooLong" })
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
    defaultPricePerStudentMinor: z.coerce.number().int().min(0).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const seen = new Map<number, { startTime: string; endTime: string | null }[]>();
    for (const slot of data.slots) {
      if (slot.endTime && slot.endTime <= slot.startTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "endTimeMustBeAfterStartTime",
          path: ["slots"],
        });
        return;
      }
      const day = seen.get(slot.weekday) ?? [];
      const newStart = slot.startTime;
      const newEnd = slot.endTime ?? slot.startTime;
      for (const other of day) {
        const otherStart = other.startTime;
        const otherEnd = other.endTime ?? other.startTime;
        if (newStart < otherEnd && newEnd > otherStart) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "slotOverlapsSameGroup",
            path: ["slots"],
          });
          return;
        }
      }
      day.push({ startTime: slot.startTime, endTime: slot.endTime });
      seen.set(slot.weekday, day);
    }
  });

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const updateGroupPriceSchema = z.object({
  defaultPricePerStudentMinor: z.coerce.number().int().min(0).nullable(),
});

export type UpdateGroupPriceInput = z.infer<typeof updateGroupPriceSchema>;

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
