import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import { authorize, type Scope } from "@/modules/tenancy/types";
import {
  cancelSessionTx,
  cancelSeriesTx,
  completeSessionTx,
  createOneOffSessionTx,
  findConflictingSessions,
  findSessionById,
  generateSessionsForGroup,
  listSessions,
  rescheduleSessionTx,
  rescheduleSeriesTx,
  startSessionTx,
  updateSessionTx,
} from "./repository";
import type {
  CancelSessionInput,
  CompleteSessionInput,
  CreateOneOffSessionInput,
  GenerateSessionsInput,
  RescheduleSessionInput,
  SessionQueryParams,
  StartSessionInput,
  UpdateSessionInput,
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

export async function getSessions(scope: Scope, params: SessionQueryParams) {
  authorize(scope, "sessions", "read");
  const from = new Date(params.from);
  const to = new Date(params.to);
  return listSessions(scope, from, to, params.groupId);
}

export async function getSession(scope: Scope, sessionId: string) {
  authorize(scope, "sessions", "read");
  const session = await findSessionById(scope, sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  return session;
}

export async function createOneOffSession(
  scope: Scope,
  input: CreateOneOffSessionInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "sessions", "write");
  const ctx = context(reqCtx);

  const sessionId = newUuidV7();
  const startsAt = new Date(input.startsAt);
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;

  // Check conflicts
  const conflicts = await findConflictingSessions(scope, input.groupId, startsAt, endsAt);
  if (conflicts.length > 0) {
    throw new AppError("CONFLICT");
  }

  return withScope(scope, async (tx) => {
    const session = await createOneOffSessionTx(tx, scope, {
      id: sessionId,
      groupId: input.groupId,
      startsAt,
      endsAt,
      room: input.room,
      location: input.location,
      notes: input.notes,
      teacherId: input.teacherId,
      assistantId: input.assistantId,
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "teaching_session",
      entityId: sessionId,
      action: "session.created",
      diff: {
        groupId: input.groupId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        isOneOff: true,
        room: input.room,
        location: input.location,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return session;
  });
}

export async function updateSession(
  scope: Scope,
  input: UpdateSessionInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "sessions", "write");
  const ctx = context(reqCtx);

  const existing = await findSessionById(scope, input.id);
  if (!existing) throw new AppError("NOT_FOUND");

  return withScope(scope, async (tx) => {
    const session = await updateSessionTx(tx, scope, input.id, {
      room: input.room,
      location: input.location,
      notes: input.notes,
      teacherId: input.teacherId,
      assistantId: input.assistantId,
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "teaching_session",
      entityId: input.id,
      action: "session.updated",
      diff: {
        room: input.room,
        location: input.location,
        notes: input.notes,
        teacherId: input.teacherId,
        assistantId: input.assistantId,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return session;
  });
}

export async function rescheduleSession(
  scope: Scope,
  input: RescheduleSessionInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "sessions", "write");
  const ctx = context(reqCtx);

  const existing = await findSessionById(scope, input.id);
  if (!existing) throw new AppError("NOT_FOUND");

  const startsAt = new Date(input.startsAt);
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;

  // Check conflicts
  const conflicts = await findConflictingSessions(scope, existing.groupId, startsAt, endsAt, input.id);
  if (conflicts.length > 0) {
    throw new AppError("CONFLICT");
  }

  return withScope(scope, async (tx) => {
    if (input.scope === "series" && existing.seriesId) {
      await rescheduleSeriesTx(tx, scope, existing.seriesId, {
        startsAt,
        endsAt,
        fromDate: startsAt,
      });
    }

    const session = await rescheduleSessionTx(tx, scope, input.id, {
      startsAt,
      endsAt,
    });

    await tx.sessionRevision.create({
      data: {
        id: newUuidV7(),
        workspaceId: scope.workspaceId,
        sessionId: input.id,
        actorId: scope.actorUserId,
        reason: input.reason,
        before: {
          startsAt: existing.startsAt,
          endsAt: existing.endsAt,
          status: existing.status,
        },
        after: {
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        },
      },
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "teaching_session",
      entityId: input.id,
      action: "session.rescheduled",
      diff: {
        before: {
          startsAt: existing.startsAt,
          endsAt: existing.endsAt,
        },
        after: {
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        },
        reason: input.reason,
        hadAttendance: existing.hasAttendance,
        scope: input.scope,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return session;
  });
}

export async function cancelSession(
  scope: Scope,
  input: CancelSessionInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "sessions", "write");
  const ctx = context(reqCtx);

  const existing = await findSessionById(scope, input.id);
  if (!existing) throw new AppError("NOT_FOUND");

  return withScope(scope, async (tx) => {
    if (input.scope === "series" && existing.seriesId) {
      await cancelSeriesTx(tx, scope, existing.seriesId, scope.actorUserId, existing.startsAt);
    }

    const session = await cancelSessionTx(tx, scope, input.id, scope.actorUserId);

    await tx.sessionRevision.create({
      data: {
        id: newUuidV7(),
        workspaceId: scope.workspaceId,
        sessionId: input.id,
        actorId: scope.actorUserId,
        reason: input.reason,
        before: {
          status: existing.status,
          cancelledAt: existing.cancelledAt,
        },
        after: {
          status: "cancelled",
          cancelledAt: new Date(),
        },
      },
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "teaching_session",
      entityId: input.id,
      action: "session.cancelled",
      diff: {
        reason: input.reason,
        hadAttendance: existing.hasAttendance,
        scope: input.scope,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return session;
  });
}

export async function startSession(
  scope: Scope,
  input: StartSessionInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "sessions", "write");
  const ctx = context(reqCtx);

  const existing = await findSessionById(scope, input.id);
  if (!existing) throw new AppError("NOT_FOUND");
  if (existing.status !== "scheduled") throw new AppError("CONFLICT");

  return withScope(scope, async (tx) => {
    const session = await startSessionTx(tx, scope, input.id);

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "teaching_session",
      entityId: input.id,
      action: "session.started",
      diff: {
        from: existing.status,
        to: "started",
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return session;
  });
}

export async function completeSession(
  scope: Scope,
  input: CompleteSessionInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "sessions", "write");
  const ctx = context(reqCtx);

  const existing = await findSessionById(scope, input.id);
  if (!existing) throw new AppError("NOT_FOUND");
  if (existing.status !== "started" && existing.status !== "scheduled") throw new AppError("CONFLICT");

  return withScope(scope, async (tx) => {
    const session = await completeSessionTx(tx, scope, input.id);

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "teaching_session",
      entityId: input.id,
      action: "session.completed",
      diff: {
        from: existing.status,
        to: "completed",
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return session;
  });
}

export async function generateSessions(scope: Scope, input: GenerateSessionsInput) {
  authorize(scope, "sessions", "write");
  return generateSessionsForGroup(scope, input.groupId, input.weeksAhead);
}
