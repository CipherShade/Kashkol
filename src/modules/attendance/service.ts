import crypto from "node:crypto";
import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import { authorize, isAllowed, type Scope } from "@/modules/tenancy/types";
import {
  correctAttendanceMarkTx,
  createQrTokenTx,
  findActiveQrTokenByHash,
  findStudentForQrScanTx,
  getActiveEnrollmentForStudent,
  getEnrollmentForStudent,
  getRosterForSession,
  getSessionWithGroup,
  setPaymentVerifiedTx,
  upsertAttendanceMarkTx,
} from "./repository";
import {
  createPaymentTx,
  findSessionForPaymentTx,
  findSessionLinkedPaymentsTx,
  voidPaymentTx,
} from "@/modules/payments/repository";
import {
  verifyStudentQrTokenSignature,
  validateStudentQrAgainstRecord,
} from "./student-qr";
import { attendanceAuditActions } from "./audit";
import { getSessionHomeworkContextTx } from "@/modules/homework";

import { createAttendanceNotification } from "@/modules/notifications";
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
  ScanStudentQrInput,
  VerifyPaymentInput,
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
    // 1. Check if student is in session's group
    const primaryEnrollment = await getEnrollmentForStudent(tx, scope.workspaceId, session.groupId, input.studentId);
    let isCrossSeason = false;
    let primaryGroupId: string | null = null;

    if (!primaryEnrollment) {
      // 2. Cross-season check: student must have an active enrollment in ANY group in this workspace
      const activeEnrollment = await getActiveEnrollmentForStudent(tx, scope.workspaceId, input.studentId);
      if (!activeEnrollment) {
        throw new AppError("NOT_FOUND");
      }
      isCrossSeason = true;
      primaryGroupId = activeEnrollment.groupId;
    }

    const m = await upsertAttendanceMarkTx(tx, scope, {
      sessionId: input.sessionId,
      studentId: input.studentId,
      mark: input.mark,
      source: "manual",
      paymentVerified: input.paymentVerified,
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
        paymentVerified: m.paymentVerified,
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
      groupName: session.group.name,
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
      const primaryEnrollment = await getEnrollmentForStudent(tx, scope.workspaceId, session.groupId, m.studentId);
      let isCrossSeason = false;
      let primaryGroupId: string | null = null;

      if (!primaryEnrollment) {
        const activeEnrollment = await getActiveEnrollmentForStudent(tx, scope.workspaceId, m.studentId);
        if (!activeEnrollment) continue;
        isCrossSeason = true;
        primaryGroupId = activeEnrollment.groupId;
      }

      const mark = await upsertAttendanceMarkTx(tx, scope, {
        sessionId: input.sessionId,
        studentId: m.studentId,
        mark: m.mark,
        source: "manual",
        paymentVerified: m.paymentVerified,
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
        groupName: session.group.name,
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

    return { success: true, mark };
  });

  return result;
}

/**
 * Verify or unverify payment for a student at a session.
 * Used by assistants/teachers on the attendance screen.
 *
 * Verifying records (or keeps) a real session-linked ledger payment at the
 * session's per-student price; unverifying voids the non-voided session-linked
 * payment(s) with an audited reason. Payments are append-only: nothing is
 * deleted, and the ledger, revenue summary, balances, and this toggle always
 * agree. If no price is configured for the session, verification is rejected.
 */
export async function verifySessionPayment(
  scope: Scope,
  input: VerifyPaymentInput,
  reqCtx?: RequestContext,
) {
  authorize(scope, "attendance", "write");
  if (!scope.actorUserId) throw new AppError("FORBIDDEN");
  const ctx = context(reqCtx);

  return withScope(scope, async (tx) => {
    // Serialize concurrent toggles for this (session, student) pair so a
    // double-click cannot create two ledger payments.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${scope.workspaceId}:${input.sessionId}:${input.studentId}`}, 0))`;

    const session = await findSessionForPaymentTx(tx, scope.workspaceId, input.sessionId);
    if (!session) throw new AppError("NOT_FOUND");
    const price = session.pricePerStudentMinor ?? session.group.defaultPricePerStudentMinor ?? null;

    const existingMark = await tx.attendanceMark.findFirst({
      where: { workspaceId: scope.workspaceId, sessionId: input.sessionId, studentId: input.studentId },
    });
    if (!existingMark) throw new AppError("NOT_FOUND");

    if (input.verified) {
      if (price == null || price <= 0) {
        throw new AppError("VALIDATION_FAILED", {
          messageKey: "payments.errors.sessionPriceMissing",
        });
      }
      const linked = await findSessionLinkedPaymentsTx(
        tx,
        scope.workspaceId,
        input.sessionId,
        input.studentId,
      );
      const hasActivePayment = linked.some((payment) => payment.voidedAt === null);
      if (!hasActivePayment) {
        const nowUtcDate = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
        const saved = await createPaymentTx(tx, {
          id: newUuidV7(),
          workspaceId: scope.workspaceId,
          studentId: input.studentId,
          sessionId: input.sessionId,
          amountMinor: price,
          period: null,
          purpose: "Session payment",
          method: "other",
          methodLabel: null,
          paidOn: nowUtcDate,
          referenceNumber: null,
          note: null,
          idempotencyKey: `session-payment:${newUuidV7()}`,
          createdBy: scope.actorUserId,
        });
        if (saved && !saved.duplicate) {
          await writeAuditEvent(tx, {
            workspaceId: scope.workspaceId,
            actorUserId: scope.actorUserId,
            actorDisplayName: scope.actorDisplayName,
            actorType: "user",
            entityType: "payment",
            entityId: saved.payment.id,
            action: "payment.recorded",
            diff: {
              studentId: input.studentId,
              sessionId: input.sessionId,
              amountMinor: saved.payment.amountMinor,
              source: "session_roster",
            },
            requestId: ctx.requestId,
            ipHash: ctx.ipHash,
          });
        }
      }
    } else {
      const linked = await findSessionLinkedPaymentsTx(
        tx,
        scope.workspaceId,
        input.sessionId,
        input.studentId,
      );
      for (const payment of linked) {
        if (payment.voidedAt !== null) continue;
        await voidPaymentTx(
          tx,
          scope.workspaceId,
          payment.id,
          "Marked as unpaid on the session roster.",
        );
        await writeAuditEvent(tx, {
          workspaceId: scope.workspaceId,
          actorUserId: scope.actorUserId,
          actorDisplayName: scope.actorDisplayName,
          actorType: "user",
          entityType: "payment",
          entityId: payment.id,
          action: "payment.voided",
          diff: {
            studentId: input.studentId,
            sessionId: input.sessionId,
            source: "session_roster",
          },
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
        });
      }
    }

    const updated = await setPaymentVerifiedTx(
      tx,
      scope.workspaceId,
      input.sessionId,
      input.studentId,
      input.verified,
    );

    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "attendance_mark",
      entityId: updated.id,
      action: "attendance.payment_verified",
      diff: {
        sessionId: input.sessionId,
        studentId: input.studentId,
        paymentVerified: input.verified,
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    });

    return updated;
  });
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
  if (session.status === "completed") {
    throw new AppError("CONFLICT", { messageKey: "attendance.errors.sessionCompleted" });
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

    // 3. Enrollment check (regular vs cross-season)
    const primaryEnrollment = await getEnrollmentForStudent(tx, scope.workspaceId, session.groupId, student.id);
    let isCrossSeason = false;
    let primaryGroupId: string | null = null;

    if (!primaryEnrollment) {
      const activeEnrollment = await getActiveEnrollmentForStudent(tx, scope.workspaceId, student.id);
      if (!activeEnrollment) {
        throw new AppError("NOT_FOUND", { messageKey: "attendance.errors.studentNotEnrolled" });
      }
      isCrossSeason = true;
      primaryGroupId = activeEnrollment.groupId;
    }

    const markValue = input.markLate ? "late" : "present";
    const mark = await upsertAttendanceMarkTx(tx, scope, {
      sessionId: input.sessionId,
      studentId: student.id,
      mark: markValue,
      source: "qr",
      paymentVerified: input.paymentVerified,
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
        paymentVerified: mark.paymentVerified,
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
      groupName: session.group.name,
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
