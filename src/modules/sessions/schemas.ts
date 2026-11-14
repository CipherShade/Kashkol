import { z } from "zod";

export const sessionStatusSchema = z.enum(["scheduled", "started", "completed", "cancelled"]);

export const sessionQuerySchema = z.object({
  from: z.string().datetime({ message: "invalidFromDate" }),
  to: z.string().datetime({ message: "invalidToDate" }),
  groupId: z.string().uuid({ message: "invalidGroupId" }).optional(),
});

export type SessionQueryParams = z.infer<typeof sessionQuerySchema>;

export const createOneOffSessionSchema = z
  .object({
    groupId: z.string().uuid({ message: "invalidGroupId" }).optional().nullable(),
    gradeLabel: z.string().trim().max(100, { message: "gradeLabelTooLong" }).optional().nullable(),
    startsAt: z.string().datetime({ message: "invalidStartTime" }),
    endsAt: z.string().datetime({ message: "invalidEndTime" }).optional().nullable(),
    reason: z.string().trim().max(500).optional().nullable(),
    room: z.string().trim().max(100).optional().nullable(),
    location: z.string().trim().max(200).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    teacherId: z.string().trim().optional().nullable(),
    assistantId: z.string().trim().optional().nullable(),
    pricePerStudentMinor: z.coerce.number().int().min(0).nullable().optional(),
  })
  .refine(
    (data) => {
      if (!data.endsAt) return true;
      return new Date(data.endsAt) > new Date(data.startsAt);
    },
    { message: "endTimeMustBeAfterStartTime", path: ["endsAt"] },
  )
  .refine(
    (data) => !(data.groupId && data.gradeLabel),
    { message: "groupAndGradeAreMutuallyExclusive", path: ["gradeLabel"] },
  );

export type CreateOneOffSessionInput = z.infer<typeof createOneOffSessionSchema>;

export const rescheduleSessionSchema = z
  .object({
    id: z.string().uuid({ message: "invalidSessionId" }),
    startsAt: z.string().datetime({ message: "invalidStartTime" }),
    endsAt: z.string().datetime({ message: "invalidEndTime" }).optional().nullable(),
    reason: z.string().trim().min(1, { message: "reasonRequired" }).max(500),
    scope: z.enum(["single", "series"]).optional().default("single"),
  })
  .refine(
    (data) => {
      if (!data.endsAt) return true;
      return new Date(data.endsAt) > new Date(data.startsAt);
    },
    { message: "endTimeMustBeAfterStartTime", path: ["endsAt"] },
  );

export type RescheduleSessionInput = z.infer<typeof rescheduleSessionSchema>;

export const cancelSessionSchema = z.object({
  id: z.string().uuid({ message: "invalidSessionId" }),
  reason: z.string().trim().min(1, { message: "reasonRequired" }).max(500),
  scope: z.enum(["single", "series"]).optional().default("single"),
});

export type CancelSessionInput = z.infer<typeof cancelSessionSchema>;

export const updateSessionSchema = z
  .object({
    id: z.string().uuid({ message: "invalidSessionId" }),
    room: z.string().trim().max(100).optional().nullable(),
    location: z.string().trim().max(200).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    teacherId: z.string().trim().optional().nullable(),
    assistantId: z.string().trim().optional().nullable(),
    reason: z.string().trim().max(500).optional().nullable(),
    pricePerStudentMinor: z.coerce.number().int().min(0).nullable().optional(),
  });

export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

export const startSessionSchema = z.object({
  id: z.string().uuid({ message: "invalidSessionId" }),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;

export const completeSessionSchema = z.object({
  id: z.string().uuid({ message: "invalidSessionId" }),
});

export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;

export const generateSessionsSchema = z.object({
  groupId: z.string().uuid({ message: "invalidGroupId" }),
  weeksAhead: z.coerce.number().int().min(1).max(12).optional().default(4),
});

export type GenerateSessionsInput = z.infer<typeof generateSessionsSchema>;

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
