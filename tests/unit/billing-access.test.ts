import { describe, expect, it } from "vitest";
import { ROUTES, findRoute } from "@/lib/routes/registry";
import type { PlatformAdminContext } from "@/modules/platform-admin/service";
import type { Scope } from "@/modules/tenancy/types";
import {
  createPlatformBillingAdjustment,
  createPlatformBillingExemption,
  getPlatformBillingOverview,
  getTeacherBilling,
  reviewPlatformBillingSubmission,
  runPlatformBillingCycle,
  submitBillingPayment,
  updatePlatformBillingConfig,
} from "@/modules/billing/service";
import {
  billingAdminQuerySchema,
  billingQuerySchema,
} from "@/modules/billing/schemas";

const OWNER: Scope = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  actorUserId: "owner-1",
  actorDisplayName: "Owner",
  role: "owner",
  permissions: new Set(),
};

const ASSISTANT: Scope = {
  ...OWNER,
  actorUserId: "assistant-1",
  actorDisplayName: "Assistant",
  role: "assistant",
};

const ADMIN: PlatformAdminContext = {
  brand: "platform_admin",
  adminRecordId: "admin-record-1",
  userId: "admin-user-1",
  email: "admin@example.test",
  displayName: "Platform admin",
  grantedAt: "2026-01-01T00:00:00.000Z",
};

const NOT_ADMIN = {
  userId: "teacher-1",
  email: "teacher@example.test",
  displayName: "Teacher",
};

const SUBMISSION = {
  invoiceId: "00000000-0000-4000-8000-000000000002",
  reference: "TXN-123456",
  amountMinor: 5000,
  transferredAt: "2026-11-27T10:00:00Z",
  idempotencyKey: "submission-1",
};

describe("billing permission boundary", () => {
  it("denies assistants every teacher billing operation before any data is read", async () => {
    await expect(getTeacherBilling(ASSISTANT, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(submitBillingPayment(ASSISTANT, SUBMISSION)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("denies non-admin callers every platform billing operation", async () => {
    await expect(getPlatformBillingOverview(NOT_ADMIN as never, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
      messageKey: "errors.platformAdminRequired",
    });
    await expect(
      updatePlatformBillingConfig(NOT_ADMIN as never, {
        thresholdMinor: 5000,
        instapayHandle: "handle@instapay",
        instapayLink: "",
        reason: "Change threshold",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createPlatformBillingExemption(NOT_ADMIN as never, OWNER.workspaceId, {
        reason: "internal_testing",
        startDate: "2026-11-01",
        reasonForAudit: "Internal testing",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      reviewPlatformBillingSubmission(NOT_ADMIN as never, OWNER.workspaceId, "sub-1", {
        action: "approved",
        note: "Verified",
        idempotencyKey: "review-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createPlatformBillingAdjustment(NOT_ADMIN as never, {
        workspaceId: OWNER.workspaceId,
        direction: "credit",
        amountMinor: 100,
        reason: "Manual correction",
        idempotencyKey: "adjustment-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(runPlatformBillingCycle(NOT_ADMIN as never)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects client-supplied workspace ids in teacher billing payloads", () => {
    expect(billingQuerySchema.safeParse({ month: "2026-11" }).success).toBe(true);
    expect(billingQuerySchema.safeParse({ month: "2026-11", workspaceId: OWNER.workspaceId }).success).toBe(false);
    expect(billingAdminQuerySchema.safeParse({ workspaceId: OWNER.workspaceId }).success).toBe(false);
    expect(
      billingQuerySchema.safeParse({ ...SUBMISSION, workspaceId: OWNER.workspaceId }).success,
    ).toBe(false);
  });

  it("keeps a valid admin context accepted by the service boundary", () => {
    expect(ADMIN.brand).toBe("platform_admin");
  });
});

describe("billing route registry isolation matrix", () => {
  const billingRoutes = ROUTES.filter((route) => route.path.includes("billing"));

  it("registers every billing API route with one of the expected access modes", () => {
    expect(billingRoutes.map((route) => route.path)).toEqual([
      "/api/billing",
      "/api/billing/evidence",
      "/api/platform-admin/billing",
      "/api/platform-admin/billing/config",
      "/api/platform-admin/billing/exemptions",
      "/api/platform-admin/billing/exemptions/[exemptionId]",
      "/api/platform-admin/billing/adjustments",
      "/api/platform-admin/billing/submissions/[submissionId]/review",
      "/api/platform-admin/billing/submissions/[submissionId]/evidence",
      "/api/platform-admin/billing/submissions/[submissionId]/release",
      "/api/platform-admin/billing/cycle",
    ]);
    for (const route of billingRoutes) {
      expect(["session", "workspace"]).toContain(route.access);
      expect(route.description.length).toBeGreaterThan(0);
    }
  });

  it("marks the teacher billing route owner-only and tenant-scoped", () => {
    expect(findRoute("/api/billing")).toMatchObject({
      methods: ["GET", "POST"],
      access: "workspace",
      ownerOnly: true,
      tenantScoped: true,
    });
  });

  it("never accepts a workspace id from a platform billing route path or method", () => {
    for (const route of billingRoutes.filter((item) => item.path.startsWith("/api/platform-admin"))) {
      expect(route.path).not.toContain("[workspaceId]");
      if (
        route.path === "/api/platform-admin/billing" ||
        route.path === "/api/platform-admin/billing/submissions/[submissionId]/evidence"
      ) {
        continue;
      }
      expect(route.methods).toEqual(["POST"]);
    }
  });

  it("declares scope truthfully for tenant-targeted and cross-workspace billing routes", () => {
    const expected: Record<string, boolean> = {
      "/api/billing": true,
      "/api/billing/evidence": true,
      "/api/platform-admin/billing": false,
      "/api/platform-admin/billing/config": false,
      "/api/platform-admin/billing/exemptions": true,
      "/api/platform-admin/billing/exemptions/[exemptionId]": true,
      "/api/platform-admin/billing/adjustments": true,
      "/api/platform-admin/billing/submissions/[submissionId]/review": true,
      "/api/platform-admin/billing/submissions/[submissionId]/evidence": true,
      "/api/platform-admin/billing/submissions/[submissionId]/release": true,
      "/api/platform-admin/billing/cycle": false,
    };
    expect(Object.keys(expected)).toEqual(billingRoutes.map((route) => route.path));
    for (const route of billingRoutes) {
      expect(route.tenantScoped, route.path).toBe(expected[route.path]);
    }
  });
});
