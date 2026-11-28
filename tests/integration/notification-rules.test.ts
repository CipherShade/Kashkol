import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import { findNotificationRuleSettingsTx } from "@/modules/notifications/repository";
import { evaluateNotificationRules } from "@/modules/notifications/rules";
import { updateNotificationRuleSettings } from "@/modules/notifications/service";
import { DEFAULT_NOTIFICATION_RULE_CONFIG } from "@/modules/notifications/settings";
import { createStudent, fixturesScope } from "./helpers";

// The real clock keeps notification `createdAt` and the cooldown window on the
// same timeline. Each run uses a disposable workspace so the bounded rule
// queries cannot be crowded out by records from earlier runs.
const NOW = new Date();

afterAll(async () => {
  await disconnectDb();
});

describe("F-P2-07 notification rules against PostgreSQL RLS", () => {
  it("creates each rule once, respects cooldown, and audits a settings change", async () => {
    const suffix = randomUUID().slice(0, 8);
    const workspaceId = randomUUID();
    await withScope({ workspaceId }, async (tx) => {
      await tx.workspace.create({
        data: {
          id: workspaceId,
          name: `Notify ${suffix}`,
          slug: `notify-${suffix}`,
          teachingName: `Notify ${suffix}`,
          primarySubject: null,
          gradesTaught: [],
          status: "active",
          planTier: "pilot",
          planStatus: "pilot_active",
        },
      });
      await tx.workspaceSettings.create({
        data: {
          workspaceId,
          atRiskAfter: 2,
          inactiveAfter: 4,
          locale: "en",
          theme: "system",
          timezone: "Africa/Cairo",
          currency: "EGP",
        },
      });
    });
    const scope = { ...fixturesScope("Notification Rules"), workspaceId };
    const group = await withScope(scope, (tx) =>
      tx.group.create({
        data: { workspaceId, name: `Notify ${suffix}`, color: "indigo" },
      }),
    );
    const studentId = await createStudent(workspaceId, "Notify", suffix);

    const past = (daysAgo: number) =>
      new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);

    const sessions = await withScope(scope, async (tx) => {
      const unrecorded = await tx.teachingSession.create({
        data: {
          workspaceId,
          groupId: group.id,
          startsAt: past(1),
          status: "started",
          pricePerStudentMinor: 20000,
        },
      });
      const unreceipted = await tx.teachingSession.create({
        data: {
          workspaceId,
          groupId: group.id,
          startsAt: past(40),
          status: "completed",
          pricePerStudentMinor: 20000,
        },
      });
      const absentA = await tx.teachingSession.create({
        data: { workspaceId, groupId: group.id, startsAt: past(2), status: "completed" },
      });
      const absentB = await tx.teachingSession.create({
        data: { workspaceId, groupId: group.id, startsAt: past(3), status: "completed" },
      });
      return { unrecorded, unreceipted, absentA, absentB };
    });

    await withScope(scope, async (tx) => {
      await tx.attendanceMark.createMany({
        data: [
          {
            workspaceId,
            sessionId: sessions.absentA.id,
            studentId,
            mark: "absent",
            recordedBy: scope.actorUserId,
            createdAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
          },
          {
            workspaceId,
            sessionId: sessions.absentB.id,
            studentId,
            mark: "absent",
            recordedBy: scope.actorUserId,
            createdAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
          },
          {
            workspaceId,
            sessionId: sessions.unreceipted.id,
            studentId,
            mark: "present",
            recordedBy: scope.actorUserId,
            createdAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
          },
        ],
      });
      await tx.homework.create({
        data: {
          workspaceId,
          groupId: group.id,
          title: `Due soon ${suffix}`,
          dueAt: new Date(NOW.getTime() + 12 * 60 * 60 * 1000),
          createdBy: scope.actorUserId,
        },
      });
      await tx.assessment.create({
        data: {
          workspaceId,
          groupId: group.id,
          title: `Pending ${suffix}`,
          date: past(10),
        },
      });
    });

    const ruleSettings = await withScope(scope, (tx) =>
      findNotificationRuleSettingsTx(tx, workspaceId),
    );
    expect(ruleSettings.rules).not.toHaveProperty("paymentOverdueEnabled");
    expect(ruleSettings.rules).not.toHaveProperty("paymentOverdueDays");

    const first = await evaluateNotificationRules(scope, NOW);
    expect(first.createdCount).toBeGreaterThanOrEqual(4);

    const stored = await withScope(scope, (tx) =>
      tx.notification.findMany({
        where: {
          workspaceId,
          recipientUserId: scope.actorUserId,
          type: {
            in: [
              "student_at_risk",
              "session_unrecorded",
              "homework_due_soon",
              "assessment_pending_grades",
            ],
          },
        },
        select: { type: true, entityType: true, entityId: true, metadata: true },
      }),
    );
    for (const type of [
      "student_at_risk",
      "session_unrecorded",
      "homework_due_soon",
      "assessment_pending_grades",
    ]) {
      expect(
        stored.some((row) => row.type === type),
        `missing ${type}; stored: ${stored.map((row) => row.type).join(",")}`,
      ).toBe(true);
    }
    expect(stored.some((row) => (row.type as string) === "payment_overdue")).toBe(false);
    expect(
      stored.some((row) => row.entityType === "student" && row.entityId === studentId),
    ).toBe(true);
    expect(
      stored.some(
        (row) => row.entityType === "teaching_session" && row.entityId === sessions.unrecorded.id,
      ),
    ).toBe(true);

    const second = await evaluateNotificationRules(scope, NOW);
    expect(second.createdCount).toBe(0);

    const updated = await updateNotificationRuleSettings(
      scope,
      {
        rules: { ...DEFAULT_NOTIFICATION_RULE_CONFIG, cooldownHours: 48 },
        emailDigestEnabled: true,
      },
      { requestId: "notification-rules-test" },
    );
    expect(updated.rules.cooldownHours).toBe(48);
    expect(updated.emailDigestEnabled).toBe(true);

    const audit = await withScope(scope, (tx) =>
      tx.auditEvent.findFirst({
        where: {
          workspaceId,
          action: "notification_rules.updated",
          requestId: "notification-rules-test",
        },
      }),
    );
    expect(audit).not.toBeNull();

    await withScope(scope, (tx) =>
      tx.workspaceSettings.update({
        where: { workspaceId },
        data: {
          notificationRuleConfig: DEFAULT_NOTIFICATION_RULE_CONFIG,
          emailDigestEnabled: false,
        },
      }),
    );
  });
});
