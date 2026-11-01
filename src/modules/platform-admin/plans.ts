import { z } from "zod";

export const WORKSPACE_PLAN_TIERS = ["pilot", "standard", "expanded"] as const;
export type WorkspacePlanTier = (typeof WORKSPACE_PLAN_TIERS)[number];

export const WORKSPACE_PLAN_STATUSES = [
  "pilot_active",
  "active",
  "past_due",
  "suspended",
  "cancelled",
] as const;
export type WorkspacePlanStatus = (typeof WORKSPACE_PLAN_STATUSES)[number];

export const WORKSPACE_ACCOUNT_STATUSES = ["active", "suspended", "deleted"] as const;
export type WorkspaceAccountStatus = (typeof WORKSPACE_ACCOUNT_STATUSES)[number];

export type WorkspacePlanLimits = {
  maxActiveStudents: number;
  maxActiveGroups: number;
  maxAssistants: number;
  maxFileStorageBytes: number;
  maxVideoCount: number;
  maxVideoStorageBytes: number;
  maxVideoBandwidthBytesPerMonth: number;
};

export type WorkspacePlanFeatures = {
  onlineExamsEnabled: boolean;
  recordedVideosEnabled: boolean;
  reportExportsEnabled: boolean;
};

export type WorkspacePlanDefinition = {
  tier: WorkspacePlanTier;
  /**
   * Manual pilot/contract assignment only (`F-P3-04`).
   * Online card billing and final retail pricing are intentionally not hardcoded.
   */
  billingMode: "manual_pilot";
  limits: WorkspacePlanLimits;
  features: WorkspacePlanFeatures;
};

const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * Centralized workspace plan definitions (`F-P3-04`).
 *
 * All feature and usage limits live here rather than being scattered across UI
 * components or route handlers. Per-workspace overrides can adjust any limit or
 * feature gate for specific pilot agreements without code changes.
 */
export const WORKSPACE_PLAN_DEFINITIONS: Record<WorkspacePlanTier, WorkspacePlanDefinition> = {
  pilot: {
    tier: "pilot",
    billingMode: "manual_pilot",
    limits: {
      maxActiveStudents: 150,
      maxActiveGroups: 12,
      maxAssistants: 3,
      maxFileStorageBytes: 500 * MB,
      maxVideoCount: 25,
      maxVideoStorageBytes: 2 * GB,
      maxVideoBandwidthBytesPerMonth: 20 * GB,
    },
    features: {
      onlineExamsEnabled: true,
      recordedVideosEnabled: true,
      reportExportsEnabled: true,
    },
  },
  standard: {
    tier: "standard",
    billingMode: "manual_pilot",
    limits: {
      maxActiveStudents: 400,
      maxActiveGroups: 25,
      maxAssistants: 5,
      maxFileStorageBytes: 2 * GB,
      maxVideoCount: 50,
      maxVideoStorageBytes: 5 * GB,
      maxVideoBandwidthBytesPerMonth: 50 * GB,
    },
    features: {
      onlineExamsEnabled: true,
      recordedVideosEnabled: true,
      reportExportsEnabled: true,
    },
  },
  expanded: {
    tier: "expanded",
    billingMode: "manual_pilot",
    limits: {
      maxActiveStudents: 1500,
      maxActiveGroups: 60,
      maxAssistants: 15,
      maxFileStorageBytes: 10 * GB,
      maxVideoCount: 200,
      maxVideoStorageBytes: 25 * GB,
      maxVideoBandwidthBytesPerMonth: 250 * GB,
    },
    features: {
      onlineExamsEnabled: true,
      recordedVideosEnabled: true,
      reportExportsEnabled: true,
    },
  },
};

export const planLimitOverridesSchema = z
  .object({
    maxActiveStudents: z.number().int().min(1).max(10_000).optional(),
    maxActiveGroups: z.number().int().min(1).max(500).optional(),
    maxAssistants: z.number().int().min(0).max(100).optional(),
    maxFileStorageBytes: z
      .number()
      .int()
      .min(10 * MB)
      .max(100 * GB)
      .optional(),
    maxVideoCount: z.number().int().min(0).max(5_000).optional(),
    maxVideoStorageBytes: z
      .number()
      .int()
      .min(0)
      .max(500 * GB)
      .optional(),
    maxVideoBandwidthBytesPerMonth: z
      .number()
      .int()
      .min(0)
      .max(5_000 * GB)
      .optional(),
    onlineExamsEnabled: z.boolean().optional(),
    recordedVideosEnabled: z.boolean().optional(),
    reportExportsEnabled: z.boolean().optional(),
  })
  .strict();

export type PlanLimitOverrides = z.infer<typeof planLimitOverridesSchema>;

export type EffectiveWorkspacePlan = {
  tier: WorkspacePlanTier;
  planStatus: WorkspacePlanStatus;
  accountStatus: WorkspaceAccountStatus;
  billingMode: "manual_pilot";
  writesAllowed: boolean;
  writeRestrictionReason:
    | null
    | "workspace_suspended"
    | "workspace_deleted"
    | "plan_past_due"
    | "plan_suspended"
    | "plan_cancelled";
  limits: WorkspacePlanLimits;
  features: WorkspacePlanFeatures;
  overrides: PlanLimitOverrides;
};

export function parsePlanLimitOverrides(raw: unknown): PlanLimitOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const parsed = planLimitOverridesSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export function resolveEffectiveWorkspacePlan(input: {
  status?: WorkspaceAccountStatus | string | null;
  planTier?: WorkspacePlanTier | string | null;
  planStatus?: WorkspacePlanStatus | string | null;
  planLimitOverrides?: unknown;
}): EffectiveWorkspacePlan {
  const tier: WorkspacePlanTier = WORKSPACE_PLAN_TIERS.includes(
    input.planTier as WorkspacePlanTier,
  )
    ? (input.planTier as WorkspacePlanTier)
    : "pilot";

  const planStatus: WorkspacePlanStatus = WORKSPACE_PLAN_STATUSES.includes(
    input.planStatus as WorkspacePlanStatus,
  )
    ? (input.planStatus as WorkspacePlanStatus)
    : "pilot_active";

  const accountStatus: WorkspaceAccountStatus = WORKSPACE_ACCOUNT_STATUSES.includes(
    input.status as WorkspaceAccountStatus,
  )
    ? (input.status as WorkspaceAccountStatus)
    : "active";

  const base = WORKSPACE_PLAN_DEFINITIONS[tier];
  const overrides = parsePlanLimitOverrides(input.planLimitOverrides);

  const limits: WorkspacePlanLimits = {
    maxActiveStudents: overrides.maxActiveStudents ?? base.limits.maxActiveStudents,
    maxActiveGroups: overrides.maxActiveGroups ?? base.limits.maxActiveGroups,
    maxAssistants: overrides.maxAssistants ?? base.limits.maxAssistants,
    maxFileStorageBytes: overrides.maxFileStorageBytes ?? base.limits.maxFileStorageBytes,
    maxVideoCount: overrides.maxVideoCount ?? base.limits.maxVideoCount,
    maxVideoStorageBytes: overrides.maxVideoStorageBytes ?? base.limits.maxVideoStorageBytes,
    maxVideoBandwidthBytesPerMonth:
      overrides.maxVideoBandwidthBytesPerMonth ?? base.limits.maxVideoBandwidthBytesPerMonth,
  };

  const features: WorkspacePlanFeatures = {
    onlineExamsEnabled: overrides.onlineExamsEnabled ?? base.features.onlineExamsEnabled,
    recordedVideosEnabled: overrides.recordedVideosEnabled ?? base.features.recordedVideosEnabled,
    reportExportsEnabled: overrides.reportExportsEnabled ?? base.features.reportExportsEnabled,
  };

  let writeRestrictionReason: EffectiveWorkspacePlan["writeRestrictionReason"] = null;
  if (accountStatus === "deleted") {
    writeRestrictionReason = "workspace_deleted";
  } else if (accountStatus === "suspended") {
    writeRestrictionReason = "workspace_suspended";
  } else if (planStatus === "suspended") {
    writeRestrictionReason = "plan_suspended";
  } else if (planStatus === "past_due") {
    writeRestrictionReason = "plan_past_due";
  } else if (planStatus === "cancelled") {
    writeRestrictionReason = "plan_cancelled";
  }

  return {
    tier,
    planStatus,
    accountStatus,
    billingMode: "manual_pilot",
    writesAllowed: writeRestrictionReason === null,
    writeRestrictionReason,
    limits,
    features,
    overrides,
  };
}

export type LimitUtilizationItem = {
  used: number;
  limit: number;
  percent: number;
  state: "ok" | "warning" | "exceeded";
};

export function computeLimitUtilization(used: number, limit: number): LimitUtilizationItem {
  if (limit <= 0) {
    return {
      used,
      limit: 0,
      percent: used > 0 ? 100 : 0,
      state: used > 0 ? "exceeded" : "ok",
    };
  }
  const percent = Math.min(100, Math.round((used / limit) * 100));
  const state = used >= limit ? "exceeded" : percent >= 80 ? "warning" : "ok";
  return { used, limit, percent, state };
}
