import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import { authorize, isAllowed, type Scope } from "@/modules/tenancy/types";
import {
  calculateFollowUpFlags,
  type AssessmentFact,
  type AttendanceFact,
  type HomeworkFact,
} from "./calculations";
import type { CreateFollowUpInput, FollowUpOutcomeInput } from "./schemas";

type RequestContext = { requestId?: string; ipHash?: string | null };
function auditContext(value?: RequestContext) {
  return { requestId: value?.requestId ?? newRequestId(), ipHash: value?.ipHash ?? null };
}

export async function getFollowUpDashboard(scope: Scope, now = new Date()) {
  authorize(scope, "students", "read");
  const canReadAttendance = isAllowed(scope, "attendance", "read");
  const canReadHomework = isAllowed(scope, "homework", "read");
  const canReadGrades = isAllowed(scope, "grades", "read");
  return withScope(scope, async (tx) => {
    const [students, marks, submissions, scores, followUps, settings] = await Promise.all([
      tx.student.findMany({
        where: { workspaceId: scope.workspaceId, archivedAt: null },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      }),
      tx.attendanceMark.findMany({
        where: {
          workspaceId: scope.workspaceId,
          id: canReadAttendance ? undefined : { in: [] },
          session: { status: { not: "cancelled" } },
        },
        include: {
          session: {
            select: {
              id: true,
              startsAt: true,
              groupId: true,
              gradeLabel: true,
              group: { select: { id: true, name: true } },
            },
          },
        },
      }),
      tx.homeworkSubmission.findMany({
        where: {
          workspaceId: scope.workspaceId,
          id: canReadHomework ? undefined : { in: [] },
          homework: { status: "active", dueAt: { lt: now } },
        },
        include: {
          homework: { select: { id: true, title: true, dueAt: true } },
        },
      }),
      tx.assessmentScore.findMany({
        where: {
          workspaceId: scope.workspaceId,
          id: canReadGrades ? undefined : { in: [] },
          status: "graded",
          score: { not: null },
        },
        include: {
          assessment: {
            select: { id: true, title: true, date: true, maxScore: true },
          },
        },
      }),
      tx.studentFollowUp.findMany({
        where: { workspaceId: scope.workspaceId },
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
          ownerMember: { include: { user: { select: { id: true, name: true } } } },
          events: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ createdAt: "desc" }],
      }),
      tx.workspaceSettings.findUnique({
        where: { workspaceId: scope.workspaceId },
        select: { atRiskAfter: true },
      }),
    ]);

    const attendanceFacts: AttendanceFact[] = marks.map((mark) => ({
      studentId: mark.studentId,
      groupId: mark.session.groupId,
      groupName: mark.session.group?.name ?? mark.session.gradeLabel ?? "",
      sessionId: mark.session.id,
      date: mark.session.startsAt.toISOString(),
      mark: mark.mark,
    }));
    const homeworkFacts: HomeworkFact[] = submissions.map((submission) => ({
      studentId: submission.studentId,
      homeworkId: submission.homework.id,
      title: submission.homework.title,
      dueAt: submission.homework.dueAt.toISOString(),
      status: submission.status,
    }));
    const assessmentFacts: AssessmentFact[] = scores.map((score) => ({
      studentId: score.studentId,
      assessmentId: score.assessment.id,
      title: score.assessment.title,
      date: score.assessment.date.toISOString().slice(0, 10),
      status: score.status,
      score: score.score === null ? null : Number(score.score),
      maxScore: Number(score.assessment.maxScore),
    }));

    return {
      flags: calculateFollowUpFlags(
        students,
        attendanceFacts,
        homeworkFacts,
        assessmentFacts,
        now,
        settings?.atRiskAfter ?? 2,
      ),
      sourceAccess: {
        attendance: canReadAttendance,
        homework: canReadHomework,
        assessments: canReadGrades,
      },
      followUps: followUps.map((followUp) => ({
        id: followUp.id,
        student: followUp.student,
        owner: { id: followUp.ownerMember.user.id, name: followUp.ownerMember.user.name },
        title: followUp.title,
        note: followUp.note,
        dueAt: followUp.dueAt,
        status: followUp.status,
        outcome: followUp.outcome,
        resolvedAt: followUp.resolvedAt,
        createdAt: followUp.createdAt,
        history: followUp.events.map((event) => ({
          actor: event.actorDisplayName,
          action: event.action,
          outcome: event.outcome,
          createdAt: event.createdAt,
        })),
      })),
    };
  });
}

export async function listFollowUpOwners(scope: Scope) {
  authorize(scope, "students", "read");
  return withScope(scope, (tx) =>
    tx.workspaceMember
      .findMany({
        where: { workspaceId: scope.workspaceId, status: "active" },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { joinedAt: "asc" },
      })
      .then((members) => members.map(({ user }) => user)),
  );
}

export async function createFollowUp(
  scope: Scope,
  input: CreateFollowUpInput,
  req?: RequestContext,
) {
  authorize(scope, "students", "write");
  const ctx = auditContext(req);
  const followUpId = newUuidV7();
  const ownerUserId = input.ownerUserId ?? scope.actorUserId;
  return withScope(scope, async (tx) => {
    const [student, owner] = await Promise.all([
      tx.student.findFirst({
        where: { id: input.studentId, workspaceId: scope.workspaceId, archivedAt: null },
        select: { id: true },
      }),
      tx.workspaceMember.findFirst({
        where: { workspaceId: scope.workspaceId, userId: ownerUserId, status: "active" },
        select: { userId: true },
      }),
    ]);
    if (!student || !owner) throw new AppError("NOT_FOUND");
    const followUp = await tx.studentFollowUp.create({
      data: {
        id: followUpId,
        workspaceId: scope.workspaceId,
        studentId: input.studentId,
        ownerUserId,
        title: input.title,
        note: input.note ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        createdBy: scope.actorUserId,
      },
    });
    await tx.studentFollowUpEvent.create({
      data: {
        id: newUuidV7(),
        workspaceId: scope.workspaceId,
        followUpId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        action: "created",
      },
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "student_follow_up",
      entityId: followUpId,
      action: "student_follow_up.created",
      diff: { studentId: input.studentId, ownerUserId, dueAt: input.dueAt ?? null },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });
    return followUp;
  });
}

export async function resolveFollowUp(
  scope: Scope,
  followUpId: string,
  input: FollowUpOutcomeInput,
  req?: RequestContext,
) {
  authorize(scope, "students", "write");
  const ctx = auditContext(req);
  return withScope(scope, async (tx) => {
    const existing = await tx.studentFollowUp.findFirst({
      where: { id: followUpId, workspaceId: scope.workspaceId },
    });
    if (!existing) throw new AppError("NOT_FOUND");
    const wasCorrection = existing.status === "resolved";
    if (wasCorrection && existing.outcome === input.outcome) {
      // Identical retry after resolution is intentionally idempotent and records nothing.
      return existing;
    }
    const now = new Date();
    const updated = await tx.studentFollowUp.update({
      where: { id: followUpId, workspaceId: scope.workspaceId },
      data: { status: "resolved", outcome: input.outcome, resolvedAt: now },
    });
    await tx.studentFollowUpEvent.create({
      data: {
        id: newUuidV7(),
        workspaceId: scope.workspaceId,
        followUpId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        action: wasCorrection ? "outcome_corrected" : "resolved",
        outcome: input.outcome,
      },
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "student_follow_up",
      entityId: followUpId,
      action: wasCorrection
        ? "student_follow_up.outcome_corrected"
        : "student_follow_up.resolved",
      diff: wasCorrection
        ? { previousOutcome: existing.outcome ?? null, outcome: input.outcome }
        : { outcome: input.outcome },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });
    return updated;
  });
}
