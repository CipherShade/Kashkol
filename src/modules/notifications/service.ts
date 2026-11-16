import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";
import { getGuardianForStudent } from "@/modules/messaging/repository";
import { dispatchWebPushNotification } from "@/modules/portals/push";
import {
  createNotificationTx,
  listNotificationsForUser,
  markNotificationReadTx,
  markAllNotificationsReadTx,
  type CreateNotificationInput,
} from "./repository";

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
