import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import {
  getServerEnv,
  isEmailConfigured,
  isVideoProviderConfigured,
  isWebPushConfigured,
} from "@/lib/config/env";
import { getVerifiedSession, type AuthUser } from "@/modules/identity/session";
import { authorize, type Scope } from "@/modules/tenancy/types";
import {
  WORKSPACE_PLAN_DEFINITIONS,
  computeLimitUtilization,
  resolveEffectiveWorkspacePlan,
} from "./plans";
import {
  collectWorkspaceUsageSummary,
  createBreakGlassGrantInScope,
  findActiveBreakGlassForWorkspace,
  findActivePlatformAdminByUserId,
  findPlatformWorkspaceByIdRaw,
  getBreakGlassSupportDiagnosticsInScope,
  listPlatformAuditEvents,
  listPlatformWorkspacesRaw,
  revokeBreakGlassGrantInScope,
  updateWorkspacePlanInScope,
  updateWorkspaceStatusInScope,
} from "./repository";
import {
  grantBreakGlassSchema,
  platformWorkspacesQuerySchema,
  revokeBreakGlassSchema,
  updateWorkspacePlanSchema,
  updateWorkspaceStatusSchema,
  type PlatformWorkspacesQuery,
} from "./schemas";

export type PlatformAdminContext = {
  readonly brand: "platform_admin";
  adminRecordId: string;
  userId: string;
  email: string;
  displayName: string;
  grantedAt: string;
};

export type RequestContext = {
  requestId?: string;
  ipHash?: string | null;
};

function resolveRequestContext(request?: RequestContext) {
  return {
    requestId: request?.requestId ?? newRequestId(),
    ipHash: request?.ipHash ?? null,
  };
}

export function assertPlatformAdminContext(
  ctx: unknown,
): asserts ctx is PlatformAdminContext {
  if (
    !ctx ||
    typeof ctx !== "object" ||
    (ctx as { brand?: unknown }).brand !== "platform_admin" ||
    typeof (ctx as { userId?: unknown }).userId !== "string"
  ) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.platformAdminRequired" });
  }
}

/**
 * Resolve a verified platform-admin context for an authenticated user (`F-P3-03` AC-5).
 *
 * Never auto-promotes the first user or checks a hardcoded email. Only a non-revoked
 * row in `platform_admin` provisioned via the non-public runbook grants access.
 */
export async function resolvePlatformAdminForUser(
  user: AuthUser,
): Promise<PlatformAdminContext> {
  if (!user.emailVerified) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.emailNotVerified" });
  }

  const record = await findActivePlatformAdminByUserId(user.id);
  if (!record || !record.user.emailVerified) {
    throw new AppError("FORBIDDEN", { messageKey: "errors.platformAdminRequired" });
  }

  return {
    brand: "platform_admin",
    adminRecordId: record.id,
    userId: record.userId,
    email: record.user.email,
    displayName: record.user.name,
    grantedAt: record.createdAt.toISOString(),
  };
}

export async function requirePlatformAdminContext(
  requestHeaders?: Headers,
): Promise<PlatformAdminContext> {
  const session = await getVerifiedSession(requestHeaders);
  if (!session) {
    throw new AppError("UNAUTHORIZED");
  }
  return resolvePlatformAdminForUser({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
  });
}

export type IntegrationReadinessItem = {
  key:
    | "email"
    | "fileStorage"
    | "malwareScanner"
    | "videoProvider"
    | "webPush"
    | "whatsappMessaging"
    | "saasBilling";
  driver: string;
  configured: boolean;
  productionReady: boolean;
  measurementNoteKey: string;
};

export function getPlatformIntegrationReadiness(): {
  appEnv: "local" | "staging" | "production";
  items: IntegrationReadinessItem[];
} {
  const env = getServerEnv();
  const emailConfigured = isEmailConfigured(env);
  const storageConfigured =
    env.FILE_STORAGE_DRIVER === "local" || Boolean(env.S3_BUCKET && env.S3_REGION);
  const scannerConfigured = Boolean(env.CLAMAV_HOST);
  const videoConfigured = isVideoProviderConfigured(env);
  const pushConfigured = isWebPushConfigured(env);

  return {
    appEnv: env.APP_ENV,
    items: [
      {
        key: "email",
        driver: env.EMAIL_TRANSPORT,
        configured: emailConfigured,
        productionReady:
          env.APP_ENV === "local"
            ? emailConfigured
            : env.EMAIL_TRANSPORT !== "none" && env.EMAIL_TRANSPORT !== "console",
        measurementNoteKey: "PlatformAdmin.integrations.notes.email",
      },
      {
        key: "fileStorage",
        driver: env.FILE_STORAGE_DRIVER,
        configured: storageConfigured,
        productionReady:
          env.FILE_STORAGE_DRIVER === "s3" && Boolean(env.S3_BUCKET && env.S3_REGION),
        measurementNoteKey: "PlatformAdmin.integrations.notes.fileStorage",
      },
      {
        key: "malwareScanner",
        driver: scannerConfigured ? `clamav:${env.CLAMAV_PORT}` : "none",
        configured: scannerConfigured,
        productionReady: scannerConfigured,
        measurementNoteKey: "PlatformAdmin.integrations.notes.malwareScanner",
      },
      {
        key: "videoProvider",
        driver: env.VIDEO_PROVIDER_DRIVER,
        configured: videoConfigured,
        productionReady:
          env.VIDEO_PROVIDER_DRIVER === "cloudflare_stream" && videoConfigured,
        measurementNoteKey: "PlatformAdmin.integrations.notes.videoProvider",
      },
      {
        key: "webPush",
        driver: pushConfigured ? "vapid_web_push" : "none",
        configured: pushConfigured,
        productionReady: pushConfigured,
        measurementNoteKey: "PlatformAdmin.integrations.notes.webPush",
      },
      {
        key: "whatsappMessaging",
        driver: "wa_me_deep_link",
        configured: true,
        productionReady: true,
        measurementNoteKey: "PlatformAdmin.integrations.notes.whatsappMessaging",
      },
      {
        key: "saasBilling",
        driver: "manual_pilot",
        configured: true,
        productionReady: true,
        measurementNoteKey: "PlatformAdmin.integrations.notes.saasBilling",
      },
    ],
  };
}

function formatWorkspaceAdminProjection(
  ws: NonNullable<Awaited<ReturnType<typeof findPlatformWorkspaceByIdRaw>>>,
  usage: Awaited<ReturnType<typeof collectWorkspaceUsageSummary>>,
) {
  const effectivePlan = resolveEffectiveWorkspacePlan({
    status: ws.status,
    planTier: ws.planTier,
    planStatus: ws.planStatus,
    planLimitOverrides: ws.planLimitOverrides,
  });

  const assistantSeatsUsed =
    usage.members.activeAssistantCount +
    usage.members.suspendedAssistantCount +
    usage.members.pendingInvitationCount;

  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    teachingName: ws.teachingName,
    primarySubject: ws.primarySubject,
    gradesTaught: ws.gradesTaught,
    status: ws.status,
    statusReason: ws.statusReason,
    statusUpdatedAt: ws.statusUpdatedAt?.toISOString() ?? null,
    statusUpdatedBy: ws.statusUpdatedBy,
    createdAt: ws.createdAt.toISOString(),
    updatedAt: ws.updatedAt.toISOString(),
    lastActivityAt: usage.lastActivityAt,
    plan: {
      tier: effectivePlan.tier,
      status: effectivePlan.planStatus,
      billingMode: effectivePlan.billingMode,
      writesAllowed: effectivePlan.writesAllowed,
      writeRestrictionReason: effectivePlan.writeRestrictionReason,
      limits: effectivePlan.limits,
      features: effectivePlan.features,
      overrides: effectivePlan.overrides,
      assignedAt: ws.planAssignedAt?.toISOString() ?? null,
      assignedBy: ws.planAssignedBy,
      note: ws.planNote,
    },
    usage,
    utilization: {
      students: computeLimitUtilization(
        usage.students.activeCount,
        effectivePlan.limits.maxActiveStudents,
      ),
      groups: computeLimitUtilization(
        usage.groups.activeCount,
        effectivePlan.limits.maxActiveGroups,
      ),
      assistants: computeLimitUtilization(
        assistantSeatsUsed,
        effectivePlan.limits.maxAssistants,
      ),
      fileStorageBytes: computeLimitUtilization(
        usage.files.totalSizeBytes,
        effectivePlan.limits.maxFileStorageBytes,
      ),
      videoCount: computeLimitUtilization(
        usage.videos.activeCount,
        effectivePlan.limits.maxVideoCount,
      ),
      videoStorageBytes: computeLimitUtilization(
        usage.videos.totalSizeBytes,
        effectivePlan.limits.maxVideoStorageBytes,
      ),
      videoBandwidthBytes: computeLimitUtilization(
        usage.videos.estimatedBandwidthBytes,
        effectivePlan.limits.maxVideoBandwidthBytesPerMonth,
      ),
    },
    activeBreakGlassGrant: usage.activeBreakGlassGrant,
  };
}

export async function getPlatformAdminOverview(
  admin: PlatformAdminContext,
  rawQuery: Partial<PlatformWorkspacesQuery> = {},
  now: Date = new Date(),
) {
  assertPlatformAdminContext(admin);
  const query = platformWorkspacesQuerySchema.parse(rawQuery);

  const [workspaceRows, auditRows] = await Promise.all([
    listPlatformWorkspacesRaw(admin.userId, query),
    listPlatformAuditEvents({ limit: 30 }),
  ]);

  const workspaces = await Promise.all(
    workspaceRows.map(async (ws) => {
      const usage = await collectWorkspaceUsageSummary(ws.id, now);
      return formatWorkspaceAdminProjection(ws, usage);
    }),
  );

  const totals = workspaces.reduce(
    (acc, w) => {
      acc.totalWorkspaces += 1;
      if (w.status === "active") acc.activeWorkspaces += 1;
      if (w.status === "suspended") acc.suspendedWorkspaces += 1;
      acc.totalActiveStudents += w.usage.students.activeCount;
      acc.totalActiveGroups += w.usage.groups.activeCount;
      acc.totalFileStorageBytes += w.usage.files.totalSizeBytes;
      acc.totalVideoStorageBytes += w.usage.videos.totalSizeBytes;
      acc.totalEstimatedVideoBandwidthBytes += w.usage.videos.estimatedBandwidthBytes;
      acc.totalOutboxMessages += w.usage.messages.outboxTotal;
      return acc;
    },
    {
      totalWorkspaces: 0,
      activeWorkspaces: 0,
      suspendedWorkspaces: 0,
      totalActiveStudents: 0,
      totalActiveGroups: 0,
      totalFileStorageBytes: 0,
      totalVideoStorageBytes: 0,
      totalEstimatedVideoBandwidthBytes: 0,
      totalOutboxMessages: 0,
    },
  );

  return {
    admin: {
      userId: admin.userId,
      email: admin.email,
      displayName: admin.displayName,
      grantedAt: admin.grantedAt,
    },
    integrations: getPlatformIntegrationReadiness(),
    planCatalog: WORKSPACE_PLAN_DEFINITIONS,
    totals,
    workspaces,
    auditEvents: auditRows.map((e) => ({
      id: e.id,
      actorUserId: e.actorUserId,
      actorDisplayName: e.actorDisplayName,
      targetWorkspaceId: e.targetWorkspaceId,
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      reason: e.reason,
      diff: e.diff,
      requestId: e.requestId,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function getPlatformWorkspaceDetail(
  admin: PlatformAdminContext,
  workspaceId: string,
  now: Date = new Date(),
) {
  assertPlatformAdminContext(admin);
  const ws = await findPlatformWorkspaceByIdRaw(admin.userId, workspaceId);
  if (!ws) {
    throw new AppError("NOT_FOUND");
  }

  const [usage, auditRows, breakGlassDiagnostics] = await Promise.all([
    collectWorkspaceUsageSummary(workspaceId, now),
    listPlatformAuditEvents({ targetWorkspaceId: workspaceId, limit: 25 }),
    getBreakGlassSupportDiagnosticsInScope(workspaceId, admin.userId, now),
  ]);

  return {
    workspace: formatWorkspaceAdminProjection(ws, usage),
    breakGlassDiagnostics,
    auditEvents: auditRows.map((e) => ({
      id: e.id,
      actorUserId: e.actorUserId,
      actorDisplayName: e.actorDisplayName,
      targetWorkspaceId: e.targetWorkspaceId,
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      reason: e.reason,
      diff: e.diff,
      requestId: e.requestId,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

function zodIssuesToFields(
  issues: Array<{ path: PropertyKey[]; code: string }>,
): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "input";
    fields[key] = [...(fields[key] ?? []), issue.code];
  }
  return fields;
}

export async function assignWorkspacePlan(
  admin: PlatformAdminContext,
  workspaceId: string,
  rawInput: unknown,
  request?: RequestContext,
  now: Date = new Date(),
) {
  assertPlatformAdminContext(admin);
  const parsed = updateWorkspacePlanSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", {
      fields: zodIssuesToFields(parsed.error.issues),
    });
  }

  const ws = await findPlatformWorkspaceByIdRaw(admin.userId, workspaceId);
  if (!ws) {
    throw new AppError("NOT_FOUND");
  }

  if (parsed.data.confirmationSlug !== ws.slug) {
    throw new AppError("VALIDATION_FAILED", {
      messageKey: "errors.confirmationSlugMismatch",
      fields: { confirmationSlug: ["slug_mismatch"] },
    });
  }

  const reqCtx = resolveRequestContext(request);
  const updated = await updateWorkspacePlanInScope({
    workspaceId,
    actorUserId: admin.userId,
    actorDisplayName: admin.displayName,
    input: parsed.data,
    requestId: reqCtx.requestId,
    ipHash: reqCtx.ipHash,
    now,
  });

  if (!updated) {
    throw new AppError("NOT_FOUND");
  }

  return getPlatformWorkspaceDetail(admin, workspaceId, now);
}

export async function changeWorkspaceAccountStatus(
  admin: PlatformAdminContext,
  workspaceId: string,
  rawInput: unknown,
  request?: RequestContext,
  now: Date = new Date(),
) {
  assertPlatformAdminContext(admin);
  const parsed = updateWorkspaceStatusSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", {
      fields: zodIssuesToFields(parsed.error.issues),
    });
  }

  const ws = await findPlatformWorkspaceByIdRaw(admin.userId, workspaceId);
  if (!ws) {
    throw new AppError("NOT_FOUND");
  }

  if (parsed.data.confirmationSlug !== ws.slug) {
    throw new AppError("VALIDATION_FAILED", {
      messageKey: "errors.confirmationSlugMismatch",
      fields: { confirmationSlug: ["slug_mismatch"] },
    });
  }

  const reqCtx = resolveRequestContext(request);
  const updated = await updateWorkspaceStatusInScope({
    workspaceId,
    actorUserId: admin.userId,
    actorDisplayName: admin.displayName,
    input: parsed.data,
    requestId: reqCtx.requestId,
    ipHash: reqCtx.ipHash,
    now,
  });

  if (!updated) {
    throw new AppError("NOT_FOUND");
  }

  return getPlatformWorkspaceDetail(admin, workspaceId, now);
}

export async function grantBreakGlassSupportAccess(
  admin: PlatformAdminContext,
  workspaceId: string,
  rawInput: unknown,
  request?: RequestContext,
  now: Date = new Date(),
) {
  assertPlatformAdminContext(admin);
  const parsed = grantBreakGlassSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", {
      fields: zodIssuesToFields(parsed.error.issues),
    });
  }

  const ws = await findPlatformWorkspaceByIdRaw(admin.userId, workspaceId);
  if (!ws) {
    throw new AppError("NOT_FOUND");
  }

  if (parsed.data.confirmationSlug !== ws.slug) {
    throw new AppError("VALIDATION_FAILED", {
      messageKey: "errors.confirmationSlugMismatch",
      fields: { confirmationSlug: ["slug_mismatch"] },
    });
  }

  const expiresAt = new Date(now.getTime() + parsed.data.durationMinutes * 60 * 1000);
  const reqCtx = resolveRequestContext(request);

  await createBreakGlassGrantInScope({
    workspaceId,
    actorUserId: admin.userId,
    actorDisplayName: admin.displayName,
    ticketRef: parsed.data.ticketRef,
    reason: parsed.data.reason,
    expiresAt,
    requestId: reqCtx.requestId,
    ipHash: reqCtx.ipHash,
    now,
  });

  return getPlatformWorkspaceDetail(admin, workspaceId, now);
}

export async function revokeBreakGlassSupportAccess(
  admin: PlatformAdminContext,
  workspaceId: string,
  rawInput: unknown,
  request?: RequestContext,
  now: Date = new Date(),
) {
  assertPlatformAdminContext(admin);
  const parsed = revokeBreakGlassSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", {
      fields: zodIssuesToFields(parsed.error.issues),
    });
  }

  const ws = await findPlatformWorkspaceByIdRaw(admin.userId, workspaceId);
  if (!ws) {
    throw new AppError("NOT_FOUND");
  }

  const reqCtx = resolveRequestContext(request);
  const revoked = await revokeBreakGlassGrantInScope({
    workspaceId,
    grantId: parsed.data.grantId,
    actorUserId: admin.userId,
    actorDisplayName: admin.displayName,
    reason: parsed.data.reason,
    requestId: reqCtx.requestId,
    ipHash: reqCtx.ipHash,
    now,
  });

  if (!revoked) {
    throw new AppError("NOT_FOUND");
  }

  return getPlatformWorkspaceDetail(admin, workspaceId, now);
}

/**
 * Workspace-side subscription/plan and active break-glass visibility (`F-P3-03` AC-2, `F-P3-04` AC-1/2).
 */
export async function getWorkspacePlanAndSupportSummary(
  scope: Scope,
  workspaceRow: {
    status: string;
    planTier?: string | null;
    planStatus?: string | null;
    planLimitOverrides?: unknown;
  },
  now: Date = new Date(),
) {
  authorize(scope, "settings", "read");
  const [usage, activeBreakGlass] = await Promise.all([
    collectWorkspaceUsageSummary(scope.workspaceId, now),
    findActiveBreakGlassForWorkspace(scope.workspaceId, now),
  ]);

  const effective = resolveEffectiveWorkspacePlan(workspaceRow);
  const assistantSeatsUsed =
    usage.members.activeAssistantCount +
    usage.members.suspendedAssistantCount +
    usage.members.pendingInvitationCount;

  return {
    plan: {
      tier: effective.tier,
      status: effective.planStatus,
      billingMode: effective.billingMode,
      writesAllowed: effective.writesAllowed,
      writeRestrictionReason: effective.writeRestrictionReason,
      limits: effective.limits,
      features: effective.features,
    },
    utilization: {
      students: computeLimitUtilization(
        usage.students.activeCount,
        effective.limits.maxActiveStudents,
      ),
      groups: computeLimitUtilization(
        usage.groups.activeCount,
        effective.limits.maxActiveGroups,
      ),
      assistants: computeLimitUtilization(
        assistantSeatsUsed,
        effective.limits.maxAssistants,
      ),
      fileStorageBytes: computeLimitUtilization(
        usage.files.totalSizeBytes,
        effective.limits.maxFileStorageBytes,
      ),
      videoCount: computeLimitUtilization(
        usage.videos.activeCount,
        effective.limits.maxVideoCount,
      ),
      videoStorageBytes: computeLimitUtilization(
        usage.videos.totalSizeBytes,
        effective.limits.maxVideoStorageBytes,
      ),
    },
    activeBreakGlass: activeBreakGlass
      ? {
          id: activeBreakGlass.id,
          adminDisplayName: activeBreakGlass.adminDisplayName,
          ticketRef: activeBreakGlass.ticketRef,
          reason: activeBreakGlass.reason,
          expiresAt: activeBreakGlass.expiresAt.toISOString(),
        }
      : null,
  };
}
