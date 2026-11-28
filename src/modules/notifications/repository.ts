import crypto from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";
import {
  parseNotificationRuleConfig,
  type NotificationRulesSettings,
  type StoredNotificationRuleConfig,
} from "./settings";

export type CreateNotificationInput = {
  recipientUserId?: string | null;
  studentId?: string | null;
  guardianId?: string | null;
  type:
    | "attendance_present"
    | "attendance_absent"
    | "attendance_late"
    | "attendance_excused"
    | "session_cancelled"
    | "session_rescheduled"
    | "homework_assigned"
    | "homework_reminder"
    | "exam_result"
    | "student_at_risk"
    | "session_unrecorded"
    | "homework_due_soon"
    | "assessment_pending_grades"
    | "backup_ready"
    | "export_ready"
    | "billing_invoice_issued"
    | "billing_submission_approved"
    | "billing_submission_rejected"
    | "billing_submission_flagged"
    | "general";
  severity?: "info" | "warning" | "critical";
  messageKey?: string | null;
  messageParams?: Record<string, unknown> | null;
  dedupeKey?: string | null;
  title?: string | null;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
};

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown };
  return (
    candidate.code === "P2002" ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
  );
}

export async function createNotificationTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  data: CreateNotificationInput,
) {
  // Database-enforced idempotency: if a recipient and dedupeKey are specified, check for existing
  if (data.recipientUserId && data.dedupeKey) {
    const existing = await tx.notification.findFirst({
      where: {
        workspaceId,
        recipientUserId: data.recipientUserId,
        dedupeKey: data.dedupeKey,
      },
    });
    if (existing) return existing;
  }

  try {
    return await tx.notification.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId,
        recipientUserId: data.recipientUserId ?? null,
        studentId: data.studentId ?? null,
        guardianId: data.guardianId ?? null,
        type: data.type,
        severity: data.severity ?? "info",
        messageKey: data.messageKey ?? null,
        messageParams: data.messageParams
          ? (data.messageParams as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        dedupeKey: data.dedupeKey ?? null,
        title: data.title ?? null,
        body: data.body ?? null,
        isRead: false,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        metadata: data.metadata
          ? (data.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  } catch (error) {
    // If concurrent insert raced on unique (workspaceId, recipientUserId, dedupeKey)
    if (data.recipientUserId && data.dedupeKey && isUniqueViolation(error)) {
      const existing = await tx.notification.findFirst({
        where: {
          workspaceId,
          recipientUserId: data.recipientUserId,
          dedupeKey: data.dedupeKey,
        },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

/** Backwards-compatible alias for in-app attendance notification creation */
export async function createInAppNotificationTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  data: {
    studentId: string;
    guardianId?: string | null;
    type: "attendance_present" | "attendance_absent" | "attendance_late" | "attendance_excused";
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
  },
) {
  return createNotificationTx(tx, workspaceId, {
    studentId: data.studentId,
    guardianId: data.guardianId,
    type: data.type,
    severity: data.type === "attendance_absent" ? "warning" : "info",
    title: data.title,
    body: data.body,
    entityType: data.entityType,
    entityId: data.entityId,
    metadata: data.metadata,
    dedupeKey: data.idempotencyKey,
  });
}

export async function listNotificationsForUser(
  scope: Scope,
  userId: string,
  options?: { limit?: number; unreadOnly?: boolean },
) {
  return withScope(scope, async (tx) => {
    const where: Prisma.NotificationWhereInput = {
      workspaceId: scope.workspaceId,
      recipientUserId: userId,
      ...(options?.unreadOnly ? { isRead: false } : {}),
    };

    const [notifications, unreadCount] = await Promise.all([
      tx.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        take: options?.limit ?? 50,
      }),
      tx.notification.count({
        where: {
          workspaceId: scope.workspaceId,
          recipientUserId: userId,
          isRead: false,
        },
      }),
    ]);

    return {
      notifications,
      unreadCount,
    };
  });
}

export async function markNotificationReadTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  notificationId: string,
) {
  const result = await tx.notification.updateMany({
    where: {
      workspaceId,
      id: notificationId,
      recipientUserId: userId,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
  return result.count > 0;
}

export async function markAllNotificationsReadTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
) {
  const result = await tx.notification.updateMany({
    where: {
      workspaceId,
      recipientUserId: userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
  return result.count;
}

export async function listNotificationsForGuardian(
  scope: Scope,
  studentId?: string,
) {
  return withScope(scope, async (tx) => {
    const guardians = await tx.guardian.findMany({
      where: {
        workspaceId: scope.workspaceId,
        isAuthorized: true,
        optOut: false,
      },
      select: { id: true, studentId: true },
    });
    const guardianIds = guardians.map((g) => g.id);
    const allowedStudentIds = new Set(guardians.map((g) => g.studentId));

    const notifications = await tx.notification.findMany({
      where: {
        workspaceId: scope.workspaceId,
        guardianId: { in: guardianIds.length ? guardianIds : ["no-match"] },
        studentId: studentId ? studentId : { in: Array.from(allowedStudentIds) },
      },
      include: {
        student: { select: { firstName: true, lastName: true } },
        guardian: { select: { firstName: true, lastName: true, relation: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 50,
    });

    return notifications.filter((n) => allowedStudentIds.has(n.studentId ?? ""));
  });
}

const RULE_SETTINGS_SELECT = {
  notificationRuleConfig: true,
  emailDigestEnabled: true,
} as const;

/** Read rule settings inside the caller's tenant transaction. */
export async function findNotificationRuleSettingsTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<NotificationRulesSettings> {
  const row = await tx.workspaceSettings.findUnique({
    where: { workspaceId },
    select: RULE_SETTINGS_SELECT,
  });
  return {
    rules: parseNotificationRuleConfig(row?.notificationRuleConfig),
    emailDigestEnabled: row?.emailDigestEnabled ?? false,
  };
}

export async function findNotificationRuleSettings(
  scope: Scope,
): Promise<NotificationRulesSettings> {
  return withScope(scope, (tx) =>
    findNotificationRuleSettingsTx(tx, scope.workspaceId),
  );
}

export async function upsertNotificationRuleSettingsTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  rules: StoredNotificationRuleConfig,
  emailDigestEnabled: boolean,
): Promise<NotificationRulesSettings> {
  const row = await tx.workspaceSettings.update({
    where: { workspaceId },
    data: {
      notificationRuleConfig: rules as Prisma.InputJsonValue,
      emailDigestEnabled,
    },
    select: RULE_SETTINGS_SELECT,
  });
  return {
    rules: parseNotificationRuleConfig(row.notificationRuleConfig),
    emailDigestEnabled: row.emailDigestEnabled,
  };
}
