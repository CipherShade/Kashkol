import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/http/errors";
import { permissionKey, type Scope } from "@/modules/tenancy/types";
import type { AuthUser, PortalContext } from "@/modules/identity/session";

// ---------------------------------------------------------------------------
// In-memory state for platform-admin, workspaces, usage, and audit logs
// ---------------------------------------------------------------------------

type MockPlatformAdminRow = {
  id: string;
  userId: string;
  grantedByUserId: string | null;
  grantReason: string;
  revokedAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
  };
};

type MockWorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  teachingName: string | null;
  primarySubject: string | null;
  gradesTaught: string[];
  status: "active" | "suspended" | "deleted";
  statusReason: string | null;
  statusUpdatedAt: Date | null;
  statusUpdatedBy: string | null;
  planTier: "pilot" | "standard" | "expanded";
  planStatus: "pilot_active" | "active" | "past_due" | "suspended" | "cancelled";
  planLimitOverrides: Record<string, unknown> | null;
  planAssignedAt: Date | null;
  planAssignedBy: string | null;
  planNote: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MockBreakGlassRow = {
  id: string;
  workspaceId: string;
  adminUserId: string;
  adminDisplayName: string;
  ticketRef: string;
  reason: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

const state = vi.hoisted(() => ({
  platformAdmins: new Map<string, MockPlatformAdminRow>(),
  workspaces: new Map<string, MockWorkspaceRow>(),
  breakGlassGrants: new Map<string, MockBreakGlassRow>(),
  platformAudits: [] as Array<{
    id: string;
    actorUserId: string;
    actorDisplayName: string;
    targetWorkspaceId: string | null;
    entityType: string;
    entityId: string;
    action: string;
    reason: string | null;
    diff: unknown;
    requestId: string | null;
    createdAt: Date;
  }>,
  workspaceAudits: [] as Array<{
    workspaceId: string;
    actorUserId: string | null;
    actorDisplayName: string | null;
    actorType: string;
    entityType: string;
    entityId: string;
    action: string;
    diff: unknown;
  }>,
  counts: {
    activeStudents: 12,
    archivedStudents: 2,
    activeGroups: 2,
    archivedGroups: 0,
    ownerMembers: 1,
    activeAssistants: 1,
    suspendedAssistants: 0,
    pendingInvites: 0,
    activeFiles: 5,
    fileStorageBytes: 10 * 1024 * 1024,
    scanPendingFiles: 0,
    scanBlockedFiles: 0,
    activeVideos: 2,
    videoStorageBytes: 100 * 1024 * 1024,
    videoDurationSeconds: 1200,
    videoPlaybackCount: 4,
    outboxTotal: 25,
    outboxPending: 1,
    outboxSent: 23,
    outboxFailed: 1,
    inAppNotifications: 18,
    examsTotal: 3,
    examsPublished: 2,
  },
}));

vi.mock("@/modules/platform-admin/repository", () => ({
  findActivePlatformAdminByUserId: vi.fn(async (userId: string) => {
    const row = state.platformAdmins.get(userId);
    if (!row || row.revokedAt !== null) return null;
    return row;
  }),

  listPlatformWorkspacesRaw: vi.fn(async (_adminUserId: string) => {
    return [...state.workspaces.values()].filter((w) => w.status !== "deleted");
  }),

  findPlatformWorkspaceByIdRaw: vi.fn(async (_adminUserId: string, workspaceId: string) => {
    const ws = state.workspaces.get(workspaceId);
    if (!ws || ws.status === "deleted") return null;
    return ws;
  }),

  collectWorkspaceUsageSummary: vi.fn(async (workspaceId: string, now: Date = new Date()) => {
    const activeGrant =
      [...state.breakGlassGrants.values()].find(
        (g) => g.workspaceId === workspaceId && g.revokedAt === null && g.expiresAt > now,
      ) ?? null;

    return {
      students: {
        activeCount: state.counts.activeStudents,
        archivedCount: state.counts.archivedStudents,
      },
      groups: {
        activeCount: state.counts.activeGroups,
        archivedCount: state.counts.archivedGroups,
      },
      members: {
        ownerCount: state.counts.ownerMembers,
        activeAssistantCount: state.counts.activeAssistants,
        suspendedAssistantCount: state.counts.suspendedAssistants,
        pendingInvitationCount: state.counts.pendingInvites,
        ownerName: "Mr. Ahmed Hassan",
        ownerEmail: "ahmed@teacher.example",
      },
      files: {
        activeCount: state.counts.activeFiles,
        totalCount: state.counts.activeFiles,
        totalSizeBytes: state.counts.fileStorageBytes,
        pendingScanCount: state.counts.scanPendingFiles,
        blockedScanCount: state.counts.scanBlockedFiles,
        measurementBasis: "exact_db_records" as const,
      },
      videos: {
        activeCount: state.counts.activeVideos,
        totalSizeBytes: state.counts.videoStorageBytes,
        totalDurationSeconds: state.counts.videoDurationSeconds,
        totalPlaybackCount: state.counts.videoPlaybackCount,
        estimatedBandwidthBytes:
          state.counts.videoStorageBytes * state.counts.videoPlaybackCount,
        isEstimate: true as const,
      },
      messages: {
        outboxTotal: state.counts.outboxTotal,
        pendingCount: state.counts.outboxPending,
        preparedCount: 0,
        sentCount: state.counts.outboxSent,
        deliveredCount: 0,
        failedCount: state.counts.outboxFailed,
        cancelledCount: 0,
        inAppNotificationCount: state.counts.inAppNotifications,
        isEstimate: true as const,
      },
      onlineExams: {
        totalCount: state.counts.examsTotal,
        publishedCount: state.counts.examsPublished,
      },
      lastActivityAt: "2026-11-01T10:00:00.000Z",
      activeBreakGlassGrant: activeGrant
        ? {
            id: activeGrant.id,
            adminUserId: activeGrant.adminUserId,
            adminDisplayName: activeGrant.adminDisplayName,
            ticketRef: activeGrant.ticketRef,
            reason: activeGrant.reason,
            expiresAt: activeGrant.expiresAt.toISOString(),
            createdAt: activeGrant.createdAt.toISOString(),
          }
        : null,
    };
  }),

  updateWorkspacePlanInScope: vi.fn(
    async (params: {
      workspaceId: string;
      actorUserId: string;
      actorDisplayName: string;
      input: {
        planTier: "pilot" | "standard" | "expanded";
        planStatus: "pilot_active" | "active" | "past_due" | "suspended" | "cancelled";
        limitOverrides?: Record<string, unknown>;
        planNote?: string | null;
        reason: string;
      };
      requestId: string;
      now: Date;
    }) => {
      const ws = state.workspaces.get(params.workspaceId);
      if (!ws) return null;
      const before = {
        planTier: ws.planTier,
        planStatus: ws.planStatus,
        planLimitOverrides: ws.planLimitOverrides,
      };
      ws.planTier = params.input.planTier;
      ws.planStatus = params.input.planStatus;
      ws.planLimitOverrides = params.input.limitOverrides ?? null;
      ws.planNote = params.input.planNote ?? null;
      ws.planAssignedAt = params.now;
      ws.planAssignedBy = params.actorUserId;

      state.workspaceAudits.push({
        workspaceId: params.workspaceId,
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        actorType: "platform_admin",
        entityType: "workspace",
        entityId: params.workspaceId,
        action: "platform.workspace.plan_updated",
        diff: { before, reason: params.input.reason },
      });

      state.platformAudits.push({
        id: `pa-${state.platformAudits.length + 1}`,
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        targetWorkspaceId: params.workspaceId,
        entityType: "workspace",
        entityId: params.workspaceId,
        action: "platform.workspace.plan_updated",
        reason: params.input.reason,
        diff: { before },
        requestId: params.requestId,
        createdAt: params.now,
      });

      return ws;
    },
  ),

  updateWorkspaceStatusInScope: vi.fn(
    async (params: {
      workspaceId: string;
      actorUserId: string;
      actorDisplayName: string;
      input: { status: "active" | "suspended"; reason: string };
      requestId: string;
      now: Date;
    }) => {
      const ws = state.workspaces.get(params.workspaceId);
      if (!ws) return null;
      const action =
        params.input.status === "suspended"
          ? "platform.workspace.suspended"
          : "platform.workspace.reactivated";
      ws.status = params.input.status;
      ws.statusReason = params.input.reason;
      ws.statusUpdatedAt = params.now;
      ws.statusUpdatedBy = params.actorUserId;

      state.workspaceAudits.push({
        workspaceId: params.workspaceId,
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        actorType: "platform_admin",
        entityType: "workspace",
        entityId: params.workspaceId,
        action,
        diff: { reason: params.input.reason },
      });

      state.platformAudits.push({
        id: `pa-${state.platformAudits.length + 1}`,
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        targetWorkspaceId: params.workspaceId,
        entityType: "workspace",
        entityId: params.workspaceId,
        action,
        reason: params.input.reason,
        diff: { status: params.input.status },
        requestId: params.requestId,
        createdAt: params.now,
      });

      return ws;
    },
  ),

  createBreakGlassGrantInScope: vi.fn(
    async (params: {
      workspaceId: string;
      actorUserId: string;
      actorDisplayName: string;
      ticketRef: string;
      reason: string;
      expiresAt: Date;
      requestId: string;
      now: Date;
    }) => {
      const id = "77777777-7777-4777-8777-777777777777";
      const grant: MockBreakGlassRow = {
        id,
        workspaceId: params.workspaceId,
        adminUserId: params.actorUserId,
        adminDisplayName: params.actorDisplayName,
        ticketRef: params.ticketRef,
        reason: params.reason,
        expiresAt: params.expiresAt,
        revokedAt: null,
        createdAt: params.now,
      };
      state.breakGlassGrants.set(id, grant);

      state.workspaceAudits.push({
        workspaceId: params.workspaceId,
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        actorType: "platform_admin",
        entityType: "break_glass_grant",
        entityId: id,
        action: "platform.break_glass.granted",
        diff: { ticketRef: params.ticketRef, reason: params.reason },
      });

      state.platformAudits.push({
        id: `pa-${state.platformAudits.length + 1}`,
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        targetWorkspaceId: params.workspaceId,
        entityType: "break_glass_grant",
        entityId: id,
        action: "platform.break_glass.granted",
        reason: params.reason,
        diff: { ticketRef: params.ticketRef },
        requestId: params.requestId,
        createdAt: params.now,
      });

      return grant;
    },
  ),

  revokeBreakGlassGrantInScope: vi.fn(
    async (params: {
      workspaceId: string;
      grantId: string;
      actorUserId: string;
      actorDisplayName: string;
      reason: string;
      requestId: string;
      now: Date;
    }) => {
      const grant = state.breakGlassGrants.get(params.grantId);
      if (!grant || grant.workspaceId !== params.workspaceId) return null;
      grant.revokedAt = params.now;

      state.workspaceAudits.push({
        workspaceId: params.workspaceId,
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        actorType: "platform_admin",
        entityType: "break_glass_grant",
        entityId: grant.id,
        action: "platform.break_glass.revoked",
        diff: { reason: params.reason },
      });

      state.platformAudits.push({
        id: `pa-${state.platformAudits.length + 1}`,
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName,
        targetWorkspaceId: params.workspaceId,
        entityType: "break_glass_grant",
        entityId: grant.id,
        action: "platform.break_glass.revoked",
        reason: params.reason,
        diff: { ticketRef: grant.ticketRef },
        requestId: params.requestId,
        createdAt: params.now,
      });

      return grant;
    },
  ),

  getBreakGlassSupportDiagnosticsInScope: vi.fn(
    async (workspaceId: string, adminUserId: string, now: Date) => {
      const grant = [...state.breakGlassGrants.values()].find(
        (g) =>
          g.workspaceId === workspaceId &&
          g.adminUserId === adminUserId &&
          g.revokedAt === null &&
          g.expiresAt > now,
      );
      if (!grant) return null;
      return {
        grant: {
          id: grant.id,
          ticketRef: grant.ticketRef,
          reason: grant.reason,
          expiresAt: grant.expiresAt.toISOString(),
          createdAt: grant.createdAt.toISOString(),
        },
        recentAuditActions: [
          {
            id: "ae-1",
            actorType: "member" as const,
            entityType: "session_occurrence",
            action: "attendance.session_closed",
            requestId: "req-1",
            createdAt: "2026-11-01T09:00:00.000Z",
          },
        ],
        failedExports: [
          {
            id: "re-1",
            type: "attendance_summary",
            failureCode: "STORAGE_TIMEOUT",
            createdAt: "2026-11-01T08:00:00.000Z",
          },
        ],
        failedOutboxMessages: [
          {
            id: "ob-1",
            channel: "web_push",
            type: "notification.dispatch",
            provider: "vapid",
            attempts: 3,
            lastError: "PUSH_ENDPOINT_GONE",
            failedAt: "2026-11-01T07:30:00.000Z",
          },
        ],
      };
    },
  ),

  listPlatformAuditEvents: vi.fn(async () => state.platformAudits),

  findActiveBreakGlassForWorkspace: vi.fn(async (workspaceId: string, now: Date) => {
    const grant = [...state.breakGlassGrants.values()].find(
      (g) => g.workspaceId === workspaceId && g.revokedAt === null && g.expiresAt > now,
    );
    if (!grant) return null;
    return {
      id: grant.id,
      adminDisplayName: grant.adminDisplayName,
      ticketRef: grant.ticketRef,
      reason: grant.reason,
      expiresAt: grant.expiresAt,
      createdAt: grant.createdAt,
    };
  }),

  getWorkspacePlanStateTx: vi.fn(async (_tx: unknown, workspaceId: string) => {
    const ws = state.workspaces.get(workspaceId);
    if (!ws) return null;
    return {
      id: ws.id,
      status: ws.status,
      planTier: ws.planTier,
      planStatus: ws.planStatus,
      planLimitOverrides: ws.planLimitOverrides,
    };
  }),

  countActiveStudentsTx: vi.fn(async () => state.counts.activeStudents),
  countActiveGroupsTx: vi.fn(async () => state.counts.activeGroups),
  countAssistantSeatsTx: vi.fn(
    async () =>
      state.counts.activeAssistants +
      state.counts.suspendedAssistants +
      state.counts.pendingInvites,
  ),
  sumWorkspaceFileBytesTx: vi.fn(async () => state.counts.fileStorageBytes),
}));

import {
  WORKSPACE_PLAN_DEFINITIONS,
  assertPlatformAdminContext,
  assertWorkspaceWriteAllowedTx,
  assignWorkspacePlan,
  changeWorkspaceAccountStatus,
  getPlatformAdminOverview,
  getPlatformWorkspaceDetail,
  getWorkspacePlanAndSupportSummary,
  grantBreakGlassSupportAccess,
  resolveEffectiveWorkspacePlan,
  resolvePlatformAdminForUser,
  revokeBreakGlassSupportAccess,
} from "@/modules/platform-admin";
import type { DbTransactionClient } from "@/lib/db/scope";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-01T12:00:00.000Z");

const PROVISIONED_ADMIN_USER: AuthUser = {
  id: "99999999-9999-4999-8999-999999999999",
  name: "Platform Operator",
  email: "ops@kashkol.example",
  emailVerified: true,
};

const TEACHER_OWNER_USER: AuthUser = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Mr. Ahmed Hassan",
  email: "ahmed@teacher.example",
  emailVerified: true,
};

const ASSISTANT_USER: AuthUser = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Mona Assistant",
  email: "mona@assistant.example",
  emailVerified: true,
};

const PARENT_USER: AuthUser = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Parent Guardian",
  email: "parent@family.example",
  emailVerified: true,
};

const STUDENT_USER: AuthUser = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Youssef Student",
  email: "youssef@student.example",
  emailVerified: true,
};

const TEACHER_OWNER_SCOPE: Scope = {
  workspaceId: WORKSPACE_ID,
  actorUserId: TEACHER_OWNER_USER.id,
  actorDisplayName: TEACHER_OWNER_USER.name,
  role: "owner",
  permissions: new Set([
    permissionKey("students", "write"),
    permissionKey("groups", "write"),
    permissionKey("settings", "read"),
    permissionKey("settings", "write"),
  ]),
};

const PARENT_PORTAL_CONTEXT: PortalContext = {
  userId: PARENT_USER.id,
  user: PARENT_USER,
  grants: [],
  workspaceIds: [WORKSPACE_ID],
  studentIds: new Set(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]),
};

describe("Platform Administration & SaaS Plan Limits (F-P3-03 & F-P3-04)", () => {
  beforeEach(() => {
    state.platformAdmins.clear();
    state.workspaces.clear();
    state.breakGlassGrants.clear();
    state.platformAudits.length = 0;
    state.workspaceAudits.length = 0;

    state.counts = {
      activeStudents: 12,
      archivedStudents: 2,
      activeGroups: 2,
      archivedGroups: 0,
      ownerMembers: 1,
      activeAssistants: 1,
      suspendedAssistants: 0,
      pendingInvites: 0,
      activeFiles: 5,
      fileStorageBytes: 10 * 1024 * 1024,
      scanPendingFiles: 0,
      scanBlockedFiles: 0,
      activeVideos: 2,
      videoStorageBytes: 100 * 1024 * 1024,
      videoDurationSeconds: 1200,
      videoPlaybackCount: 4,
      outboxTotal: 25,
      outboxPending: 1,
      outboxSent: 23,
      outboxFailed: 1,
      inAppNotifications: 18,
      examsTotal: 3,
      examsPublished: 2,
    };

    state.platformAdmins.set(PROVISIONED_ADMIN_USER.id, {
      id: "pa-rec-1",
      userId: PROVISIONED_ADMIN_USER.id,
      grantedByUserId: null,
      grantReason: "CLI runbook provisioning for SaaS operations",
      revokedAt: null,
      createdAt: NOW,
      user: PROVISIONED_ADMIN_USER,
    });

    state.workspaces.set(WORKSPACE_ID, {
      id: WORKSPACE_ID,
      name: "Mr. Ahmed Physics Workspace",
      slug: "ahmed-physics",
      teachingName: "Mr. Ahmed Hassan",
      primarySubject: "Physics",
      gradesTaught: ["sec_3"],
      status: "active",
      statusReason: null,
      statusUpdatedAt: null,
      statusUpdatedBy: null,
      planTier: "pilot",
      planStatus: "pilot_active",
      planLimitOverrides: null,
      planAssignedAt: NOW,
      planAssignedBy: "system",
      planNote: "Initial pilot cohort",
      deletedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  describe("1. Role boundaries & non-public provisioning (F-P3-03 AC-5)", () => {
    it("denies normal teacher owners, assistants, parents, and students from resolving PlatformAdminContext", async () => {
      for (const nonAdmin of [
        TEACHER_OWNER_USER,
        ASSISTANT_USER,
        PARENT_USER,
        STUDENT_USER,
      ]) {
        await expect(resolvePlatformAdminForUser(nonAdmin)).rejects.toMatchObject({
          code: "FORBIDDEN",
          messageKey: "errors.platformAdminRequired",
        });
      }
    });

    it("never auto-promotes the first user or hardcoded email addresses", async () => {
      const firstUser: AuthUser = {
        id: "00000000-0000-4000-8000-000000000001",
        name: "First User",
        email: "admin@kashkol.com",
        emailVerified: true,
      };
      await expect(resolvePlatformAdminForUser(firstUser)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("rejects unverified email accounts or revoked platform-admin records", async () => {
      const unverifiedAdmin: AuthUser = {
        ...PROVISIONED_ADMIN_USER,
        emailVerified: false,
      };
      await expect(resolvePlatformAdminForUser(unverifiedAdmin)).rejects.toMatchObject({
        code: "FORBIDDEN",
        messageKey: "errors.emailNotVerified",
      });

      // Revoke the admin record
      const record = state.platformAdmins.get(PROVISIONED_ADMIN_USER.id)!;
      record.revokedAt = NOW;

      await expect(resolvePlatformAdminForUser(PROVISIONED_ADMIN_USER)).rejects.toMatchObject({
        code: "FORBIDDEN",
        messageKey: "errors.platformAdminRequired",
      });
    });

    it("rejects forged or non-admin contexts passed to platform-admin service functions", async () => {
      expect(() => assertPlatformAdminContext(TEACHER_OWNER_SCOPE)).toThrow(AppError);
      expect(() => assertPlatformAdminContext(PARENT_PORTAL_CONTEXT)).toThrow(AppError);
      expect(() => assertPlatformAdminContext({ brand: "staff", userId: "123" })).toThrow(
        AppError,
      );

      await expect(
        getPlatformAdminOverview(TEACHER_OWNER_SCOPE as unknown as never),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });

  describe("2. Metadata-only workspace inspection & truthful usage visibility (F-P3-03 AC-1, NF-1)", () => {
    it("returns high-level workspace status, integration readiness, and usage summaries without student PII, notes, or grades", async () => {
      const admin = await resolvePlatformAdminForUser(PROVISIONED_ADMIN_USER);
      const overview = await getPlatformAdminOverview(admin, {}, NOW);

      expect(overview.totals.totalWorkspaces).toBe(1);
      expect(overview.totals.totalActiveStudents).toBe(12);
      expect(overview.integrations.items.map((i) => i.key)).toEqual([
        "email",
        "fileStorage",
        "malwareScanner",
        "videoProvider",
        "webPush",
        "whatsappMessaging",
        "saasBilling",
      ]);

      const ws = overview.workspaces[0]!;
      expect(ws.slug).toBe("ahmed-physics");
      expect(ws.usage.files.measurementBasis).toBe("exact_db_records");
      expect(ws.usage.videos.isEstimate).toBe(true);
      expect(ws.usage.messages.isEstimate).toBe(true);

      // Verify no student names, notes, grades, or guardian phones exist in the payload
      const serialized = JSON.stringify(overview);
      expect(serialized).not.toContain("guardianPhone");
      expect(serialized).not.toContain("privateNote");
      expect(serialized).not.toContain("assessmentScore");
    });
  });

  describe("3. Confirmation-gated admin actions, audit history, and break-glass policy (F-P3-03 AC-2/3/4)", () => {
    it("requires confirmAction=true, matching confirmationSlug, and a reason before changing plans or account status", async () => {
      const admin = await resolvePlatformAdminForUser(PROVISIONED_ADMIN_USER);

      // Wrong confirmation slug fails validation
      await expect(
        assignWorkspacePlan(
          admin,
          WORKSPACE_ID,
          {
            planTier: "standard",
            planStatus: "active",
            reason: "Approved upgrade to Standard tier",
            confirmationSlug: "wrong-slug",
            confirmAction: true,
          },
          { requestId: "req-1" },
          NOW,
        ),
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        messageKey: "errors.confirmationSlugMismatch",
      });

      // Short reason fails validation
      await expect(
        changeWorkspaceAccountStatus(
          admin,
          WORKSPACE_ID,
          {
            status: "suspended",
            reason: "no",
            confirmationSlug: "ahmed-physics",
            confirmAction: true,
          },
          { requestId: "req-2" },
          NOW,
        ),
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
      });
    });

    it("records both workspace and platform audit events when updating plan or suspending a workspace", async () => {
      const admin = await resolvePlatformAdminForUser(PROVISIONED_ADMIN_USER);

      const detailAfterPlan = await assignWorkspacePlan(
        admin,
        WORKSPACE_ID,
        {
          planTier: "standard",
          planStatus: "active",
          limitOverrides: { maxActiveStudents: 180 },
          planNote: "Pilot expansion cohort",
          reason: "PILOT-101: Upgraded workspace to Standard with 180 student cap",
          confirmationSlug: "ahmed-physics",
          confirmAction: true,
        },
        { requestId: "req-plan-1" },
        NOW,
      );

      expect(detailAfterPlan.workspace.plan.tier).toBe("standard");
      expect(detailAfterPlan.workspace.plan.limits.maxActiveStudents).toBe(180);
      expect(state.platformAudits).toHaveLength(1);
      expect(state.platformAudits[0]?.action).toBe("platform.workspace.plan_updated");
      expect(state.workspaceAudits).toHaveLength(1);
      expect(state.workspaceAudits[0]?.actorType).toBe("platform_admin");

      const detailAfterSuspend = await changeWorkspaceAccountStatus(
        admin,
        WORKSPACE_ID,
        {
          status: "suspended",
          reason: "SEC-202: Account suspended pending owner verification",
          confirmationSlug: "ahmed-physics",
          confirmAction: true,
        },
        { requestId: "req-status-1" },
        NOW,
      );

      expect(detailAfterSuspend.workspace.status).toBe("suspended");
      expect(state.platformAudits).toHaveLength(2);
      expect(state.platformAudits[1]?.action).toBe("platform.workspace.suspended");
    });

    it("enforces time-limited, reasoned, auditable break-glass diagnostics and exposes them to the workspace owner", async () => {
      const admin = await resolvePlatformAdminForUser(PROVISIONED_ADMIN_USER);

      // Without an active grant, diagnostics are null
      const initialDetail = await getPlatformWorkspaceDetail(admin, WORKSPACE_ID, NOW);
      expect(initialDetail.breakGlassDiagnostics).toBeNull();

      // Grant 30-minute break-glass support access
      const withGrant = await grantBreakGlassSupportAccess(
        admin,
        WORKSPACE_ID,
        {
          ticketRef: "SUP-900",
          durationMinutes: 30,
          reason: "Investigating failed report export timeout reported by teacher",
          confirmationSlug: "ahmed-physics",
          confirmAction: true,
        },
        { requestId: "req-bg-1" },
        NOW,
      );

      expect(withGrant.workspace.activeBreakGlassGrant?.ticketRef).toBe("SUP-900");
      expect(withGrant.breakGlassDiagnostics).not.toBeNull();
      expect(withGrant.breakGlassDiagnostics?.failedExports[0]?.failureCode).toBe(
        "STORAGE_TIMEOUT",
      );

      // Workspace owner can see the active break-glass banner in their subscription summary
      const ownerSummary = await getWorkspacePlanAndSupportSummary(
        TEACHER_OWNER_SCOPE,
        state.workspaces.get(WORKSPACE_ID)!,
        NOW,
      );
      expect(ownerSummary.activeBreakGlass?.ticketRef).toBe("SUP-900");

      // After 31 minutes, the grant expires automatically
      const afterExpiry = new Date(NOW.getTime() + 31 * 60 * 1000);
      const expiredDetail = await getPlatformWorkspaceDetail(admin, WORKSPACE_ID, afterExpiry);
      expect(expiredDetail.breakGlassDiagnostics).toBeNull();

      // Explicit revocation also ends the grant and audits it
      const grantId = withGrant.workspace.activeBreakGlassGrant!.id;
      await revokeBreakGlassSupportAccess(
        admin,
        WORKSPACE_ID,
        {
          grantId,
          reason: "Support ticket SUP-900 resolved",
        },
        { requestId: "req-bg-2" },
        NOW,
      );
      expect(state.platformAudits.at(-1)?.action).toBe("platform.break_glass.revoked");
    });
  });

  describe("4. Centralized plan definitions & server-side limit enforcement (F-P3-04 AC-1..5)", () => {
    const fakeTx = {} as unknown as DbTransactionClient;

    it("centralizes plan tiers in manual_pilot billing mode without hardcoded prices", () => {
      for (const tier of ["pilot", "standard", "expanded"] as const) {
        const def = WORKSPACE_PLAN_DEFINITIONS[tier];
        expect(def.billingMode).toBe("manual_pilot");
        expect("price" in def).toBe(false);
        expect(def.limits.maxActiveStudents).toBeGreaterThan(0);
      }
    });

    it("blocks all workspace mutations when account status is suspended or planStatus is past_due/cancelled", async () => {
      const ws = state.workspaces.get(WORKSPACE_ID)!;

      // Past due plan restricts writes
      ws.planStatus = "past_due";
      await expect(
        assertWorkspaceWriteAllowedTx(fakeTx, WORKSPACE_ID, { kind: "students" }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        messageKey: "errors.planWriteRestricted",
      });

      // Cancelled plan restricts writes
      ws.planStatus = "cancelled";
      await expect(
        assertWorkspaceWriteAllowedTx(fakeTx, WORKSPACE_ID, {
          kind: "students",
          additionalCount: 1,
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        messageKey: "errors.planWriteRestricted",
      });

      // Suspended workspace account blocks access
      ws.status = "suspended";
      await expect(
        assertWorkspaceWriteAllowedTx(fakeTx, WORKSPACE_ID, { kind: "groups" }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        messageKey: "errors.workspaceInactive",
      });
    });

    it("enforces student, group, assistant seat, file storage, and video quotas on the server", async () => {
      const ws = state.workspaces.get(WORKSPACE_ID)!;
      // Pilot tier defaults: maxActiveStudents=150, maxActiveGroups=12, maxAssistants=3, maxFileStorageBytes=500MB, maxVideoCount=25
      expect(ws.planTier).toBe("pilot");

      // 1. Student cap: 149 active + 2 imported = 151 > 150 -> rejected
      state.counts.activeStudents = 149;
      await expect(
        assertWorkspaceWriteAllowedTx(fakeTx, WORKSPACE_ID, {
          kind: "students",
          additionalCount: 2,
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        messageKey: "errors.planStudentLimitReached",
      });

      // Single student creation at 149 succeeds (149 + 1 <= 150)
      await expect(
        assertWorkspaceWriteAllowedTx(fakeTx, WORKSPACE_ID, {
          kind: "students",
          additionalCount: 1,
        }),
      ).resolves.toBeDefined();

      // 2. Group cap: 12 active -> creating another fails
      state.counts.activeGroups = 12;
      await expect(
        assertWorkspaceWriteAllowedTx(fakeTx, WORKSPACE_ID, { kind: "groups" }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        messageKey: "errors.planGroupLimitReached",
      });

      // 3. Assistant seats: 2 active assistants + 1 pending invite = 3 == limit(3) -> inviting another fails
      state.counts.activeAssistants = 2;
      state.counts.pendingInvites = 1;
      await expect(
        assertWorkspaceWriteAllowedTx(fakeTx, WORKSPACE_ID, { kind: "assistants" }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        messageKey: "errors.planAssistantLimitReached",
      });

      // 4. File storage bytes: 495 MB used + 10 MB upload > 500 MB -> fails
      state.counts.fileStorageBytes = 495 * 1024 * 1024;
      await expect(
        assertWorkspaceWriteAllowedTx(fakeTx, WORKSPACE_ID, {
          kind: "files",
          additionalBytes: 10 * 1024 * 1024,
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        messageKey: "errors.planFileStorageLimitReached",
      });

      // 5. Video count: 25 active videos -> creating 26th fails
      await expect(
        assertWorkspaceWriteAllowedTx(fakeTx, WORKSPACE_ID, {
          kind: "videos",
          currentVideoCount: 25,
          currentStorageBytes: 100 * 1024 * 1024,
          currentBandwidthBytes: 200 * 1024 * 1024,
          additionalSizeBytes: 5 * 1024 * 1024,
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        messageKey: "errors.videoCountLimitReached",
      });
    });

    it("enforces feature flags for online exams and recorded videos and preserves existing data on downgrade (F-P3-04 AC-3)", async () => {
      const ws = state.workspaces.get(WORKSPACE_ID)!;
      ws.planLimitOverrides = {
        maxActiveStudents: 10,
        onlineExamsEnabled: false,
        recordedVideosEnabled: false,
      };

      // Workspace already has 12 active students (> 10 override cap). Reading effective plan preserves data,
      // and blocks only new student additions.
      const effective = resolveEffectiveWorkspacePlan(ws);
      expect(effective.limits.maxActiveStudents).toBe(10);
      expect(state.counts.activeStudents).toBe(12);

      await expect(
        assertWorkspaceWriteAllowedTx(fakeTx, WORKSPACE_ID, {
          kind: "students",
          additionalCount: 1,
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        messageKey: "errors.planStudentLimitReached",
      });

      await expect(
        assertWorkspaceWriteAllowedTx(fakeTx, WORKSPACE_ID, { kind: "online_exams" }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        messageKey: "errors.planFeatureDisabled",
      });

      await expect(
        assertWorkspaceWriteAllowedTx(fakeTx, WORKSPACE_ID, {
          kind: "videos",
          currentVideoCount: 1,
          currentStorageBytes: 1024,
          currentBandwidthBytes: 1024,
          additionalSizeBytes: 1024,
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        messageKey: "errors.planFeatureDisabled",
      });
    });
  });
});
