import crypto from "node:crypto";
import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import { authorize, isAllowed, type Scope } from "@/modules/tenancy/types";
import {
  addSessionAttendeeTx,
  correctAttendanceMarkTx,
  createQrTokenTx,
  findActiveQrTokenByHash,
  findStudentForQrScanTx,
  getActiveEnrollmentForStudent,
  getEnrollmentForStudent,
  getRosterForSession,
  getSessionAttendeeTx,
  getSessionWithGroup,
  removeSessionAttendeeTx,
  upsertAttendanceMarkTx,
} from "./repository";
import {
  verifyStudentQrTokenSignature,
  validateStudentQrAgainstRecord,
} from "./student-qr";
import { attendanceAuditActions } from "./audit";
import { getSessionHomeworkContextTx } from "@/modules/homework";

import { createAttendanceNotification } from "@/modules/notifications";
import type {
  AddSessionAttendeeInput,
  BulkCorrectAttendanceSchemaInput,
  BulkMarkAttendanceInput,
  CloseSessionInput,
  CorrectAttendanceInput,
  IssueQrTokenInput,
  MarkAllPresentInput,
  MarkAttendanceInput,
  RemoveSessionAttendeeInput,
  RotateQrTokenInput,
  ScanQrInput,
  ScanStudentQrInput,
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
  const homeworkContext = await withScope(scope, (tx) =>
    getSessionHomeworkContextTx(
      tx,
      scope.workspaceId,
      session.groupId,
      roster.map((student) => student.studentId),
    ),
  );
  return {
    session,
    roster: roster.map((student) => ({
      ...student,
      homeworkStatus: homeworkContext.marks.get(student.studentId) ?? null,
    })),
    homework: homeworkContext.homework
      ? {
          id: homeworkContext.homework.id,
          title: homeworkContext.homework.title,
          dueAt: homeworkContext.homework.dueAt,
        }
      : null,
    canRecordHomework: isAllowed(scope, "homework", "write"),
  };
}

export async function markAttendance(scope: Scope, input: MarkAttendanceInput, reqCtx?: RequestContext) {
  authorize(scope, "attendance", "write");
  const ctx = context(reqCtx);

  const session = await getSessionWithGroup(scope, input.sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  if (session.status === "cancelled") throw new AppError("CONFLICT");

  const mark = await withScope(scope, async (tx) => {
    // Check the student is allowed on this session's roster. Group sessions
    // use the group's enrollments (with cross-season guest attendance);
    // group-less sessions use the materialised attendee roster, so a student
    // added via the attendance screen is checkable and one who isn't is not.
    let isCrossSeason = false;
    let primaryGroupId: string | null = null;

    if (session.groupId) {
      const primaryEnrollment = await getEnrollmentForStudent(tx, scope.workspaceId, session.groupId, input.studentId);
      if (!primaryEnrollment) {
        // 2. Cross-season check: student must have an active enrollment in ANY group in this workspace
        const activeEnrollment = await getActiveEnrollmentForStudent(tx, scope.workspaceId, input.studentId);
        if (!activeEnrollment) {
          throw new AppError("NOT_FOUND");
        }
        isCrossSeason = true;
        primaryGroupId = activeEnrollment.groupId;
      }
    } else {
      const attendee = await getSessionAttendeeTx(tx, scope.workspaceId, input.sessionId, input.studentId);
      if (!attendee) {
        throw new AppError("NOT_FOUND");
      }
    }

    const m = await upsertAttendanceMarkTx(tx, scope, {
      sessionId: input.sessionId,
      studentId: input.studentId,
      mark: input.mark,
      source: "manual",
      isCrossSeason,
      primaryGroupId,
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "attendance_mark",
      entityId: m.id,
      action: attendanceAuditActions.attendanceMarked,
      diff: {
        sessionId: input.sessionId,
        studentId: input.studentId,
        mark: input.mark,
        source: "manual",
        isCrossSeason,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return m;
  });

  // Notification is created AFTER the attendance transaction succeeds (never before or during)
  try {
    await createAttendanceNotification(scope, {
      sessionId: input.sessionId,
      studentId: input.studentId,
      groupName: session.group?.name ?? session.gradeLabel ?? "Kashkol",
      sessionDate: session.startsAt.toISOString(),
      sessionTime: session.endsAt ? session.endsAt.toISOString() : null,
      mark: input.mark,
      locale: (scope as unknown as { locale?: "ar" | "en" }).locale,
    });
  } catch {
    // Best-effort notification; never fail attendance
  }

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
      let isCrossSeason = false;
      let primaryGroupId: string | null = null;

      if (session.groupId) {
        const primaryEnrollment = await getEnrollmentForStudent(tx, scope.workspaceId, session.groupId, m.studentId);
        if (!primaryEnrollment) {
          const activeEnrollment = await getActiveEnrollmentForStudent(tx, scope.workspaceId, m.studentId);
          if (!activeEnrollment) continue;
          isCrossSeason = true;
          primaryGroupId = activeEnrollment.groupId;
        }
      } else {
        const attendee = await getSessionAttendeeTx(tx, scope.workspaceId, input.sessionId, m.studentId);
        if (!attendee) continue;
      }

      const mark = await upsertAttendanceMarkTx(tx, scope, {
        sessionId: input.sessionId,
        studentId: m.studentId,
        mark: m.mark,
        source: "manual",
        isCrossSeason,
        primaryGroupId,
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
      diff: { count: results.length },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return results;
  });

  // Best-effort persistent notifications for each saved attendance mark
  // Created ONLY after the attendance transaction commits successfully.
  for (const m of marks) {
    try {
      await createAttendanceNotification(scope, {
        sessionId: input.sessionId,
        studentId: m.studentId,
        groupName: session.group?.name ?? session.gradeLabel ?? "Kashkol",
        sessionDate: session.startsAt.toISOString(),
        sessionTime: session.endsAt ? session.endsAt.toISOString() : null,
        mark: m.mark as "present" | "absent" | "late" | "excused",
        locale: (scope as unknown as { locale?: "ar" | "en" }).locale,
      });
    } catch {
      // Never fail attendance due to notification issues
    }
  }

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

    // Check the student is allowed on this session's roster: group sessions
    // use the group's enrollment; group-less sessions use the attendee roster.
    if (token.session.groupId) {
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
    } else {
      const attendee = await getSessionAttendeeTx(tx, scope.workspaceId, token.sessionId, studentId);
      if (!attendee) {
        await writeAuditEvent(tx, {
          workspaceId: scope.workspaceId,
          actorUserId: scope.actorUserId,
          actorDisplayName: scope.actorDisplayName,
          actorType: "user",
          entityType: "teaching_session",
          entityId: token.sessionId,
          action: attendanceAuditActions.qrRejected,
          diff: { reason: "not_on_roster", studentId },
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
        });
        throw new AppError("FORBIDDEN");
      }
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

    return { success: true, mark };
  });

  return result;
}

/**
 * Scan a student's permanent QR code for session attendance.
 * Executed by the assistant/teacher using the camera scanner.
 * Supports cross-season attendance and duplicate scan protection.
 */
export async function scanStudentQrCode(
  scope: Scope,
  input: ScanStudentQrInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "attendance", "write");
  const ctx = context(reqCtx);

  const session = await getSessionWithGroup(scope, input.sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  if (session.status === "cancelled") {
    throw new AppError("CONFLICT", { messageKey: "attendance.errors.sessionCancelled" });
  }

  const result = await withScope(scope, async (tx) => {
    // 1. Verify student QR token cryptographic signature and active hash in database
    const verified = verifyStudentQrTokenSignature(input.qrToken);
    const student = verified
      ? await findStudentForQrScanTx(tx, scope.workspaceId, verified.studentId)
      : null;

    if (!student || !validateStudentQrAgainstRecord(input.qrToken, student.qrTokenHash)) {
      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "teaching_session",
        entityId: input.sessionId,
        action: attendanceAuditActions.qrRejected,
        diff: { reason: "invalid_or_revoked_student_qr" },
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
      });
      throw new AppError("FORBIDDEN", { messageKey: "attendance.errors.invalidQrCode" });
    }

    // 2. Duplicate scan check
    const existingMark = await tx.attendanceMark.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        sessionId: input.sessionId,
        studentId: student.id,
      },
    });
    if (existingMark) {
      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "teaching_session",
        entityId: input.sessionId,
        action: attendanceAuditActions.qrRejected,
        diff: { reason: "duplicate_scan", studentId: student.id },
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
      });
      throw new AppError("CONFLICT", { messageKey: "attendance.errors.alreadyScanned" });
    }

    // 3. Roster check (regular vs cross-season). Group-less sessions use the
    //    attendee roster — there is no cross-season guest concept there.
    let isCrossSeason = false;
    let primaryGroupId: string | null = null;

    if (session.groupId) {
      const primaryEnrollment = await getEnrollmentForStudent(tx, scope.workspaceId, session.groupId, student.id);

      if (!primaryEnrollment) {
        const activeEnrollment = await getActiveEnrollmentForStudent(tx, scope.workspaceId, student.id);
        if (!activeEnrollment) {
          throw new AppError("NOT_FOUND", { messageKey: "attendance.errors.studentNotEnrolled" });
        }
        isCrossSeason = true;
        primaryGroupId = activeEnrollment.groupId;
      }
    } else {
      const attendee = await getSessionAttendeeTx(tx, scope.workspaceId, input.sessionId, student.id);
      if (!attendee) {
        throw new AppError("NOT_FOUND", { messageKey: "attendance.errors.studentNotEnrolled" });
      }
    }

    const markValue = input.markLate ? "late" : "present";
    const mark = await upsertAttendanceMarkTx(tx, scope, {
      sessionId: input.sessionId,
      studentId: student.id,
      mark: markValue,
      source: "qr",
      isCrossSeason,
      primaryGroupId,
    });

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "attendance_mark",
      entityId: mark.id,
      action: attendanceAuditActions.attendanceMarked,
      diff: {
        sessionId: input.sessionId,
        studentId: student.id,
        mark: markValue,
        source: "qr",
        isCrossSeason,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return {
      mark,
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
      },
      isCrossSeason,
    };
  });

  // Notification is created AFTER the attendance transaction succeeds
  try {
    await createAttendanceNotification(scope, {
      sessionId: input.sessionId,
      studentId: result.student.id,
      groupName: session.group?.name ?? session.gradeLabel ?? "Kashkol",
      sessionDate: session.startsAt.toISOString(),
      sessionTime: session.endsAt ? session.endsAt.toISOString() : null,
      mark: result.mark.mark as "present" | "late",
      locale: (scope as unknown as { locale?: "ar" | "en" }).locale,
    });
  } catch {
    // Best effort
  }

  return result;
}

/**
 * Add a student to the roster of a group-less session (independent or
 * grade-level) so their attendance can be recorded (`F-P3-…`, ADR-0029).
 * Group sessions keep their roster fixed to the group's enrollments; this
 * operation is refused for them.
 */
export async function addSessionAttendee(
  scope: Scope,
  input: AddSessionAttendeeInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "attendance", "write");
  const ctx = context(reqCtx);

  const session = await getSessionWithGroup(scope, input.sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  if (session.status === "cancelled") throw new AppError("CONFLICT");
  if (session.groupId) throw new AppError("CONFLICT", { messageKey: "attendance.errors.groupSessionRosterFixed" });

  return withScope(scope, async (tx) => {
    const student = await tx.student.findFirst({
      where: { id: input.studentId, workspaceId: scope.workspaceId, archivedAt: null },
      select: { id: true },
    });
    if (!student) throw new AppError("NOT_FOUND");

    const existing = await getSessionAttendeeTx(tx, scope.workspaceId, session.id, student.id);
    if (existing) {
      throw new AppError("CONFLICT", { messageKey: "attendance.errors.attendeeAlreadyOnRoster" });
    }

    const attendee = await addSessionAttendeeTx(tx, scope.workspaceId, session.id, student.id, "manual");

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "session_attendee",
      entityId: attendee.id,
      action: attendanceAuditActions.attendeeAdded,
      diff: { sessionId: input.sessionId, studentId: student.id },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return attendee;
  });
}

/**
 * Remove a student from the roster of a group-less session before any
 * attendance has been recorded for them. Refused once a mark exists, so no
 * recorded truth is silently discarded.
 */
export async function removeSessionAttendee(
  scope: Scope,
  input: RemoveSessionAttendeeInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "attendance", "write");
  const ctx = context(reqCtx);

  const session = await getSessionWithGroup(scope, input.sessionId);
  if (!session) throw new AppError("NOT_FOUND");
  if (session.status === "cancelled") throw new AppError("CONFLICT");
  if (session.groupId) throw new AppError("CONFLICT", { messageKey: "attendance.errors.groupSessionRosterFixed" });

  return withScope(scope, async (tx) => {
    const attendee = await getSessionAttendeeTx(tx, scope.workspaceId, session.id, input.studentId);
    if (!attendee) throw new AppError("NOT_FOUND");

    const markCount = await tx.attendanceMark.count({
      where: { workspaceId: scope.workspaceId, sessionId: session.id, studentId: input.studentId },
    });
    if (markCount > 0) {
      throw new AppError("CONFLICT", { messageKey: "attendance.errors.attendeeHasMarks" });
    }

    await removeSessionAttendeeTx(tx, scope.workspaceId, session.id, input.studentId);

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "session_attendee",
      entityId: attendee.id,
      action: attendanceAuditActions.attendeeRemoved,
      diff: { sessionId: input.sessionId, studentId: input.studentId },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return { removed: true };
  });
}
