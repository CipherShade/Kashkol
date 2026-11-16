import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";
import { createNotificationWorkerScope } from "@/lib/worker/system-actor";
import { listActiveWorkspaceIdsForWorker } from "@/modules/tenancy/repository";
import { createNotificationTx } from "./repository";

export async function evaluateNotificationRules(
  scope: Scope,
  now: Date = new Date(),
) {
  const dateKey = now.toISOString().slice(0, 10);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  return withScope(scope, async (tx) => {
    let createdCount = 0;

    // Resolve target recipient user IDs: if caller is a specific user, notify them;
    // if caller is a system worker, notify all active workspace staff members.
    const recipientUserIds: string[] = [];
    if (scope.actorUserId && !scope.actorUserId.startsWith("system:")) {
      recipientUserIds.push(scope.actorUserId);
    } else {
      const activeMembers = await tx.workspaceMember.findMany({
        where: {
          workspaceId: scope.workspaceId,
          status: "active",
          removedAt: null,
        },
        select: { userId: true },
      });
      recipientUserIds.push(...activeMembers.map((m) => m.userId));
    }

    if (recipientUserIds.length === 0) {
      return { evaluated: true, createdCount: 0 };
    }

    // Rule 1: Past sessions ended > 2 hours ago with zero attendance marks (F-P0-10, F-P2-07)
    const unrecordedSessions = await tx.teachingSession.findMany({
      where: {
        workspaceId: scope.workspaceId,
        startsAt: { lte: twoHoursAgo },
        status: { in: ["scheduled", "started"] },
        attendanceMarks: { none: {} },
      },
      include: {
        group: { select: { name: true } },
      },
      take: 10,
    });

    for (const session of unrecordedSessions) {
      const groupName = session.group?.name ?? session.gradeLabel ?? "Session";
      for (const recipientUserId of recipientUserIds) {
        const created = await createNotificationTx(tx, scope.workspaceId, {
          recipientUserId,
          type: "session_unrecorded",
          severity: "warning",
          messageKey: "Notifications.messages.sessionUnrecorded",
          messageParams: { groupName },
          title: `حصة غير مسجلة: ${groupName}`,
          body: `انتهت حصة ${groupName} دون تسجيل الحضور.`,
          entityType: "teaching_session",
          entityId: session.id,
          dedupeKey: `unrec_${session.id}_${dateKey}`,
        });
        if (created) createdCount++;
      }
    }

    // Rule 2: Active homework due within 48 hours (F-P2-07)
    const dueSoonHomeworks = await tx.homework.findMany({
      where: {
        workspaceId: scope.workspaceId,
        dueAt: {
          gt: now,
          lte: in48Hours,
        },
      },
      include: {
        group: { select: { name: true } },
      },
      take: 10,
    });

    for (const hw of dueSoonHomeworks) {
      const groupName = hw.group?.name ?? "";
      for (const recipientUserId of recipientUserIds) {
        const created = await createNotificationTx(tx, scope.workspaceId, {
          recipientUserId,
          type: "homework_due_soon",
          severity: "info",
          messageKey: "Notifications.messages.homeworkDueSoon",
          messageParams: { homeworkTitle: hw.title, groupName },
          title: `موعد تسليم واجب: ${hw.title}`,
          body: `الواجب ${hw.title} لمجموعة ${groupName} ينتهي خلال ٤٨ ساعة.`,
          entityType: "homework",
          entityId: hw.id,
          dedupeKey: `hwdue_${hw.id}_${dateKey}`,
        });
        if (created) createdCount++;
      }
    }

    // Rule 3: Past assessments (> 2 days) with no recorded scores (F-P2-07)
    const pendingAssessments = await tx.assessment.findMany({
      where: {
        workspaceId: scope.workspaceId,
        date: { lte: twoDaysAgo },
        lockedAt: null,
        scores: { none: {} },
      },
      include: {
        group: { select: { name: true } },
      },
      take: 10,
    });

    for (const asm of pendingAssessments) {
      const groupName = asm.group?.name ?? "";
      for (const recipientUserId of recipientUserIds) {
        const created = await createNotificationTx(tx, scope.workspaceId, {
          recipientUserId,
          type: "assessment_pending_grades",
          severity: "warning",
          messageKey: "Notifications.messages.assessmentPendingGrades",
          messageParams: { assessmentTitle: asm.title, groupName },
          title: `رصد درجات معلّق: ${asm.title}`,
          body: `هناك درجات غير مرصودة لتقييم ${asm.title} لمجموعة ${groupName}.`,
          entityType: "assessment",
          entityId: asm.id,
          dedupeKey: `asmpend_${asm.id}_${dateKey}`,
        });
        if (created) createdCount++;
      }
    }

    return { evaluated: true, createdCount };
  });
}

/**
 * Background rule evaluation across all active workspaces or a single target workspace.
 */
export async function runBackgroundNotificationRules(specificWorkspaceId?: string) {
  if (specificWorkspaceId) {
    const scope = createNotificationWorkerScope(specificWorkspaceId);
    const result = await evaluateNotificationRules(scope);
    return { evaluated: 1, totalCreated: result.createdCount };
  }

  const workspaceIds = await listActiveWorkspaceIdsForWorker();
  let totalCreated = 0;
  const errors: { workspaceId: string; error: string }[] = [];

  for (const workspaceId of workspaceIds) {
    try {
      const scope = createNotificationWorkerScope(workspaceId);
      const result = await evaluateNotificationRules(scope);
      totalCreated += result.createdCount;
    } catch (err) {
      errors.push({
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    evaluated: workspaceIds.length,
    totalCreated,
    errors: errors.length > 0 ? errors : undefined,
  };
}
