import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import { addNewEnrollmentToHomework } from "@/modules/homework";
import { assertWorkspaceWriteAllowedTx } from "@/modules/platform-admin/enforcement";
import { authorize, type Scope } from "@/modules/tenancy/types";
import {
  archiveGroupTx,
  enrollStudentTx,
  findGroupById,
  findGroupConflicts,
  findOrCreateSubjectTx,
  insertGroupTx,
  isUniqueViolation,
  listGroups,
  listSubjects,
  removeStudentFromGroupTx,
  restoreGroupTx,
  sortSlots,
  transferStudentGroupTx,
  updateGroupTx,
} from "./repository";
import type {
  CreateGroupInput,
  EnrollStudentInput,
  GroupQueryParams,
  RemoveStudentInput,
  TransferStudentInput,
  UpdateGroupInput,
} from "./schemas";

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

export async function getGroups(scope: Scope, query: GroupQueryParams) {
  authorize(scope, "groups", "read");
  return listGroups(scope, query);
}

export async function getGroup(scope: Scope, groupId: string) {
  authorize(scope, "groups", "read");
  const group = await findGroupById(scope, groupId);
  if (!group) throw new AppError("NOT_FOUND");
  return group;
}

export async function checkGroupSlotConflicts(
  scope: Scope,
  criteria: {
    weekday: number;
    startTime: string;
    endTime: string | null;
    excludeGroupId?: string;
  },
) {
  authorize(scope, "groups", "read");
  return findGroupConflicts(scope, criteria);
}

export async function createGroup(
  scope: Scope,
  input: CreateGroupInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "groups", "write");
  const ctx = context(reqCtx);

  const groupId = newUuidV7();

  return withScope(scope, async (tx) => {
    await assertWorkspaceWriteAllowedTx(tx, scope.workspaceId, {
      kind: "groups",
      additionalCount: 1,
    });
    let resolvedSubjectId = input.subjectId ?? null;
    if (!resolvedSubjectId && input.subjectName && input.subjectName.trim()) {
      const subject = await findOrCreateSubjectTx(tx, scope, input.subjectName);
      resolvedSubjectId = subject.id;
    }

    const group = await insertGroupTx(tx, scope, {
      id: groupId,
      name: input.name,
      subjectId: resolvedSubjectId,
      grade: input.grade,
      color: input.color,
      slots: input.slots,
      teacherNote: input.teacherNote,
      defaultPricePerStudentMinor: input.defaultPricePerStudentMinor,
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "group",
      entityId: groupId,
      action: "group.created",
      diff: {
        name: input.name,
        slots: sortSlots(input.slots).map((s) => ({
          weekday: s.weekday,
          startTime: s.startTime,
          endTime: s.endTime ?? null,
          room: s.room ?? null,
          capacity: s.capacity ?? null,
        })),
        defaultPricePerStudentMinor: group.defaultPricePerStudentMinor,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return group;
  });
}

export async function updateGroup(
  scope: Scope,
  input: UpdateGroupInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "groups", "write");
  const ctx = context(reqCtx);

  const existing = await findGroupById(scope, input.id);
  if (!existing) throw new AppError("NOT_FOUND");

  return withScope(scope, async (tx) => {
    const updated = await updateGroupTx(tx, scope, input.id, {
      name: input.name,
      subjectId: input.subjectId,
      grade: input.grade,
      color: input.color,
      slots: input.slots,
      teacherNote: input.teacherNote,
      defaultPricePerStudentMinor: input.defaultPricePerStudentMinor,
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "group",
      entityId: input.id,
      action: "group.updated",
      diff: {
        before: {
          name: existing.name,
          slots: existing.slots.map((s) => ({
            weekday: s.weekday,
            startTime: s.startTime,
            endTime: s.endTime ?? null,
            room: s.room,
            capacity: s.capacity,
          })),
          defaultPricePerStudentMinor: existing.defaultPricePerStudentMinor,
        },
        after: {
          name: input.name,
          slots: sortSlots(input.slots).map((s) => ({
            weekday: s.weekday,
            startTime: s.startTime,
            endTime: s.endTime ?? null,
            room: s.room ?? null,
            capacity: s.capacity ?? null,
          })),
          defaultPricePerStudentMinor: input.defaultPricePerStudentMinor,
        },
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return updated;
  });
}

export async function updateGroupPrice(
  scope: Scope,
  groupId: string,
  priceMinor: number | null,
  reqCtx?: RequestContext,
) {
  authorize(scope, "groups", "write");
  const ctx = context(reqCtx);

  const existing = await findGroupById(scope, groupId);
  if (!existing) throw new AppError("NOT_FOUND");

  return withScope(scope, async (tx) => {
    const updated = await updateGroupTx(tx, scope, groupId, {
      defaultPricePerStudentMinor: priceMinor,
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "group",
      entityId: groupId,
      action: "group.price_updated",
      diff: {
        before: existing.defaultPricePerStudentMinor,
        after: priceMinor,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return updated;
  });
}

export async function archiveGroup(
  scope: Scope,
  groupId: string,
  reqCtx?: RequestContext,
) {
  authorize(scope, "groups", "write");
  const ctx = context(reqCtx);

  const existing = await findGroupById(scope, groupId);
  if (!existing) throw new AppError("NOT_FOUND");

  return withScope(scope, async (tx) => {
    const archived = await archiveGroupTx(tx, scope, groupId);

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "group",
      entityId: groupId,
      action: "group.archived",
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return archived;
  });
}

export async function restoreGroup(
  scope: Scope,
  groupId: string,
  reqCtx?: RequestContext,
) {
  authorize(scope, "groups", "write");
  const ctx = context(reqCtx);

  const existing = await findGroupById(scope, groupId);
  if (!existing) throw new AppError("NOT_FOUND");

  return withScope(scope, async (tx) => {
    const restored = await restoreGroupTx(tx, scope, groupId);

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "group",
      entityId: groupId,
      action: "group.restored",
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return restored;
  });
}

export async function enrollStudentInGroup(
  scope: Scope,
  input: EnrollStudentInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "groups", "write");
  const ctx = context(reqCtx);

  try {
    return await withScope(scope, async (tx) => {
      const [group, student] = await Promise.all([
        tx.group.findFirst({
          where: { id: input.groupId, workspaceId: scope.workspaceId, archivedAt: null },
          select: { id: true },
        }),
        tx.student.findFirst({
          where: { id: input.studentId, workspaceId: scope.workspaceId, archivedAt: null },
          select: { id: true },
        }),
      ]);
      if (!group || !student) throw new AppError("NOT_FOUND");
      const enrollment = await enrollStudentTx(tx, scope, input.groupId, input.studentId);
      await addNewEnrollmentToHomework(
        tx,
        scope,
        input.groupId,
        input.studentId,
        ctx.requestId,
      );

      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "enrollment",
        entityId: enrollment.id,
        action: "group.student_enrolled",
        diff: {
          groupId: input.groupId,
          studentId: input.studentId,
        },
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
      });

      return enrollment;
    });
  } catch (error) {
    // The database partial unique index resolves simultaneous enrollment
    // requests. Read its winner back in a new transaction after the loser rolls back.
    if (isUniqueViolation(error)) {
      const enrollment = await withScope(scope, (tx) =>
        tx.enrollment.findFirst({
          where: {
            workspaceId: scope.workspaceId,
            groupId: input.groupId,
            studentId: input.studentId,
            leftAt: null,
          },
        }),
      );
      if (enrollment) return enrollment;
    }
    throw error;
  }
}

export async function removeStudentFromGroup(
  scope: Scope,
  input: RemoveStudentInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "groups", "write");
  const ctx = context(reqCtx);

  return withScope(scope, async (tx) => {
    const result = await removeStudentFromGroupTx(tx, scope, input.groupId, input.studentId);
    if (result.count === 0) throw new AppError("NOT_FOUND");

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "group",
      entityId: input.groupId,
      action: "group.student_removed",
      diff: {
        groupId: input.groupId,
        studentId: input.studentId,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return { removed: true };
  });
}

export async function transferStudentGroup(
  scope: Scope,
  input: TransferStudentInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "groups", "write");
  if (input.fromGroupId === input.toGroupId) {
    throw new AppError("VALIDATION_FAILED", {
      fields: { toGroupId: ["destinationMustDiffer"] },
    });
  }
  const ctx = context(reqCtx);

  return withScope(scope, async (tx) => {
    const [source, destination, student, openEnrollment] = await Promise.all([
      tx.group.findFirst({
        where: { id: input.fromGroupId, workspaceId: scope.workspaceId, archivedAt: null },
        select: { id: true },
      }),
      tx.group.findFirst({
        where: { id: input.toGroupId, workspaceId: scope.workspaceId, archivedAt: null },
        select: { id: true },
      }),
      tx.student.findFirst({
        where: { id: input.studentId, workspaceId: scope.workspaceId, archivedAt: null },
        select: { id: true },
      }),
      tx.enrollment.findFirst({
        where: {
          workspaceId: scope.workspaceId,
          groupId: input.fromGroupId,
          studentId: input.studentId,
          leftAt: null,
        },
        select: { id: true },
      }),
    ]);
    if (!source || !destination || !student || !openEnrollment) throw new AppError("NOT_FOUND");
    const enrollment = await transferStudentGroupTx(
      tx,
      scope,
      input.fromGroupId,
      input.toGroupId,
      input.studentId,
    );

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "group",
      entityId: input.toGroupId,
      action: "group.student_transferred",
      diff: {
        fromGroupId: input.fromGroupId,
        toGroupId: input.toGroupId,
        studentId: input.studentId,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return enrollment;
  });
}

export async function getSubjectsList(scope: Scope) {
  authorize(scope, "groups", "read");
  return listSubjects(scope);
}
