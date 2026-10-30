import { z } from "zod";

export const NotificationTypeSchema = z.enum([
  "attendance_present",
  "attendance_absent",
  "attendance_late",
  "attendance_excused",
  "session_cancelled",
  "session_rescheduled",
  "homework_assigned",
  "homework_reminder",
  "exam_result",
  "general",
]);

export const MessageChannelSchema = z.enum(["whatsapp", "sms", "email", "in_app"]);

export const EnqueueAttendanceNotificationSchema = z.object({
  studentId: z.string().uuid(),
  sessionId: z.string().uuid(),
  mark: z.enum(["present", "absent", "late", "excused"]),
  locale: z.enum(["ar", "en"]).optional(),
});

export type EnqueueAttendanceNotificationInput = z.infer<typeof EnqueueAttendanceNotificationSchema>;

export const ListOutboxSchema = z.object({
  status: z.enum(["pending", "prepared", "sending", "sent", "delivered", "failed", "cancelled", "retried"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListOutboxInput = z.infer<typeof ListOutboxSchema>;

export const RetryOutboxSchema = z.object({
  outboxId: z.string().uuid(),
});

export type RetryOutboxInput = z.infer<typeof RetryOutboxSchema>;

const quietTime = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "messaging.errors.quietTimeInvalid");

export const notificationSettingsSchema = z
  .object({
    enabled: z.boolean(),
    quietHoursEnabled: z.boolean(),
    quietHoursStart: quietTime.nullable().default(null),
    quietHoursEnd: quietTime.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (!value.quietHoursEnabled) return;
    if (!value.quietHoursStart) {
      ctx.addIssue({
        code: "custom",
        path: ["quietHoursStart"],
        message: "messaging.errors.quietTimeRequired",
      });
    }
    if (!value.quietHoursEnd) {
      ctx.addIssue({
        code: "custom",
        path: ["quietHoursEnd"],
        message: "messaging.errors.quietTimeRequired",
      });
    }
    if (
      value.quietHoursStart &&
      value.quietHoursEnd &&
      value.quietHoursStart === value.quietHoursEnd
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["quietHoursEnd"],
        message: "messaging.errors.quietTimeSame",
      });
    }
  });

export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;

