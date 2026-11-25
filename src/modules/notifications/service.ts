import { withScope } from "@/lib/db/scope";
import { newRequestId } from "@/lib/http/request-id";
import { writeAuditEvent } from "@/modules/audit/service";
import { getGuardianForStudent } from "@/modules/messaging/repository";
import { dispatchWebPushNotification } from "@/modules/portals/push";
import { authorize, type Scope } from "@/modules/tenancy/types";
import {
  createNotificationTx,
  findNotificationRuleSettings,
  findNotificationRuleSettingsTx,
  listNotificationsForUser,
  markNotificationReadTx,
  markAllNotificationsReadTx,
  upsertNotificationRuleSettingsTx,
  type CreateNotificationInput,
} from "./repository";
import type {
  NotificationRulesSettings,
  NotificationRulesSettingsInput,
} from "./settings";

export type NotificationRulesRequestContext = {
  requestId?: string;
  ipHash?: string | null;
};

// ---------------------------------------------------------------------------
// Internal helper: look up push subscriptions for the portal user linked to
// a student's guardian grant, then fire web-push best-effort.
// ---------------------------------------------------------------------------

async function dispatchPushForStudent(
  scope: Scope,
  studentId: string,
  pushInput: { eventType: "attendance" | "homework" | "grade" | "schedule" | "general" },
): Promise<void> {
  // Find an active parent-kind portal grant for this student.
  const grant = await withScope(scope, (tx) =>
    tx.portalGrant.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        studentId,
        kind: "parent",
        revokedAt: null,
      },
      select: { portalUserId: true },
    }),
  );
  if (!grant) return;

  // Look up all active push subscriptions for that portal user in this workspace.
  const subscriptions = await withScope(scope, (tx) =>
    tx.portalPushSubscription.findMany({
      where: {
        workspaceId: scope.workspaceId,
        portalUserId: grant.portalUserId,
        revokedAt: null,
      },
      select: {
        endpoint: true,
        p256dhKey: true,
        authKey: true,
        includeSensitiveDetails: true,
      },
    }),
  );

  // Dispatch to each device; failures are swallowed — push is best-effort.
  await Promise.allSettled(
    subscriptions.map((sub) =>
      dispatchWebPushNotification(
        {
          endpoint: sub.endpoint,
          p256dhKey: sub.p256dhKey,
          authKey: sub.authKey,
          includeSensitiveDetails: sub.includeSensitiveDetails,
        },
        {
          kind: "parent",
          locale: "ar",
          eventType: pushInput.eventType,
          studentId,
        },
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createAttendanceNotification(
  scope: Scope,
  input: {
    locale?: "ar" | "en";
    sessionId: string;
    studentId: string;
    groupName: string;
    sessionDate: string;
    sessionTime?: string | null;
    mark: "present" | "absent" | "late" | "excused";
  },
) {
  const guardian = await getGuardianForStudent(scope, input.studentId);
  if (!guardian) return null; // No authorized guardian for this student

  const locale = input.locale ?? "ar";

  const markKeyMap: Record<string, string> = {
    present: "attendancePresent",
    absent: "attendanceAbsent",
    late: "attendanceLate",
    excused: "attendanceExcused",
  };

  const title =
    locale === "ar"
      ? `إشعار حضور ${input.mark === "present" ? "حاضر" : input.mark === "absent" ? "غائب" : input.mark === "late" ? "متأخر" : "عذر"}`
      : `Attendance: ${input.mark}`;

  const body =
    locale === "ar"
      ? `${input.groupName} - ${input.sessionDate}\n${input.mark === "present" ? "تم تسجيل حضور" : input.mark === "absent" ? "تم تسجيل غياب" : input.mark === "late" ? "تم تسجيل تأخير" : "تم تسجيل عذر"} الطالب.`
      : `${input.groupName} - ${input.sessionDate}\nAttendance marked ${input.mark} for student.`;

  const notification = await withScope(scope, async (tx) => {
    return createNotificationTx(tx, scope.workspaceId, {
      studentId: input.studentId,
      guardianId: guardian.id,
      type: (`attendance_${input.mark}`) as
        | "attendance_present"
        | "attendance_absent"
        | "attendance_late"
        | "attendance_excused",
      severity: input.mark === "absent" ? "warning" : "info",
      messageKey: `Notifications.messages.${markKeyMap[input.mark] ?? "attendancePresent"}`,
      messageParams: {
        studentName: "",
        groupName: input.groupName,
        mark: input.mark,
      },
      title,
      body,
      entityType: "teaching_session",
      entityId: input.sessionId,
      metadata: {
        sessionId: input.sessionId,
        groupName: input.groupName,
        sessionDate: input.sessionDate,
        sessionTime: input.sessionTime ?? null,
        mark: input.mark,
      },
      dedupeKey: `att_${input.sessionId}_${input.studentId}_${input.mark}`,
    });
  });

  // Fix 3: Dispatch web push to the guardian's phone(s) — best-effort, never
  // blocks the attendance write.
  try {
    await dispatchPushForStudent(scope, input.studentId, { eventType: "attendance" });
  } catch {
    // Best-effort push dispatch; never fail attendance notification
  }

  return notification;
}

export async function createStaffNotification(
  scope: Scope,
  input: Omit<CreateNotificationInput, "recipientUserId"> & {
    recipientUserId: string;
  },
) {
  return withScope(scope, async (tx) => {
    return createNotificationTx(tx, scope.workspaceId, input);
  });
}

export async function listMyNotifications(
  scope: Scope,
  options?: { limit?: number; unreadOnly?: boolean },
) {
  return listNotificationsForUser(scope, scope.actorUserId, options);
}

export async function markMyNotificationRead(
  scope: Scope,
  notificationId: string,
) {
  return withScope(scope, async (tx) => {
    return markNotificationReadTx(
      tx,
      scope.workspaceId,
      scope.actorUserId,
      notificationId,
    );
  });
}

export async function markAllMyNotificationsRead(scope: Scope) {
  return withScope(scope, async (tx) => {
    return markAllNotificationsReadTx(
      tx,
      scope.workspaceId,
      scope.actorUserId,
    );
  });
}

/** F-P2-07: read the workspace rule switches without exposing provider data. */
export async function getNotificationRuleSettings(
  scope: Scope,
): Promise<NotificationRulesSettings> {
  authorize(scope, "settings", "read");
  return findNotificationRuleSettings(scope);
}

/** F-P2-07: persist rule switches and the explicit digest opt-in atomically. */
export async function updateNotificationRuleSettings(
  scope: Scope,
  input: NotificationRulesSettingsInput,
  reqCtx?: NotificationRulesRequestContext,
): Promise<NotificationRulesSettings> {
  authorize(scope, "settings", "write");
  const requestId = reqCtx?.requestId ?? newRequestId();

  return withScope(scope, async (tx) => {
    const before = await findNotificationRuleSettingsTx(tx, scope.workspaceId);
    const after = await upsertNotificationRuleSettingsTx(
      tx,
      scope.workspaceId,
      { ...input.rules, _lastDigestAt: before.rules._lastDigestAt },
      input.emailDigestEnabled,
    );

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "notification_rule_settings",
      entityId: scope.workspaceId,
      action: "notification_rules.updated",
      diff: { before, after },
      requestId,
      ipHash: reqCtx?.ipHash ?? null,
    });

    return after;
  });
}
