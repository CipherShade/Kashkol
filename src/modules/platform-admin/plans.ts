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

/**
 * Sentinel used by the descriptive plan metadata. It is not a quota: enforcement
 * ignores plan limits entirely (ADR-0046).
 */
export const UNLIMITED_LIMIT = Number.MAX_SAFE_INTEGER;

export function isUnlimitedLimit(limit: number): boolean {
  return limit >= UNLIMITED_LIMIT;
}

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
  /** Platform metadata only; it no longer controls access (ADR-0045/0046). */
  billingMode: "usage_billing";
  limits: WorkspacePlanLimits;
  features: WorkspacePlanFeatures;
};

const UNLIMITED_FEATURES: WorkspacePlanFeatures = {
  onlineExamsEnabled: true,
  recordedVideosEnabled: true,
  reportExportsEnabled: true,
};

/**
 * Centralized plan metadata (`F-P3-03`, `F-P3-04`).
 *
 * All teacher workspaces are free and unlimited. Legacy tier names, statuses,
 * and limit overrides are retained for existing platform history and exports,
 * but they never gate a write or a feature (ADR-0046).
 */
export const WORKSPACE_PLAN_DEFINITIONS: Record<WorkspacePlanTier, WorkspacePlanDefinition> = {
  pilot: {
    tier: "pilot",
    billingMode: "usage_billing",
    limits: {
      maxActiveStudents: UNLIMITED_LIMIT,
      maxActiveGroups: UNLIMITED_LIMIT,
      maxAssistants: UNLIMITED_LIMIT,
      maxFileStorageBytes: UNLIMITED_LIMIT,
      maxVideoCount: UNLIMITED_LIMIT,
      maxVideoStorageBytes: UNLIMITED_LIMIT,
      maxVideoBandwidthBytesPerMonth: UNLIMITED_LIMIT,
    },
    features: UNLIMITED_FEATURES,
  },
  standard: {
    tier: "standard",
    billingMode: "usage_billing",
    limits: {
      maxActiveStudents: UNLIMITED_LIMIT,
      maxActiveGroups: UNLIMITED_LIMIT,
      maxAssistants: UNLIMITED_LIMIT,
      maxFileStorageBytes: UNLIMITED_LIMIT,
      maxVideoCount: UNLIMITED_LIMIT,
      maxVideoStorageBytes: UNLIMITED_LIMIT,
      maxVideoBandwidthBytesPerMonth: UNLIMITED_LIMIT,
    },
    features: UNLIMITED_FEATURES,
  },
  expanded: {
    tier: "expanded",
    billingMode: "usage_billing",
    limits: {
      maxActiveStudents: UNLIMITED_LIMIT,
      maxActiveGroups: UNLIMITED_LIMIT,
      maxAssistants: UNLIMITED_LIMIT,
      maxFileStorageBytes: UNLIMITED_LIMIT,
      maxVideoCount: UNLIMITED_LIMIT,
      maxVideoStorageBytes: UNLIMITED_LIMIT,
      maxVideoBandwidthBytesPerMonth: UNLIMITED_LIMIT,
    },
    features: UNLIMITED_FEATURES,
  },
};

/**
 * Legacy override schema. The values are still accepted and stored as platform
 * metadata for historical agreements; `resolveEffectiveWorkspacePlan` does not
 * apply them to access control (ADR-0046).
 */
export const planLimitOverridesSchema = z
  .object({
    maxActiveStudents: z.number().int().min(1).max(10_000).optional(),
    maxActiveGroups: z.number().int().min(1).max(500).optional(),
    maxAssistants: z.number().int().min(0).max(100).optional(),
    maxFileStorageBytes: z.number().int().min(10 * 1024 * 1024).max(100 * 1024 * 1024 * 1024).optional(),
    maxVideoCount: z.number().int().min(0).max(5_000).optional(),
    maxVideoStorageBytes: z.number().int().min(0).max(500 * 1024 * 1024 * 1024).optional(),
    maxVideoBandwidthBytesPerMonth: z
      .number()
      .int()
      .min(0)
      .max(5_000 * 1024 * 1024 * 1024)
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
  billingMode: "usage_billing";
  /** True for every workspace. Kept explicit so the UI cannot imply a quota. */
  unlimited: true;
  writesAllowed: boolean;
  writeRestrictionReason: null | "workspace_suspended" | "workspace_deleted";
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

  let writeRestrictionReason: EffectiveWorkspacePlan["writeRestrictionReason"] = null;
  if (accountStatus === "deleted") {
    writeRestrictionReason = "workspace_deleted";
  } else if (accountStatus === "suspended") {
    writeRestrictionReason = "workspace_suspended";
  }

  return {
    tier,
    planStatus,
    accountStatus,
    billingMode: "usage_billing",
    unlimited: true,
    writesAllowed: writeRestrictionReason === null,
    writeRestrictionReason,
    // Legacy overrides are preserved as metadata, never applied to access.
    limits: { ...base.limits },
    features: { ...base.features },
    overrides,
  };
}

export type LimitUtilizationItem = {
  used: number;
  /** `null` means unlimited, not zero and not an unknown quota. */
  limit: number | null;
  percent: number;
  state: "ok" | "warning" | "exceeded" | "unlimited";
};

export function computeLimitUtilization(used: number, limit: number): LimitUtilizationItem {
  if (isUnlimitedLimit(limit)) {
    return { used, limit: null, percent: 0, state: "unlimited" };
  }
  if (limit <= 0) {
    return { used, limit: 0, percent: used > 0 ? 100 : 0, state: "ok" };
  }
  const percent = Math.min(100, Math.round((used / limit) * 100));
  const state = used >= limit ? "exceeded" : percent >= 80 ? "warning" : "ok";
  return { used, limit, percent, state };
}
