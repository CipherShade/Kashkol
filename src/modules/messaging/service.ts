import crypto from "node:crypto";
import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import { authorize, type Scope } from "@/modules/tenancy/types";
import {
  enqueueMessageTx,
  findNotificationSettings,
  findNotificationSettingsTx,
  getOutboxForWorkspace,
  getGuardianForStudent,
  getNotificationLocale,
  getNotificationTimezone,
  upsertNotificationSettingsTx,
} from "./repository";
import { renderTemplate, type TemplateKey } from "./templates";
import { messagingAuditActions } from "./audit";
import { getMessageAdapter } from "./adapters";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  isQuietHoursActive,
  nextDeliveryAt,
  type NotificationPreferences,
} from "./settings";
import type {
  EnqueueAttendanceNotificationInput,
  NotificationSettingsInput,
} from "./schemas";
import type { OutboxFilters } from "./repository";

export type RequestContext = {
  requestId?: string;
  ipHash?: string | null;
};

function context(req: RequestContext | undefined) {
  return {
    requestId: req?.requestId ?? newRequestId(),
    ipHash: req?.ipHash ?? null,
  };
}

function computeBackoff(attempts: number): number {
  // Bounded backoff: 1min, 5min, 15min, 1h, 2h
  const delays = [60, 300, 900, 3600, 7200];
  return delays[Math.min(attempts, delays.length - 1)] * 1000;
}

function preferencesFrom(
  row:
    | {
        enabled: boolean;
        quietHoursEnabled: boolean;
        quietHoursStart: string | null;
        quietHoursEnd: string | null;
      }
    | null
    | undefined,
): NotificationPreferences {
  if (!row) return DEFAULT_NOTIFICATION_PREFERENCES;
  return {
    enabled: row.enabled,
    quietHoursEnabled: row.quietHoursEnabled,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
  };
}

/**
 * Read the notification preferences. This is an `integrations:read` surface:
 * provider configuration is reported as a boolean and never exposed.
 */
export async function getNotificationSettings(scope: Scope) {
  authorize(scope, "integrations", "read");
  const row = await findNotificationSettings(scope);
  return {
    preferences: preferencesFrom(row),
    provider: row?.provider ?? "fake",
    providerConfigured: Boolean(row?.providerConfig),
  };
}

export async function listOutbox(scope: Scope, filters: OutboxFilters = {}) {
  authorize(scope, "messages", "read");
  return getOutboxForWorkspace(scope, filters);
}

/**
 * Replace the preferences the outbox can actually honour.
 *
 * `enabled` stops new notifications and pauses delivery; quiet hours defers
 * delivery until the window closes in the workspace time zone. Provider
 * credentials are not editable through this surface.
 */
export async function updateNotificationSettings(
  scope: Scope,
  input: NotificationSettingsInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "integrations", "write");
  const ctx = context(reqCtx);
  const next: NotificationPreferences = {
    enabled: input.enabled,
    quietHoursEnabled: input.quietHoursEnabled,
    quietHoursStart: input.quietHoursEnabled ? input.quietHoursStart : null,
    quietHoursEnd: input.quietHoursEnabled ? input.quietHoursEnd : null,
  };

  const saved = await withScope(scope, async (tx) => {
    const before = preferencesFrom(
      await findNotificationSettingsTx(tx, scope.workspaceId),
    );
    const row = await upsertNotificationSettingsTx(tx, scope.workspaceId, next);

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "notification_settings",
      entityId: scope.workspaceId,
      action: messagingAuditActions.settingsUpdated,
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
      diff: { before, after: next },
    });

    return row;
  });

  return {
    preferences: preferencesFrom(saved),
    provider: saved?.provider ?? "fake",
    providerConfigured: Boolean(saved?.providerConfig),
  };
}

function attendanceTypeForMark(mark: string) {
  switch (mark) {
    case "present":
      return "attendance_present";
    case "absent":
      return "attendance_absent";
    case "late":
      return "attendance_late";
    case "excused":
      return "attendance_excused";
    default:
      return "attendance_absent";
  }
}

export async function enqueueAttendanceNotification(
  scope: Scope,
  input: EnqueueAttendanceNotificationInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "messages", "write");
  const ctx = context(reqCtx);
  const locale = input.locale || (await getNotificationLocale(scope));

  const preferences = preferencesFrom(await findNotificationSettings(scope));
  if (!preferences.enabled) {
    throw new AppError("CONFLICT", { messageKey: "messaging.errors.disabled" });
  }
  const timezone = await getNotificationTimezone(scope);
  const deliverAt = nextDeliveryAt(preferences, new Date(), timezone);

  // Get guardian (only authorized, not opted out)
  const guardian = await getGuardianForStudent(scope, input.studentId);
  if (!guardian) {
    throw new AppError("NOT_FOUND", { messageKey: "errors.guardianNotFound" });
  }

  // Get student and session details
  const result = await withScope(scope, async (tx) => {
    const student = await tx.student.findFirst({
      where: { id: input.studentId, workspaceId: scope.workspaceId },
    });
    if (!student) throw new AppError("NOT_FOUND");

    const session = await tx.teachingSession.findFirst({
      where: { id: input.sessionId, workspaceId: scope.workspaceId },
      include: { group: true },
    });
    if (!session) throw new AppError("NOT_FOUND");

    const templateKey = `attendance_${input.mark}` as TemplateKey;
    const body = renderTemplate(templateKey, locale, {
      guardianName: guardian.firstName,
      studentName: `${student.firstName} ${student.lastName}`,
      groupName: session.group?.name || "",
      date: session.startsAt.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB"),
    });

    const idempotencyKey = `att_${input.sessionId}_${input.studentId}_${input.mark}`;

    const outbox = await enqueueMessageTx(tx, {
      workspaceId: scope.workspaceId,
      studentId: input.studentId,
      guardianId: guardian.id,
      type: attendanceTypeForMark(input.mark),
      templateKey,
      locale,
      to: guardian.phoneE164,
      body,
      idempotencyKey,
      nextRetryAt: deliverAt,
      metadata: {
        sessionId: input.sessionId,
        mark: input.mark,
      },
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "message_outbox",
      entityId: outbox.id,
      action: messagingAuditActions.notificationEnqueued,
      diff: { studentId: input.studentId, guardianId: guardian.id, type: templateKey, channel: "whatsapp" },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return outbox;
  });

  return result;
}

/**
 * Process one workspace's due outbox messages.
 *
 * The scope is required: a global query cannot run under forced RLS, and a
 * worker must not deliver another workspace's messages. Claiming happens in a
 * transaction; the provider call happens *outside* it, so a slow network call
 * never holds a database transaction open. Every state change and its log row
 * are written together afterwards.
 *
 * When notifications are disabled the batch is a no-op (delivery is paused),
 * and an active quiet-hours window defers the whole batch to the window end.
 */
export async function processOutboxBatch(scope: Scope, limit: number = 10) {
  authorize(scope, "messages", "write");
  const preferences = preferencesFrom(await findNotificationSettings(scope));
  if (!preferences.enabled) return [];

  const timezone = await getNotificationTimezone(scope);
  const now = new Date();

  const claimed = await withScope(scope, async (tx) => {
    const messages = await tx.messageOutbox.findMany({
      where: {
        workspaceId: scope.workspaceId,
        status: { in: ["pending", "failed"] },
        nextRetryAt: { lte: now },
        attempts: { lt: 5 },
      },
      orderBy: [{ nextRetryAt: "asc" }],
      take: limit,
      include: { guardian: true },
    });

    if (messages.length === 0) return [];

    if (isQuietHoursActive(preferences, now, timezone)) {
      const next = nextDeliveryAt(preferences, now, timezone);
      await tx.messageOutbox.updateMany({
        where: {
          workspaceId: scope.workspaceId,
          id: { in: messages.map((message) => message.id) },
        },
        data: { nextRetryAt: next },
      });
      return messages.map((message) => ({
        message,
        deferredUntil: next,
        cancelled: false,
      }));
    }

    const output: Array<{
      message: (typeof messages)[number];
      deferredUntil: Date | null;
      cancelled: boolean;
    }> = [];

    for (const message of messages) {
      if (message.guardian?.optOut) {
        await tx.messageOutbox.update({
          where: { id: message.id },
          data: { status: "cancelled", cancelledAt: now },
        });
        await tx.notificationLog.create({
          data: {
            id: crypto.randomUUID(),
            workspaceId: message.workspaceId,
            outboxId: message.id,
            action: "cancelled_opt_out",
            details: { reason: "guardian_opted_out" },
          },
        });
        output.push({ message, deferredUntil: null, cancelled: true });
        continue;
      }

      const claim = await tx.messageOutbox.updateMany({
        where: {
          id: message.id,
          workspaceId: scope.workspaceId,
          status: { in: ["pending", "failed"] },
        },
        data: { status: "sending", attempts: { increment: 1 } },
      });
      if (claim.count === 0) continue;

      output.push({
        message: { ...message, attempts: message.attempts + 1 },
        deferredUntil: null,
        cancelled: false,
      });
    }

    return output;
  });

  const results: Array<Record<string, unknown>> = [];
  const adapter = getMessageAdapter();

  for (const entry of claimed) {
    const { message } = entry;

    if (entry.cancelled) {
      results.push({ id: message.id, success: false, cancelled: true });
      continue;
    }
    if (entry.deferredUntil) {
      results.push({
        id: message.id,
        success: false,
        deferredUntil: entry.deferredUntil.toISOString(),
      });
      continue;
    }

    const sendResult = await adapter.send({
      to: message.to,
      body: message.body,
      templateKey: message.templateKey,
      locale: message.locale,
    });

    await withScope(scope, async (tx) => {
      if (sendResult.success) {
        await tx.messageOutbox.update({
          where: { id: message.id },
          data: {
            status: "sent",
            sentAt: new Date(),
            provider: adapter.name,
            providerMessageId: sendResult.providerMessageId || null,
            lastError: null,
          },
        });
        await tx.notificationLog.create({
          data: {
            id: crypto.randomUUID(),
            workspaceId: message.workspaceId,
            outboxId: message.id,
            action: "sent",
            status: "sent",
            details: { providerMessageId: sendResult.providerMessageId },
          },
        });
        return;
      }

      const isPermanent = sendResult.permanent || false;
      if (isPermanent || message.attempts >= message.maxAttempts) {
        await tx.messageOutbox.update({
          where: { id: message.id },
          data: {
            status: "failed",
            failedAt: new Date(),
            lastError: sendResult.error?.substring(0, 500),
            errorDetails: { permanent: isPermanent },
          },
        });
        await tx.notificationLog.create({
          data: {
            id: crypto.randomUUID(),
            workspaceId: message.workspaceId,
            outboxId: message.id,
            action: "failed",
            status: "failed",
            error: sendResult.error?.substring(0, 500),
            details: { permanent: isPermanent },
          },
        });
        return;
      }

      const backoffMs = computeBackoff(message.attempts);
      const nextRetryAt = new Date(Date.now() + backoffMs);
      await tx.messageOutbox.update({
        where: { id: message.id },
        data: {
          status: "failed",
          nextRetryAt,
          lastError: sendResult.error?.substring(0, 500),
        },
      });
      await tx.notificationLog.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId: message.workspaceId,
          outboxId: message.id,
          action: "retry_scheduled",
          details: { attempts: message.attempts, nextRetryAt },
        },
      });
    });

    results.push({
      id: message.id,
      success: sendResult.success,
      ...(sendResult.error ? { error: sendResult.error } : {}),
    });
  }

  return results;
}

export async function retryMessage(scope: Scope, outboxId: string, reqCtx?: RequestContext) {
  authorize(scope, "messages", "write");
  const ctx = context(reqCtx);

  const result = await withScope(scope, async (tx) => {
    const msg = await tx.messageOutbox.findFirst({
      where: { id: outboxId, workspaceId: scope.workspaceId },
    });
    if (!msg) throw new AppError("NOT_FOUND");
    if (msg.status !== "failed") throw new AppError("CONFLICT");

    await tx.messageOutbox.update({
      where: { id: outboxId },
      data: {
        status: "pending",
        attempts: 0,
        nextRetryAt: new Date(),
        failedAt: null,
        lastError: null,
      },
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "message_outbox",
      entityId: outboxId,
      action: messagingAuditActions.notificationRetried,
      diff: {},
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    await tx.notificationLog.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId: scope.workspaceId,
        outboxId,
        action: "manual_retry",
      },
    });

    return { success: true };
  });

  return result;
}
