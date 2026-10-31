import { z } from "zod";

export const portalPermissionsSchema = z.object({
  showAttendance: z.boolean().default(true),
  showGrades: z.boolean().default(true),
  showHomework: z.boolean().default(true),
  showResources: z.boolean().default(true),
  showPayments: z.boolean().default(false),
  showSchedule: z.boolean().default(true),
  showNotifications: z.boolean().default(true),
});

export type PortalPermissions = z.infer<typeof portalPermissionsSchema>;

export const issuePortalInvitationSchema = z
  .object({
    studentId: z.uuid(),
    kind: z.enum(["parent", "student"]),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(254)
      .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "invalidEmail"),
    guardianId: z.uuid().optional().nullable(),
    permissions: portalPermissionsSchema.partial().optional(),
  })
  .strict();

export type IssuePortalInvitationInput = z.infer<typeof issuePortalInvitationSchema>;

export const acceptPortalInvitationSchema = z
  .object({
    token: z.string().trim().min(32).max(256),
  })
  .strict();

export type AcceptPortalInvitationInput = z.infer<typeof acceptPortalInvitationSchema>;

export const updatePortalGrantPermissionsSchema = z
  .object({
    permissions: portalPermissionsSchema.partial(),
  })
  .strict();

export type UpdatePortalGrantPermissionsInput = z.infer<
  typeof updatePortalGrantPermissionsSchema
>;

export const upsertPushSubscriptionSchema = z
  .object({
    endpoint: z.url().max(2048),
    keys: z
      .object({
        p256dh: z.string().min(16).max(512),
        auth: z.string().min(8).max(256),
      })
      .strict(),
    includeSensitiveDetails: z.boolean().default(false),
  })
  .strict();

export type UpsertPushSubscriptionInput = z.infer<typeof upsertPushSubscriptionSchema>;

export const updatePushPreferenceSchema = z
  .object({
    endpoint: z.url().max(2048),
    includeSensitiveDetails: z.boolean(),
  })
  .strict();

export type UpdatePushPreferenceInput = z.infer<typeof updatePushPreferenceSchema>;

export const deletePushSubscriptionSchema = z
  .object({
    endpoint: z.url().max(2048),
  })
  .strict();

export type DeletePushSubscriptionInput = z.infer<typeof deletePushSubscriptionSchema>;
