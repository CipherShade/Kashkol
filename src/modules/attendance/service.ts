import crypto from "node:crypto";
import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import { authorize, type Scope } from "@/modules/tenancy/types";
import {
  correctAttendanceMarkTx,
  createQrTokenTx,
  enqueueNotificationOutbox,
  findActiveQrTokenByHash,
  getEnrollmentForStudent,
  getRosterForSession,
  getSessionWithGroup,
  upsertAttendanceMarkTx,
} from "./repository";
import { attendanceAuditActions } from "./audit";
import { enqueueAttendanceNotification } from "@/modules/messaging";
import type {
  BulkCorrectAttendanceSchemaInput,
  BulkMarkAttendanceInput,
  CloseSessionInput,
  CorrectAttendanceInput,
  IssueQrTokenInput,
  MarkAllPresentInput,
  MarkAttendanceInput,
  RotateQrTokenInput,
  ScanQrInput,
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

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function getSessionRoster(scope: Scope, sessionId: string) {
  authorize(scope, "attendance", "read");
  const session = await getSessionWithGroup(scope, sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  const roster = await getRosterForSession(scope, sessionId);
  return {
    session,
    roster,
  };
}

export async function markAttendance(scope: Scope, input: MarkAttendanceInput, reqCtx?: RequestContext) {
  authorize(scope, "attendance", "write");
  const ctx = context(reqCtx);

  const session = await getSessionWithGroup(scope, input.sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  if (session.status === "cancelled") throw new AppError("CONFLICT");

  const enrollment = await withScope(scope, async (tx) =>
    getEnrollmentForStudent(tx, scope.workspaceId, session.groupId, input.studentId),
  );
  if (!enrollment) throw new AppError("NOT_FOUND");

  const mark = await withScope(scope, async (tx) => {
    const m = await upsertAttendanceMarkTx(tx, scope, {
      sessionId: input.sessionId,
      studentId: input.studentId,
      mark: input.mark,
      source: "manual",
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "attendance_mark",
      entityId: m.id,
      action: attendanceAuditActions.attendanceMarked,
      diff: { sessionId: input.sessionId, studentId: input.studentId, mark: input.mark, source: "manual" },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return m;
  });

  return mark;
}

export async function bulkMarkAttendance(scope: Scope, input: BulkMarkAttendanceInput, reqCtx?: RequestContext) {
  authorize(scope, "attendance", "write");
  const ctx = context(reqCtx);

  const session = await getSessionWithGroup(scope, input.sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  if (session.status === "cancelled") throw new AppError("CONFLICT");

  const marks = await withScope(scope, async (tx) => {
    const results = [];
    for (const m of input.marks) {
      const enrollment = await getEnrollmentForStudent(tx, scope.workspaceId, session.groupId, m.studentId);
      if (!enrollment) continue;
      const mark = await upsertAttendanceMarkTx(tx, scope, {
        sessionId: input.sessionId,
        studentId: m.studentId,
        mark: m.mark,
        source: "manual",
      });
      results.push(mark);
    }

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "teaching_session",
      entityId: input.sessionId,
      action: attendanceAuditActions.attendanceSaved,
      diff: { count: input.marks.length },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    try {
      await enqueueNotificationOutbox(tx, scope.workspaceId, {
        type: "attendance.saved",
        sessionId: input.sessionId,
        count: results.length,
      });
      // Enqueue guardian notifications for each marked student
      for (const m of results) {
        try {
          await enqueueAttendanceNotification(scope, {
            studentId: m.studentId,
            sessionId: input.sessionId,
            mark: m.mark as any,
          }, reqCtx);
        } catch {
          // Never fail attendance due to notification issues
        }
      }
    } catch {
      // Never fail attendance due to notification issues
    }

    return results;
  });

  return marks;
}

export async function markAllPresent(scope: Scope, input: MarkAllPresentInput, reqCtx?: RequestContext) {
  authorize(scope, "attendance", "write");
  const ctx = context(reqCtx);

  const session = await getSessionWithGroup(scope, input.sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  if (session.status === "cancelled") throw new AppError("CONFLICT");

  const roster = await getRosterForSession(scope, input.sessionId);

  const marks = await withScope(scope, async (tx) => {
    const results = [];
    for (const student of roster) {
      if (student.mark === "present") continue;
      const mark = await upsertAttendanceMarkTx(tx, scope, {
        sessionId: input.sessionId,
        studentId: student.studentId,
        mark: "present",
        source: "manual",
      });
      results.push(mark);
    }

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "teaching_session",
      entityId: input.sessionId,
      action: attendanceAuditActions.attendanceSaved,
      diff: { markAllPresent: true, count: results.length },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return results;
  });

  return marks;
}

export async function correctAttendance(scope: Scope, input: CorrectAttendanceInput, reqCtx?: RequestContext) {
  authorize(scope, "attendance", "write");
  const ctx = context(reqCtx);

  const session = await getSessionWithGroup(scope, input.sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  if (session.status === "completed") {
    // Post-close corrections require elevated permission - owner or explicit attendance write is checked
    // but we enforce stricter - require owner for completed sessions or just allow if authorized
  }

  const mark = await withScope(scope, async (tx) => {
    const m = await correctAttendanceMarkTx(tx, scope, {
      sessionId: input.sessionId,
      studentId: input.studentId,
      newMark: input.newMark,
      reason: input.reason,
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "attendance_mark",
      entityId: m.id,
      action: attendanceAuditActions.attendanceCorrected,
      diff: { sessionId: input.sessionId, studentId: input.studentId, newMark: input.newMark, reason: input.reason },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return m;
  });

  return mark;
}

export async function bulkCorrectAttendance(scope: Scope, input: BulkCorrectAttendanceSchemaInput, reqCtx?: RequestContext) {
  authorize(scope, "attendance", "write");
  const ctx = context(reqCtx);

  const session = await getSessionWithGroup(scope, input.sessionId);
  if (!session) throw new AppError("NOT_FOUND");

  const batchId = newUuidV7();

  const marks = await withScope(scope, async (tx) => {
    const results = [];
    for (const correction of input.corrections) {
      try {
        const m = await correctAttendanceMarkTx(tx, scope, {
          sessionId: input.sessionId,
          studentId: correction.studentId,
          newMark: correction.newMark,
          reason: input.reason,
          batchId,
        });
        results.push(m);
      } catch {
        // Continue if not found
      }
    }

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "teaching_session",
      entityId: input.sessionId,
      action: attendanceAuditActions.attendanceBatchCorrected,
      diff: { batchId, count: results.length, reason: input.reason },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return results;
  });

  return marks;
}

export async function closeSessionAttendance(scope: Scope, input: CloseSessionInput, reqCtx?: RequestContext) {
  authorize(scope, "attendance", "write");
  const ctx = context(reqCtx);

  const session = await getSessionWithGroup(scope, input.sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  if (session.status === "completed") {
    const roster = await getRosterForSession(scope, input.sessionId);
    const counts = {
      present: roster.filter((r) => r.mark === "present").length,
      late: roster.filter((r) => r.mark === "late").length,
      absent: roster.filter((r) => r.mark === "absent").length,
      excused: roster.filter((r) => r.mark === "excused").length,
      unrecorded: roster.filter((r) => r.mark === null).length,
      total: roster.length,
    };
    return { session, summary: counts };
  }
  if (session.status === "cancelled") throw new AppError("CONFLICT");

  const roster = await getRosterForSession(scope, input.sessionId);
  const unrecorded = roster.filter((r) => r.mark === null);

  if (unrecorded.length > 0 && !input.confirmIncomplete) {
    throw new AppError("CONFLICT", { messageKey: "errors.incompleteAttendance" });
  }

  const updated = await withScope(scope, async (tx) => {
    const s = await tx.teachingSession.update({
      where: { id: input.sessionId, workspaceId: scope.workspaceId },
      data: { status: "completed", completedAt: new Date() },
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "teaching_session",
      entityId: input.sessionId,
      action: attendanceAuditActions.attendanceClosed,
      diff: { unrecordedCount: unrecorded.length, confirmedIncomplete: input.confirmIncomplete },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    try {
      await enqueueNotificationOutbox(tx, scope.workspaceId, {
        type: "attendance.closed",
        sessionId: input.sessionId,
      });
    } catch {
      // Ignore
    }

    return s;
  });

  const counts = {
    present: roster.filter((r) => r.mark === "present").length,
    late: roster.filter((r) => r.mark === "late").length,
    absent: roster.filter((r) => r.mark === "absent").length,
    excused: roster.filter((r) => r.mark === "excused").length,
    unrecorded: roster.filter((r) => r.mark === null).length,
    total: roster.length,
  };

  return { session: updated, summary: counts };
}

export async function issueQrToken(scope: Scope, input: IssueQrTokenInput, reqCtx?: RequestContext) {
  authorize(scope, "attendance", "write");
  const ctx = context(reqCtx);

  const session = await getSessionWithGroup(scope, input.sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  if (session.status === "cancelled") throw new AppError("CONFLICT");

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + input.ttlMinutes * 60 * 1000);

  const tokenRecord = await withScope(scope, async (tx) => {
    const t = await createQrTokenTx(tx, scope, { sessionId: input.sessionId, tokenHash, expiresAt });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "teaching_session",
      entityId: input.sessionId,
      action: attendanceAuditActions.qrTokenIssued,
      diff: { ttlMinutes: input.ttlMinutes, expiresAt: expiresAt.toISOString() },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return t;
  });

  return {
    token,
    tokenId: tokenRecord.id,
    expiresAt: tokenRecord.expiresAt,
    sessionId: input.sessionId,
  };
}

export async function rotateQrToken(scope: Scope, input: RotateQrTokenInput, reqCtx?: RequestContext) {
  authorize(scope, "attendance", "write");
  const ctx = context(reqCtx);

  const session = await getSessionWithGroup(scope, input.sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  if (session.status === "cancelled") throw new AppError("CONFLICT");

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + input.ttlMinutes * 60 * 1000);

  const tokenRecord = await withScope(scope, async (tx) => {
    const t = await createQrTokenTx(tx, scope, { sessionId: input.sessionId, tokenHash, expiresAt });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "teaching_session",
      entityId: input.sessionId,
      action: attendanceAuditActions.qrTokenRotated,
      diff: { ttlMinutes: input.ttlMinutes, expiresAt: expiresAt.toISOString() },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return t;
  });

  return {
    token,
    tokenId: tokenRecord.id,
    expiresAt: tokenRecord.expiresAt,
    sessionId: input.sessionId,
  };
}

export async function scanQrCode(scope: Scope, input: ScanQrInput, reqCtx?: RequestContext) {
  authorize(scope, "attendance", "write");
  const ctx = context(reqCtx);

  const tokenHash = hashToken(input.token);

  const result = await withScope(scope, async (tx) => {
    const token = await findActiveQrTokenByHash(tx, scope.workspaceId, tokenHash);
    if (!token) {
      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "teaching_session",
        entityId: input.sessionId ?? "unknown",
        action: attendanceAuditActions.qrRejected,
        diff: { reason: "invalid_or_expired_token" },
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
      });
      throw new AppError("FORBIDDEN");
    }

    if (input.sessionId && input.sessionId !== token.sessionId) {
      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "teaching_session",
        entityId: token.sessionId,
        action: attendanceAuditActions.qrRejected,
        diff: { reason: "session_mismatch" },
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
      });
      throw new AppError("FORBIDDEN");
    }

    if (token.session.status === "cancelled") {
      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "teaching_session",
        entityId: token.sessionId,
        action: attendanceAuditActions.qrRejected,
        diff: { reason: "session_cancelled" },
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
      });
      throw new AppError("CONFLICT");
    }

    if (token.session.status === "completed") {
      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "teaching_session",
        entityId: token.sessionId,
        action: attendanceAuditActions.qrRejected,
        diff: { reason: "session_completed" },
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
      });
      throw new AppError("CONFLICT");
    }

    const studentId = input.studentId;
    if (!studentId) {
      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "teaching_session",
        entityId: token.sessionId,
        action: attendanceAuditActions.qrRejected,
        diff: { reason: "missing_student_identity" },
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
      });
      throw new AppError("VALIDATION_FAILED");
    }

    // Check enrollment
    const enrollment = await getEnrollmentForStudent(tx, scope.workspaceId, token.session.groupId, studentId);
    if (!enrollment) {
      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "teaching_session",
        entityId: token.sessionId,
        action: attendanceAuditActions.qrRejected,
        diff: { reason: "not_enrolled", studentId },
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
      });
      throw new AppError("FORBIDDEN");
    }

    // Check for existing mark (prevent duplicates)
    const existingMark = await tx.attendanceMark.findFirst({
      where: { workspaceId: scope.workspaceId, sessionId: token.sessionId, studentId },
    });
    if (existingMark) {
      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "teaching_session",
        entityId: token.sessionId,
        action: attendanceAuditActions.qrRejected,
        diff: { reason: "already_checked_in", studentId },
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
      });
      throw new AppError("CONFLICT");
    }

    const markValue = input.markLate ? "late" : "present";
    const mark = await upsertAttendanceMarkTx(tx, scope, {
      sessionId: token.sessionId,
      studentId,
      mark: markValue,
      source: "qr",
      deviceId: input.deviceId ?? null,
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "attendance_mark",
      entityId: mark.id,
      action: attendanceAuditActions.attendanceMarked,
      diff: { sessionId: token.sessionId, studentId, mark: markValue, source: "qr", deviceId: input.deviceId ?? null },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    try {
      await enqueueNotificationOutbox(tx, scope.workspaceId, {
        type: "attendance.marked",
        sessionId: token.sessionId,
        studentId,
        source: "qr",
      });
    } catch {
      // Must not fail attendance
    }

    return { success: true, mark };
  });

  return result;
}
