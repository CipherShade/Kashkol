import { z } from "zod";

export const attendanceMarkValueSchema = z.enum(["present", "absent", "late", "excused"]);

export type AttendanceMarkValue = z.infer<typeof attendanceMarkValueSchema>;

export const attendanceSourceSchema = z.enum(["manual", "qr"]);

export type AttendanceSource = z.infer<typeof attendanceSourceSchema>;

export const getSessionRosterSchema = z.object({
  sessionId: z.string().uuid({ message: "invalidSessionId" }),
});

export type GetSessionRosterInput = z.infer<typeof getSessionRosterSchema>;

export const markAttendanceSchema = z.object({
  sessionId: z.string().uuid({ message: "invalidSessionId" }),
  studentId: z.string().uuid({ message: "invalidStudentId" }),
  mark: attendanceMarkValueSchema,
  reason: z.string().trim().max(500).optional().nullable(),
});

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

export const bulkMarkAttendanceSchema = z.object({
  sessionId: z.string().uuid({ message: "invalidSessionId" }),
  marks: z
    .array(
      z.object({
        studentId: z.string().uuid({ message: "invalidStudentId" }),
        mark: attendanceMarkValueSchema,
      }),
    )
    .min(1, { message: "noMarks" }),
  reason: z.string().trim().max(500).optional().nullable(),
});

export type BulkMarkAttendanceInput = z.infer<typeof bulkMarkAttendanceSchema>;

export const markAllPresentSchema = z.object({
  sessionId: z.string().uuid({ message: "invalidSessionId" }),
});

export type MarkAllPresentInput = z.infer<typeof markAllPresentSchema>;

export const correctAttendanceSchema = z.object({
  sessionId: z.string().uuid({ message: "invalidSessionId" }),
  studentId: z.string().uuid({ message: "invalidStudentId" }),
  newMark: attendanceMarkValueSchema,
  reason: z.string().trim().min(1, { message: "reasonRequired" }).max(500),
});

export type CorrectAttendanceInput = z.infer<typeof correctAttendanceSchema>;

export const bulkCorrectAttendanceSchema = z.object({
  sessionId: z.string().uuid({ message: "invalidSessionId" }),
  corrections: z
    .array(
      z.object({
        studentId: z.string().uuid({ message: "invalidStudentId" }),
        newMark: attendanceMarkValueSchema,
      }),
    )
    .min(1, { message: "noCorrections" }),
  reason: z.string().trim().min(1, { message: "reasonRequired" }).max(500),
});

export type BulkCorrectAttendanceSchemaInput = z.infer<typeof bulkCorrectAttendanceSchema>;

export const closeSessionSchema = z.object({
  sessionId: z.string().uuid({ message: "invalidSessionId" }),
  confirmIncomplete: z.boolean().optional().default(false),
});

export type CloseSessionInput = z.infer<typeof closeSessionSchema>;

export const issueQrTokenSchema = z.object({
  sessionId: z.string().uuid({ message: "invalidSessionId" }),
  ttlMinutes: z.coerce.number().int().min(1).max(240).optional().default(30),
});

export type IssueQrTokenInput = z.infer<typeof issueQrTokenSchema>;

export const scanQrSchema = z.object({
  token: z.string().min(1),
  sessionId: z.string().uuid({ message: "invalidSessionId" }).optional(),
  studentId: z.string().uuid({ message: "invalidStudentId" }).optional(),
  deviceId: z.string().trim().max(200).optional().nullable(),
  markLate: z.boolean().optional().default(false),
});

export type ScanQrInput = z.infer<typeof scanQrSchema>;

export const rotateQrTokenSchema = z.object({
  sessionId: z.string().uuid({ message: "invalidSessionId" }),
  ttlMinutes: z.coerce.number().int().min(1).max(240).optional().default(30),
});

export type RotateQrTokenInput = z.infer<typeof rotateQrTokenSchema>;

export const scanStudentQrSchema = z.object({
  qrToken: z.string().min(1, { message: "qrTokenRequired" }),
  sessionId: z.string().uuid({ message: "invalidSessionId" }),
  markLate: z.boolean().optional().default(false),
});

export type ScanStudentQrInput = z.infer<typeof scanStudentQrSchema>;

export const rotateStudentQrSchema = z.object({
  studentId: z.string().uuid({ message: "invalidStudentId" }),
});

export type RotateStudentQrInput = z.infer<typeof rotateStudentQrSchema>;

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
