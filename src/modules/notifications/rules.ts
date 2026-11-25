import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";
import { createNotificationWorkerScope } from "@/lib/worker/system-actor";
import { listActiveWorkspaceIdsForWorker } from "@/modules/tenancy/repository";
import {
  createNotificationTx,
  findNotificationRuleSettingsTx,
  type CreateNotificationInput,
} from "./repository";

type RuleTx = Parameters<typeof createNotificationTx>[0];

type RuleInput = Omit<
  CreateNotificationInput,
  "recipientUserId" | "dedupeKey" | "metadata"
> & {
  recipientUserId: string;
  /** Stable identity of the underlying condition; never contains personal data. */
  conditionKey: string;
};

/**
 * F-P2-07: create at most one notification per condition per cooldown window.
 *
 * The dedupe key includes a window bucket so the database unique constraint
 * blocks repeats inside a bucket, while the metadata condition key and the
 * created-at check enforce the exact cooldown across bucket boundaries.
 */
async function createRuleNotificationTx(
  tx: RuleTx,
  workspaceId: string,
  input: RuleInput,
  cooldownHours: number,
  now: Date,
): Promise<boolean> {
  const windowMs = cooldownHours * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - windowMs);
  const recent = await tx.notification.findFirst({
    where: {
      workspaceId,
      recipientUserId: input.recipientUserId,
      metadata: { path: ["conditionKey"], equals: input.conditionKey },
      createdAt: { gte: cutoff },
    },
    select: { id: true },
  });
  if (recent) return false;

  const bucket = Math.floor(now.getTime() / windowMs);
  await createNotificationTx(tx, workspaceId, {
    recipientUserId: input.recipientUserId,
    studentId: input.studentId,
    type: input.type,
    severity: input.severity,
    messageKey: input.messageKey,
    messageParams: input.messageParams,
    title: input.title,
    body: input.body,
    entityType: input.entityType,
    entityId: input.entityId,
    dedupeKey: `${input.conditionKey}:${bucket}`,
    metadata: { conditionKey: input.conditionKey },
  });
  return true;
}

type RecentMark = {
  studentId: string;
  mark: "present" | "absent" | "late" | "excused";
  startsAt: Date;
};

function atRiskStudents(marks: readonly RecentMark[], threshold: number) {
  const byStudent = new Map<string, RecentMark[]>();
  for (const mark of marks) {
    const list = byStudent.get(mark.studentId) ?? [];
    list.push(mark);
    byStudent.set(mark.studentId, list);
  }

  const results: { studentId: string; streak: number; rate: number }[] = [];
  for (const [studentId, list] of byStudent) {
    list.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
    let streak = 0;
    for (const mark of list) {
      if (mark.mark !== "absent") break;
      streak += 1;
    }
    if (streak < threshold) continue;
    const eligible = list.filter((mark) => mark.mark !== "excused");
    const attended = eligible.filter(
      (mark) => mark.mark === "present" || mark.mark === "late",
    ).length;
    results.push({
      studentId,
      streak,
      rate: eligible.length === 0 ? 0 : Math.round((attended / eligible.length) * 100),
    });
  }
  return results.sort((a, b) => b.streak - a.streak).slice(0, 10);
}

/**
 * Evaluate the four F-P2-07 staff rules for one workspace.
 *
 * Every number in a notification is computed from stored records. Rules are
 * switched off per workspace through `workspace_settings.notification_rule_config`.
 */
export async function evaluateNotificationRules(
  scope: Scope,
  now: Date = new Date(),
) {
  const today = now.toISOString().slice(0, 10);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const riskWindowStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  return withScope(scope, async (tx) => {
    let createdCount = 0;
    const settings = await findNotificationRuleSettingsTx(tx, scope.workspaceId);
    const rules = settings.rules;

    // A staff-scoped evaluation notifies only the caller; a worker evaluation
    // notifies every active member of the workspace.
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
      recipientUserIds.push(...activeMembers.map((member) => member.userId));
    }

    if (recipientUserIds.length === 0) {
      return { evaluated: true, createdCount: 0 };
    }

    const createForAll = async (
      conditionKey: string,
      build: (recipientUserId: string) => RuleInput,
    ) => {
      for (const recipientUserId of recipientUserIds) {
        if (
          await createRuleNotificationTx(
            tx,
            scope.workspaceId,
            build(recipientUserId),
            rules.cooldownHours,
            now,
          )
        ) {
          createdCount += 1;
        }
      }
    };

    // Rule 1: student crossed the workspace at-risk absence threshold.
    if (rules.atRiskEnabled) {
      const thresholdRow = await tx.workspaceSettings.findUnique({
        where: { workspaceId: scope.workspaceId },
        select: { atRiskAfter: true },
      });
      const marks = await tx.attendanceMark.findMany({
        where: {
          workspaceId: scope.workspaceId,
          createdAt: { gte: riskWindowStart },
          session: { startsAt: { lte: now }, status: { not: "cancelled" } },
        },
        select: {
          studentId: true,
          mark: true,
          session: { select: { startsAt: true } },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 2000,
      });
      const recentMarks: RecentMark[] = marks.map((mark) => ({
        studentId: mark.studentId,
        mark: mark.mark,
        startsAt: mark.session.startsAt,
      }));
      for (const candidate of atRiskStudents(recentMarks, thresholdRow?.atRiskAfter ?? 2)) {
        const conditionKey = `student_at_risk:${candidate.studentId}`;
        await createForAll(conditionKey, (recipientUserId) => ({
          recipientUserId,
          studentId: candidate.studentId,
          type: "student_at_risk",
          severity: "warning",
          messageKey: "Notifications.messages.studentAtRisk",
          messageParams: { rate: candidate.rate, streak: candidate.streak },
          title: "طالب في نطاق الخطر",
          body: `انخفض حضور الطالب إلى ${candidate.rate}٪ بعد ${candidate.streak} غيابات متتالية.`,
          entityType: "student",
          entityId: candidate.studentId,
          conditionKey,
        }));
      }
    }

    // Rule 2: a past session with no attendance marks.
    if (rules.unrecordedSessionEnabled) {
      const unrecordedSessions = await tx.teachingSession.findMany({
        where: {
          workspaceId: scope.workspaceId,
          startsAt: { lte: twoHoursAgo },
          status: { in: ["scheduled", "started"] },
          attendanceMarks: { none: {} },
        },
        include: { group: { select: { name: true } } },
        orderBy: { startsAt: "desc" },
        take: 10,
      });

      for (const session of unrecordedSessions) {
        const groupName = session.group?.name ?? session.gradeLabel ?? "Session";
        await createForAll(
          `session_unrecorded:${session.id}`,
          (recipientUserId) => ({
            recipientUserId,
            type: "session_unrecorded",
            severity: "warning",
            messageKey: "Notifications.messages.sessionUnrecorded",
            messageParams: { groupName, date: today },
            title: `حصة غير مسجلة: ${groupName}`,
            body: `انتهت حصة ${groupName} دون تسجيل الحضور.`,
            entityType: "teaching_session",
            entityId: session.id,
            conditionKey: `session_unrecorded:${session.id}`,
          }),
        );
      }
    }

    // Rule 3: homework due within the next 48 hours.
    if (rules.homeworkDueSoonEnabled) {
      const dueSoonHomeworks = await tx.homework.findMany({
        where: {
          workspaceId: scope.workspaceId,
          dueAt: { gt: now, lte: in48Hours },
        },
        include: { group: { select: { name: true } } },
        orderBy: { dueAt: "asc" },
        take: 10,
      });

      for (const homework of dueSoonHomeworks) {
        const groupName = homework.group?.name ?? "";
        await createForAll(
          `homework_due_soon:${homework.id}`,
          (recipientUserId) => ({
            recipientUserId,
            type: "homework_due_soon",
            severity: "info",
            messageKey: "Notifications.messages.homeworkDueSoon",
            messageParams: { homeworkTitle: homework.title, groupName },
            title: `موعد تسليم واجب: ${homework.title}`,
            body: `الواجب ${homework.title} لمجموعة ${groupName} ينتهي خلال ٤٨ ساعة.`,
            entityType: "homework",
            entityId: homework.id,
            conditionKey: `homework_due_soon:${homework.id}`,
          }),
        );
      }
    }

    // Rule 4: past assessments with no recorded scores.
    if (rules.assessmentPendingGradesEnabled) {
      const pendingAssessments = await tx.assessment.findMany({
        where: {
          workspaceId: scope.workspaceId,
          date: { lte: twoDaysAgo },
          lockedAt: null,
          scores: { none: {} },
        },
        include: { group: { select: { name: true } } },
        orderBy: { date: "desc" },
        take: 10,
      });

      for (const assessment of pendingAssessments) {
        const groupName = assessment.group?.name ?? "";
        await createForAll(
          `assessment_pending_grades:${assessment.id}`,
          (recipientUserId) => ({
            recipientUserId,
            type: "assessment_pending_grades",
            severity: "warning",
            messageKey: "Notifications.messages.assessmentPendingGrades",
            messageParams: { assessmentTitle: assessment.title, groupName },
            title: `رصد درجات معلّق: ${assessment.title}`,
            body: `هناك درجات غير مرصودة لتقييم ${assessment.title} لمجموعة ${groupName}.`,
            entityType: "assessment",
            entityId: assessment.id,
            conditionKey: `assessment_pending_grades:${assessment.id}`,
          }),
        );
      }
    }

    return { evaluated: true, createdCount };
  });
}

/** Background rule evaluation across all active workspaces or a single target workspace. */
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
    } catch (error) {
      errors.push({
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    evaluated: workspaceIds.length,
    totalCreated,
    errors: errors.length > 0 ? errors : undefined,
  };
}
