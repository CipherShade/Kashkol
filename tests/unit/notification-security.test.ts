import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  createNotificationTx,
  listNotificationsForUser,
  markNotificationReadTx,
  markAllNotificationsReadTx,
} from "@/modules/notifications/repository";
import { evaluateNotificationRules } from "@/modules/notifications/rules";
import { createAttendanceNotification } from "@/modules/notifications/service";
import { dispatchWebPushNotification } from "@/modules/portals/push";
import type { Scope } from "@/modules/tenancy/types";

type Tx = Parameters<typeof createNotificationTx>[0];

class MockP2002Error extends Error {
  code = "P2002";
  clientVersion = "7.10.1";
}

// Mock withScope
vi.mock("@/lib/db/scope", () => ({
  withScope: vi.fn(async (_scope: unknown, cb: (tx: unknown) => Promise<unknown>) =>
    cb(mockTx),
  ),
}));

vi.mock("@/modules/portals/push", () => ({
  dispatchWebPushNotification: vi.fn().mockResolvedValue({ delivered: true }),
}));

vi.mock("@/modules/messaging/repository", () => ({
  getGuardianForStudent: vi.fn().mockResolvedValue({
    id: "guard-1",
    firstName: "Guardian",
    lastName: "One",
  }),
}));

const mockTx = {
  notification: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  workspaceSettings: {
    findUnique: vi.fn(),
  },
  attendanceMark: {
    findMany: vi.fn(),
  },
  teachingSession: {
    findMany: vi.fn(),
  },
  homework: {
    findMany: vi.fn(),
  },
  assessment: {
    findMany: vi.fn(),
  },
  workspaceMember: {
    findMany: vi.fn(),
  },
  portalGrant: {
    findFirst: vi.fn(),
  },
  portalPushSubscription: {
    findMany: vi.fn(),
  },
};

const scope: Scope = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  actorUserId: "user-teacher-1",
  actorDisplayName: "Teacher",
  role: "owner",
  permissions: new Set(),
};

describe("notification architecture - isolation, security and deduplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.workspaceSettings.findUnique.mockResolvedValue({
      notificationRuleConfig: null,
      emailDigestEnabled: false,
      atRiskAfter: 2,
    });
    mockTx.attendanceMark.findMany.mockResolvedValue([]);
    mockTx.teachingSession.findMany.mockResolvedValue([]);
    mockTx.homework.findMany.mockResolvedValue([]);
    mockTx.assessment.findMany.mockResolvedValue([]);
  });

  it("creates notification with recipient, severity, messageKey and dedupeKey", async () => {
    mockTx.notification.findFirst.mockResolvedValueOnce(null);
    mockTx.notification.create.mockImplementationOnce(async ({ data }) => ({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await createNotificationTx(
      mockTx as unknown as Tx,
      scope.workspaceId,
      {
        recipientUserId: "user-teacher-1",
        type: "student_at_risk",
        severity: "critical",
        messageKey: "Notifications.messages.studentAtRisk",
        messageParams: { studentName: "Ahmed Ali", rate: 60 },
        dedupeKey: "risk_student_123_20261116",
        entityType: "student",
        entityId: "student-123",
      },
    );

    expect(result.id).toBeDefined();
    expect(result.recipientUserId).toBe("user-teacher-1");
    expect(result.severity).toBe("critical");
    expect(result.type).toBe("student_at_risk");
    expect(result.messageKey).toBe("Notifications.messages.studentAtRisk");
    expect(result.dedupeKey).toBe("risk_student_123_20261116");
    expect(mockTx.notification.create).toHaveBeenCalledTimes(1);
  });

  it("enforces deduplication and returns existing notification when dedupeKey matches", async () => {
    const existingRow = {
      id: "notif-existing",
      workspaceId: scope.workspaceId,
      recipientUserId: "user-teacher-1",
      dedupeKey: "risk_student_123_20261116",
      type: "student_at_risk",
      severity: "critical",
      isRead: false,
    };

    mockTx.notification.findFirst.mockResolvedValueOnce(existingRow);

    const result = await createNotificationTx(
      mockTx as unknown as Tx,
      scope.workspaceId,
      {
        recipientUserId: "user-teacher-1",
        type: "student_at_risk",
        severity: "critical",
        dedupeKey: "risk_student_123_20261116",
      },
    );

    expect(result.id).toBe("notif-existing");
    expect(mockTx.notification.create).not.toHaveBeenCalled();
  });

  it("recovers gracefully from concurrent race on dedupeKey using P2002 error recovery", async () => {
    mockTx.notification.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "notif-raced",
        dedupeKey: "risk_student_123_20261116",
      });

    mockTx.notification.create.mockRejectedValueOnce(new MockP2002Error("Unique violation"));

    const result = await createNotificationTx(
      mockTx as unknown as Tx,
      scope.workspaceId,
      {
        recipientUserId: "user-teacher-1",
        type: "student_at_risk",
        dedupeKey: "risk_student_123_20261116",
      },
    );

    expect(result.id).toBe("notif-raced");
    expect(mockTx.notification.findFirst).toHaveBeenCalledTimes(2);
  });

  it("lists notifications isolated to the recipient user", async () => {
    const userNotifications = [
      {
        id: "notif-1",
        recipientUserId: "user-teacher-1",
        type: "session_unrecorded",
        isRead: false,
      },
    ];

    mockTx.notification.findMany.mockResolvedValueOnce(userNotifications);
    mockTx.notification.count.mockResolvedValueOnce(1);

    const result = await listNotificationsForUser(scope, "user-teacher-1");

    expect(result.unreadCount).toBe(1);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].id).toBe("notif-1");
    expect(mockTx.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: scope.workspaceId,
          recipientUserId: "user-teacher-1",
        }),
      }),
    );
  });

  it("marks a notification read per-user without modifying other users' rows", async () => {
    mockTx.notification.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await markNotificationReadTx(
      mockTx as unknown as Tx,
      scope.workspaceId,
      "user-teacher-1",
      "notif-1",
    );

    expect(result).toBe(true);
    expect(mockTx.notification.updateMany).toHaveBeenCalledWith({
      where: {
        id: "notif-1",
        workspaceId: scope.workspaceId,
        recipientUserId: "user-teacher-1",
      },
      data: expect.objectContaining({
        isRead: true,
      }),
    });
  });

  it("marks all notifications read for a specific user only", async () => {
    mockTx.notification.updateMany.mockResolvedValueOnce({ count: 5 });

    const count = await markAllNotificationsReadTx(
      mockTx as unknown as Tx,
      scope.workspaceId,
      "user-teacher-1",
    );

    expect(count).toBe(5);
    expect(mockTx.notification.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: scope.workspaceId,
        recipientUserId: "user-teacher-1",
        isRead: false,
      },
      data: expect.objectContaining({
        isRead: true,
      }),
    });
  });

  it("guarantees every notification type and message has a valid key in both catalogues", () => {
    const arPath = path.resolve(process.cwd(), "messages/ar.json");
    const enPath = path.resolve(process.cwd(), "messages/en.json");

    const ar = JSON.parse(fs.readFileSync(arPath, "utf-8"));
    const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));

    expect(ar.Notifications).toBeDefined();
    expect(en.Notifications).toBeDefined();

    const expectedTypes = [
      "attendance_present",
      "attendance_absent",
      "attendance_late",
      "attendance_excused",
      "student_at_risk",
      "session_unrecorded",
      "homework_due_soon",
      "assessment_pending_grades",
      "backup_ready",
      "export_ready",
      "general",
    ];

    for (const type of expectedTypes) {
      expect(ar.Notifications.types[type]).toBeDefined();
      expect(en.Notifications.types[type]).toBeDefined();
      expect(typeof ar.Notifications.types[type]).toBe("string");
      expect(typeof en.Notifications.types[type]).toBe("string");
    }

    const expectedMessages = [
      "studentAtRisk",
      "sessionUnrecorded",
      "homeworkDueSoon",
      "assessmentPendingGrades",
      "backupReady",
      "exportReady",
      "attendancePresent",
      "attendanceAbsent",
      "attendanceLate",
      "attendanceExcused",
    ];

    for (const msg of expectedMessages) {
      expect(ar.Notifications.messages[msg]).toBeDefined();
      expect(en.Notifications.messages[msg]).toBeDefined();
    }

    expect(ar.Notifications.types).not.toHaveProperty("payment_overdue");
    expect(en.Notifications.types).not.toHaveProperty("payment_overdue");
    expect(ar.Notifications.messages).not.toHaveProperty("paymentOverdue");
    expect(en.Notifications.messages).not.toHaveProperty("paymentOverdue");
  });

  it("evaluates rules and creates alerts for unrecorded sessions and due homework", async () => {
    mockTx.teachingSession.findMany.mockResolvedValueOnce([
      { id: "sess-1", group: { name: "Physics A" } },
    ]);
    mockTx.homework.findMany.mockResolvedValueOnce([
      { id: "hw-1", title: "Sheet 1", group: { name: "Math B" } },
    ]);
    mockTx.assessment.findMany.mockResolvedValueOnce([]);

    mockTx.notification.findFirst.mockResolvedValue(null);
    mockTx.notification.create.mockResolvedValue({ id: "notif-new" });

    const result = await evaluateNotificationRules(scope, new Date("2026-11-16T12:00:00Z"));

    expect(result.evaluated).toBe(true);
    expect(result.createdCount).toBe(2);
    expect(mockTx.notification.create).toHaveBeenCalledTimes(2);
  });

  it("worker evaluation fans out alerts to all active workspace staff members", async () => {
    const workerScope: Scope = {
      workspaceId: scope.workspaceId,
      actorUserId: "system:notification-worker",
      actorDisplayName: "Notification worker",
      role: "owner",
      permissions: new Set(),
    };

    mockTx.workspaceMember.findMany.mockResolvedValueOnce([
      { userId: "teacher-1" },
      { userId: "assistant-2" },
    ]);

    mockTx.teachingSession.findMany.mockResolvedValueOnce([
      { id: "sess-1", group: { name: "Biology 101" } },
    ]);
    mockTx.homework.findMany.mockResolvedValueOnce([]);
    mockTx.assessment.findMany.mockResolvedValueOnce([]);

    mockTx.notification.findFirst.mockResolvedValue(null);
    mockTx.notification.create.mockResolvedValue({ id: "notif-new" });

    const result = await evaluateNotificationRules(workerScope, new Date("2026-11-16T12:00:00Z"));

    expect(result.evaluated).toBe(true);
    // 1 unrecorded session * 2 active staff members = 2 notifications created
    expect(result.createdCount).toBe(2);
    expect(mockTx.notification.create).toHaveBeenCalledTimes(2);
  });

  it("dispatches Web Push to guardian when attendance notification is created", async () => {
    mockTx.notification.findFirst.mockResolvedValue(null);
    mockTx.notification.create.mockResolvedValue({ id: "notif-att-1" });

    mockTx.portalGrant.findFirst.mockResolvedValueOnce({
      portalUserId: "user-portal-guardian-1",
    });

    mockTx.portalPushSubscription.findMany.mockResolvedValueOnce([
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/test-sub-1",
        p256dhKey: "key-123",
        authKey: "auth-456",
        includeSensitiveDetails: false,
      },
    ]);

    await createAttendanceNotification(scope, {
      sessionId: "sess-1",
      studentId: "student-1",
      groupName: "Math A",
      sessionDate: "2026-11-16",
      mark: "present",
    });

    expect(dispatchWebPushNotification).toHaveBeenCalledTimes(1);
    expect(dispatchWebPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://fcm.googleapis.com/fcm/send/test-sub-1",
      }),
      expect.objectContaining({
        kind: "parent",
        eventType: "attendance",
        studentId: "student-1",
      }),
    );
  });

  it("handles missing push subscriptions gracefully without failing attendance notification", async () => {
    mockTx.notification.findFirst.mockResolvedValue(null);
    mockTx.notification.create.mockResolvedValue({ id: "notif-att-2" });

    // No portal grant for this student
    mockTx.portalGrant.findFirst.mockResolvedValueOnce(null);

    const notification = await createAttendanceNotification(scope, {
      sessionId: "sess-2",
      studentId: "student-2",
      groupName: "English B",
      sessionDate: "2026-11-16",
      mark: "absent",
    });

    expect(notification).toBeDefined();
    expect(dispatchWebPushNotification).not.toHaveBeenCalled();
  });

  it("has no money notification capability in either catalogue", () => {
    const ar = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages/ar.json"), "utf-8"));
    const en = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages/en.json"), "utf-8"));

    for (const catalogue of [ar, en]) {
      const notificationTypes = Object.keys(catalogue.Notifications.types);
      expect(notificationTypes).not.toContain("payment_overdue");
      expect(notificationTypes).not.toContain("balance_due");
      expect(notificationTypes).not.toContain("debt_reminder");
      expect(catalogue.Notifications.messages).not.toHaveProperty("paymentOverdue");
    }
  });
});
