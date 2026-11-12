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

/**
 * Student sign-in with the phone number as the username.
 *
 * The phone is normalised by the service; an invalid value is rejected with
 * the same generic error as a wrong password, so the form cannot be used to
 * probe which phone numbers have accounts.
 */
export const portalSignInSchema = z
  .object({
    phone: z.string().trim().min(1).max(30),
    password: z.string().min(1).max(128),
  })
  .strict();

export type PortalSignInInput = z.infer<typeof portalSignInSchema>;

export const setPortalAccessStatusSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();

export type SetPortalAccessStatusInput = z.infer<typeof setPortalAccessStatusSchema>;

export const provisionPortalAccessSchema = z.object({}).strict();


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
