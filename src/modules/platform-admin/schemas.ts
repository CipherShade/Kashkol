import { z } from "zod";
import {
  WORKSPACE_ACCOUNT_STATUSES,
  WORKSPACE_PLAN_STATUSES,
  WORKSPACE_PLAN_TIERS,
  planLimitOverridesSchema,
} from "./plans";

export const platformWorkspacesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["all", ...WORKSPACE_ACCOUNT_STATUSES]).default("all"),
  planTier: z.enum(["all", ...WORKSPACE_PLAN_TIERS]).default("all"),
  planStatus: z.enum(["all", ...WORKSPACE_PLAN_STATUSES]).default("all"),
});

export type PlatformWorkspacesQuery = z.infer<typeof platformWorkspacesQuerySchema>;

export const updateWorkspacePlanSchema = z.object({
  planTier: z.enum(WORKSPACE_PLAN_TIERS),
  planStatus: z.enum(WORKSPACE_PLAN_STATUSES),
  limitOverrides: planLimitOverridesSchema.optional(),
  planNote: z.string().trim().max(500).nullable().optional(),
  reason: z.string().trim().min(5).max(500),
  confirmAction: z.literal(true),
  confirmationSlug: z.string().trim().min(2).max(120),
});

export type UpdateWorkspacePlanInput = z.infer<typeof updateWorkspacePlanSchema>;

export const updateWorkspaceStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().min(5).max(500),
  confirmAction: z.literal(true),
  confirmationSlug: z.string().trim().min(2).max(120),
});

export type UpdateWorkspaceStatusInput = z.infer<typeof updateWorkspaceStatusSchema>;

export const grantBreakGlassSchema = z.object({
  ticketRef: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, "Ticket reference must be alphanumeric"),
  reason: z.string().trim().min(10).max(500),
  durationMinutes: z.number().int().min(5).max(60).default(60),
  confirmAction: z.literal(true),
  confirmationSlug: z.string().trim().min(2).max(120),
});

export type GrantBreakGlassInput = z.infer<typeof grantBreakGlassSchema>;

export const revokeBreakGlassSchema = z.object({
  grantId: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
});

export type RevokeBreakGlassInput = z.infer<typeof revokeBreakGlassSchema>;
