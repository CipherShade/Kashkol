import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/modules/tenancy/types";

const mockTx = {
  notification: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  workspaceSettings: { findUnique: vi.fn() },
  attendanceMark: { findMany: vi.fn() },
  teachingSession: { findMany: vi.fn() },
  homework: { findMany: vi.fn() },
  assessment: { findMany: vi.fn() },
  workspaceMember: { findMany: vi.fn() },
};

vi.mock("@/lib/db/scope", () => ({
  withScope: vi.fn(async (_scope: unknown, cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
}));

import { evaluateNotificationRules } from "@/modules/notifications/rules";
import {
  DEFAULT_NOTIFICATION_RULE_CONFIG,
  notificationRuleConfigSchema,
  notificationRulesSettingsSchema,
  parseNotificationRuleConfig,
  publicNotificationRuleConfig,
} from "@/modules/notifications/settings";

const scope: Scope = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  actorUserId: "user-teacher-1",
  actorDisplayName: "Teacher",
  role: "owner",
  permissions: new Set(),
};

const now = new Date("2026-11-24T12:00:00.000Z");

function mocksForAllRules(config: Record<string, unknown> = {}) {
  mockTx.workspaceSettings.findUnique.mockResolvedValue({
    notificationRuleConfig: config,
    emailDigestEnabled: false,
    atRiskAfter: 2,
  });
  mockTx.attendanceMark.findMany.mockResolvedValue([
    {
      studentId: "student-1",
      mark: "absent",
      session: { startsAt: new Date("2026-11-23T10:00:00.000Z") },
    },
    {
      studentId: "student-1",
      mark: "absent",
      session: { startsAt: new Date("2026-11-22T10:00:00.000Z") },
    },
  ]);
  mockTx.teachingSession.findMany.mockResolvedValueOnce([
    { id: "session-1", group: { name: "Physics" }, gradeLabel: null },
  ]);
  mockTx.homework.findMany.mockResolvedValue([
    { id: "homework-1", title: "Sheet 1", group: { name: "Math" } },
  ]);
  mockTx.assessment.findMany.mockResolvedValue([
    { id: "assessment-1", title: "Quiz 1", group: { name: "Math" } },
  ]);
  mockTx.notification.findFirst.mockResolvedValue(null);
  mockTx.notification.create.mockImplementation(async ({ data }: { data: unknown }) => data);
}

describe("F-P2-07 notification rule expansion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.workspaceMember.findMany.mockResolvedValue([]);
  });

  it("creates one alert for each of the four rule types and no money alerts", async () => {
    mocksForAllRules();

    const result = await evaluateNotificationRules(scope, now);

    expect(result.createdCount).toBe(4);
    const types = mockTx.notification.create.mock.calls.map(
      (call: unknown[]) => (call[0] as { data: { type: string } }).data.type,
    );
    expect(types).toEqual([
      "student_at_risk",
      "session_unrecorded",
      "homework_due_soon",
      "assessment_pending_grades",
    ]);
  });

  it("skips disabled rules", async () => {
    mocksForAllRules({
      atRiskEnabled: false,
      unrecordedSessionEnabled: false,
      homeworkDueSoonEnabled: false,
      assessmentPendingGradesEnabled: false,
    });

    const result = await evaluateNotificationRules(scope, now);

    expect(result.createdCount).toBe(0);
    expect(mockTx.notification.create).not.toHaveBeenCalled();
  });

  it("does not duplicate a condition inside the cooldown window", async () => {
    mocksForAllRules();
    mockTx.notification.findFirst.mockResolvedValue({ id: "existing" });

    const result = await evaluateNotificationRules(scope, now);

    expect(result.createdCount).toBe(0);
    expect(mockTx.notification.create).not.toHaveBeenCalled();
  });

  it("persists a cooldown window key and a deep-link entity on each alert", async () => {
    mocksForAllRules();

    await evaluateNotificationRules(scope, now);

    const first = (
      mockTx.notification.create.mock.calls[0][0] as {
        data: {
          dedupeKey: string;
          entityType: string;
          entityId: string;
          metadata: { conditionKey: string };
        };
      }
    ).data;
    expect(first.dedupeKey).toMatch(/^student_at_risk:student-1:\d+$/);
    expect(first.metadata.conditionKey).toBe("student_at_risk:student-1");
    expect(first.entityType).toBe("student");
    expect(first.entityId).toBe("student-1");
  });

  it("falls back to safe defaults for missing or malformed stored configuration", () => {
    expect(parseNotificationRuleConfig(null)).toEqual(DEFAULT_NOTIFICATION_RULE_CONFIG);
    expect(parseNotificationRuleConfig({ atRiskEnabled: "maybe" })).toEqual(
      DEFAULT_NOTIFICATION_RULE_CONFIG,
    );
    expect(notificationRuleConfigSchema.safeParse({ unknownKey: true }).success).toBe(false);
  });

  it("rejects unknown rule keys instead of carrying legacy money settings", () => {
    expect(
      notificationRuleConfigSchema.safeParse({ paymentOverdueEnabled: true }).success,
    ).toBe(false);
    expect(parseNotificationRuleConfig({ paymentOverdueEnabled: true })).toEqual(
      DEFAULT_NOTIFICATION_RULE_CONFIG,
    );
    expect(parseNotificationRuleConfig({ atRiskEnabled: false }).atRiskEnabled).toBe(false);
  });

  it("strips the server-owned digest cursor from API responses", () => {
    const stored = {
      ...DEFAULT_NOTIFICATION_RULE_CONFIG,
      _lastDigestAt: "2026-11-24T00:00:00.000Z",
    };
    const publicRules = publicNotificationRuleConfig(stored);
    expect(publicRules).not.toHaveProperty("_lastDigestAt");
    expect(
      notificationRulesSettingsSchema.safeParse({
        rules: publicRules,
        emailDigestEnabled: true,
      }).success,
    ).toBe(true);
    expect(
      notificationRulesSettingsSchema.safeParse({ rules: stored, emailDigestEnabled: true })
        .success,
    ).toBe(false);
  });
});
