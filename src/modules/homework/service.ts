import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import { authorize, isAllowed, type Scope } from "@/modules/tenancy/types";
import {
  createHomeworkTx,
  ensureGroupHomeworkSubmissionsTx,
  findHomeworkTx,
  listHomeworkRows,
  toHomeworkDecimal,
} from "./repository";
import type {
  CreateHomeworkInput,
  HomeworkQuery,
  UpdateHomeworkInput,
  UpdateSubmissionInput,
} from "./schemas";

type RequestContext = { requestId?: string; ipHash?: string | null };
function auditContext(value?: RequestContext) {
  return { requestId: value?.requestId ?? newRequestId(), ipHash: value?.ipHash ?? null };
}

export async function listHomework(scope: Scope, query: HomeworkQuery) {
  authorize(scope, "homework", "read");
  authorize(scope, "students", "read");
  const canReadGrades = isAllowed(scope, "grades", "read");
  const rows = await listHomeworkRows(scope, query);
  return rows.map((homework) => {
    const submissions = homework.submissions.filter((submission) => {
      if (submission.student.archivedAt) return false;
      return (
        homework.groupId === null ||
        submission.student.enrollments.some(({ groupId }) => groupId === homework.groupId)
      );
    });
    const completed = submissions.filter(
      ({ status }) => status === "submitted" || status === "late",
    ).length;
    return {
      id: homework.id,
      group: homework.group,
      title: homework.title,
      instructions: homework.instructions,
      dueAt: homework.dueAt,
      maxScore: homework.maxScore === null ? null : Number(homework.maxScore),
      status: homework.status,
      resources: homework.resources.map(({ file }) => ({
        id: file.id,
        displayName: file.title,
        mime: file.mime,
      })),
      totalStudents: submissions.length,
      completedStudents: completed,
      completionPercent: submissions.length === 0 ? null : (completed / submissions.length) * 100,
      submissions: submissions.map((submission) => ({
        id: submission.id,
        student: {
          id: submission.student.id,
          firstName: submission.student.firstName,
          lastName: submission.student.lastName,
        },
        status: submission.status,
        teacherFeedback: submission.teacherFeedback,
        score: !canReadGrades || submission.score === null ? null : Number(submission.score),
        submittedAt: submission.submittedAt,
      })),
    };
  });
}

export async function createHomework(
  scope: Scope,
  input: CreateHomeworkInput,
  req?: RequestContext,
) {
  authorize(scope, "homework", "write");
  if (input.groupId) authorize(scope, "groups", "read");
  else authorize(scope, "students", "read");
  if (input.maxScore != null) authorize(scope, "grades", "write");
  if (input.resourceFileIds.length > 0) authorize(scope, "files", "read");
  const ctx = auditContext(req);
  const id = newUuidV7();
  return withScope(scope, async (tx) => {
    let studentIds: string[];
    if (input.groupId) {
      const group = await tx.group.findFirst({
        where: { id: input.groupId, workspaceId: scope.workspaceId, archivedAt: null },
        select: { id: true },
      });
      if (!group) throw new AppError("NOT_FOUND");
      const enrollments = await tx.enrollment.findMany({
        where: {
          workspaceId: scope.workspaceId,
          groupId: input.groupId,
          leftAt: null,
          student: { archivedAt: null },
        },
        select: { studentId: true },
      });
      studentIds = enrollments.map(({ studentId }) => studentId);
    } else {
      studentIds = input.studentIds ?? [];
      const count = await tx.student.count({
        where: {
          workspaceId: scope.workspaceId,
          id: { in: studentIds },
          archivedAt: null,
        },
      });
      if (count !== studentIds.length) throw new AppError("NOT_FOUND");
    }

    if (input.resourceFileIds.length > 0) {
      const files = await tx.file.findMany({
        where: {
          workspaceId: scope.workspaceId,
          id: { in: input.resourceFileIds },
          scanStatus: "clean",
          deletedAt: null,
        },
        select: {
          id: true,
          scope: true,
          groupId: true,
          studentId: true,
          uploadedBy: true,
          groupAccesses: { select: { groupId: true } },
          studentAccesses: { select: { studentId: true } },
        },
      });
      const permitted = new Set(
        files
          .filter((file) => {
            if (file.scope === "groups")
              return file.groupAccesses.some(({ groupId }) => groupId === input.groupId);
            if (file.scope === "students")
              return (
                studentIds.length === 1 &&
                file.studentAccesses.some(({ studentId }) => studentId === studentIds[0])
              );
            return file.uploadedBy === scope.actorUserId;
          })
          .map(({ id: fileId }) => fileId),
      );
      if (permitted.size !== input.resourceFileIds.length) throw new AppError("NOT_FOUND");
    }

    const homework = await createHomeworkTx(tx, scope, id, input, studentIds);
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "homework",
      entityId: id,
      action: "homework.created",
      diff: {
        groupId: input.groupId ?? null,
        title: input.title,
        dueAt: input.dueAt,
        studentCount: studentIds.length,
        resourceCount: input.resourceFileIds.length,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });
    return homework;
  });
}

export async function updateHomework(
  scope: Scope,
  homeworkId: string,
  input: UpdateHomeworkInput,
  req?: RequestContext,
) {
  authorize(scope, "homework", "write");
  const ctx = auditContext(req);
  return withScope(scope, async (tx) => {
    const existing = await findHomeworkTx(tx, scope.workspaceId, homeworkId);
    if (!existing) throw new AppError("NOT_FOUND");
    if (input.maxScore !== undefined) {
      const maximum = input.maxScore;
      const scores = await tx.homeworkSubmission.findMany({
        where: { workspaceId: scope.workspaceId, homeworkId, score: { not: null } },
        select: { score: true },
      });
      if (
        maximum === null
          ? scores.length > 0
          : scores.some((row) => row.score !== null && Number(row.score) > maximum)
      ) {
        throw new AppError("CONFLICT");
      }
    }
    const updated = await tx.homework.update({
      where: { id: homeworkId, workspaceId: scope.workspaceId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
        ...(input.dueAt !== undefined ? { dueAt: new Date(input.dueAt) } : {}),
        ...(input.maxScore !== undefined
          ? { maxScore: input.maxScore === null ? null : toHomeworkDecimal(input.maxScore) }
          : {}),
      },
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "homework",
      entityId: homeworkId,
      action: "homework.updated",
      diff: {
        changedFields: Object.keys(input).filter((key) => key !== "instructions"),
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });
    return updated;
  });
}

export async function archiveHomework(
  scope: Scope,
  homeworkId: string,
  archived: boolean,
  req?: RequestContext,
) {
  authorize(scope, "homework", "write");
  const ctx = auditContext(req);
  return withScope(scope, async (tx) => {
    const homework = await findHomeworkTx(tx, scope.workspaceId, homeworkId);
    if (!homework) throw new AppError("NOT_FOUND");
    if (
      (archived && homework.status === "archived") ||
      (!archived && homework.status === "active")
    ) {
      return homework;
    }
    const updated = await tx.homework.update({
      where: { id: homeworkId, workspaceId: scope.workspaceId },
      data: { status: archived ? "archived" : "active", archivedAt: archived ? new Date() : null },
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "homework",
      entityId: homeworkId,
      action: archived ? "homework.archived" : "homework.restored",
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });
    return updated;
  });
}

export async function updateHomeworkSubmission(
  scope: Scope,
  homeworkId: string,
  studentId: string,
  input: UpdateSubmissionInput,
  req?: RequestContext,
) {
  authorize(scope, "homework", "write");
  if (input.score !== undefined) authorize(scope, "grades", "write");
  const ctx = auditContext(req);
  return withScope(scope, async (tx) => {
    const homework = await findHomeworkTx(tx, scope.workspaceId, homeworkId);
    if (!homework) throw new AppError("NOT_FOUND");
    if (input.score !== undefined) {
      if (homework.maxScore === null && input.score !== null) {
        throw new AppError("VALIDATION_FAILED", { fields: { score: ["homeworkHasNoGradeScale"] } });
      }
      if (
        input.score !== null &&
        homework.maxScore !== null &&
        input.score > Number(homework.maxScore)
      ) {
        throw new AppError("VALIDATION_FAILED", { fields: { score: ["scoreExceedsMaximum"] } });
      }
    }
    const existing = await tx.homeworkSubmission.findFirst({
      where: { workspaceId: scope.workspaceId, homeworkId, studentId },
    });
    if (!existing) throw new AppError("NOT_FOUND");
    const savedAt = new Date();
    const statusChanged = existing.status !== input.status;
    const scoreChanged =
      input.score !== undefined &&
      (existing.score?.toString() ?? null) !== (input.score?.toString() ?? null);
    const feedbackChanged =
      input.teacherFeedback !== undefined && existing.teacherFeedback !== input.teacherFeedback;
    if (!statusChanged && !scoreChanged && !feedbackChanged) return existing;
    const updated = await tx.homeworkSubmission.update({
      where: { id: existing.id, workspaceId: scope.workspaceId },
      data: {
        status: input.status,
        ...(input.teacherFeedback !== undefined ? { teacherFeedback: input.teacherFeedback } : {}),
        ...(input.score !== undefined
          ? { score: input.score === null ? null : toHomeworkDecimal(input.score) }
          : {}),
        submittedAt:
          input.status === "submitted" || input.status === "late"
            ? (existing.submittedAt ?? savedAt)
            : null,
        updatedBy: scope.actorUserId,
      },
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "homework_submission",
      entityId: existing.id,
      action: "homework.submission_updated",
      diff: {
        oldStatus: existing.status,
        newStatus: updated.status,
        oldScore: existing.score?.toString() ?? null,
        newScore: updated.score?.toString() ?? null,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });
    return updated;
  });
}

export async function listHomeworkResources(scope: Scope) {
  authorize(scope, "files", "read");
  const rows = await withScope(scope, (tx) =>
    tx.file.findMany({
      where: {
        workspaceId: scope.workspaceId,
        scanStatus: "clean",
        archivedAt: null,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        mime: true,
        scope: true,
        groupId: true,
        studentId: true,
        uploadedBy: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  );
  return rows.filter(
    (file) =>
      (file.scope === "teacher_only" && file.uploadedBy === scope.actorUserId) ||
      (file.scope === "groups" && isAllowed(scope, "grades", "read")) ||
      (file.scope === "students" && isAllowed(scope, "students", "read")),
  );
}

export async function addNewEnrollmentToHomework(
  tx: Parameters<typeof ensureGroupHomeworkSubmissionsTx>[0],
  scope: Scope,
  groupId: string,
  studentId: string,
  requestId: string,
) {
  const inserted = await ensureGroupHomeworkSubmissionsTx(
    tx,
    scope.workspaceId,
    groupId,
    studentId,
    scope.actorUserId,
  );
  for (const homeworkId of inserted) {
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "homework",
      entityId: homeworkId,
      action: "homework.student_added",
      diff: { studentId },
      requestId,
    });
  }
}
