import crypto from "node:crypto";
import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import {
  findActiveQrTokenByHash,
  getEnrollmentForStudent,
  getSessionAttendeeTx,
  upsertAttendanceMarkTx,
  type AttendanceActor,
} from "./repository";
import { attendanceAuditActions } from "./audit";
import { enqueueAttendanceNotificationForSelfCheckIn } from "@/modules/messaging";
import { createAttendanceNotification } from "@/modules/notifications";
import type { Scope } from "@/modules/tenancy/types";

export type SelfCheckInActor = {
  /** The verified portal user (resolved server-side, never from the request). */
  userId: string;
  /** The verified portal grant's workspace and the student it links. */
  workspaceId: string;
  studentId: string;
  displayName: string;
};

export type SelfCheckInResult = {
  mark: "present";
  sessionId: string;
  sessionStatus: string;
};

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Student-portal self check-in against a displayed session QR (`F-P2-05`, the
 * `OQ-05` default (a): the teacher displays a short-lived rotating code and the
 * enrolled student scans it with their own phone).
 *
 * Authorisation rests on the verified portal grant the caller passes in —
 * not on any client-supplied workspace or student id. The scan marks the
 * student **present only**; absences, excusals, and manual late markings
 * remain teacher actions (`F-P2-05` AC-6). Every rejected scan is audited so
 * the teacher can review it.
 */
export async function checkInWithQrToken(
  actor: SelfCheckInActor,
  input: { token: string; requestId?: string },
): Promise<SelfCheckInResult> {
  const tokenHash = hashToken(input.token);
  const reqId = input.requestId ?? newRequestId();

  const result = await withScope({ workspaceId: actor.workspaceId }, async (tx) => {
    const found = await findActiveQrTokenByHash(tx, actor.workspaceId, tokenHash);
    if (!found || found.session.workspaceId !== actor.workspaceId) {
      await writeAuditEvent(tx, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorType: "user",
        entityType: "teaching_session",
        entityId: "unknown",
        action: attendanceAuditActions.qrRejected,
        diff: { reason: "invalid_or_expired_token", source: "portal_checkin" },
        requestId: reqId,
      });
      throw new AppError("FORBIDDEN");
    }

    const { session } = found;

    if (session.status === "cancelled") {
      await writeAuditEvent(tx, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorType: "user",
        entityType: "teaching_session",
        entityId: session.id,
        action: attendanceAuditActions.qrRejected,
        diff: { reason: `session_${session.status}`, source: "portal_checkin", studentId: actor.studentId },
        requestId: reqId,
      });
      throw new AppError("CONFLICT");
    }

    // The student must be on the session's roster: group sessions use the
    // group's enrollment; group-less sessions use the attendee roster.
    let onRoster = false;
    if (session.groupId) {
      const enrollment = await getEnrollmentForStudent(
        tx,
        actor.workspaceId,
        session.groupId,
        actor.studentId,
      );
      onRoster = Boolean(enrollment);
    } else {
      const attendee = await getSessionAttendeeTx(tx, actor.workspaceId, session.id, actor.studentId);
      onRoster = Boolean(attendee);
    }
    if (!onRoster) {
      await writeAuditEvent(tx, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorType: "user",
        entityType: "teaching_session",
        entityId: session.id,
        action: attendanceAuditActions.qrRejected,
        diff: { reason: "not_enrolled", source: "portal_checkin", studentId: actor.studentId },
        requestId: reqId,
      });
      throw new AppError("FORBIDDEN");
    }

    const existing = await tx.attendanceMark.findFirst({
      where: { workspaceId: actor.workspaceId, sessionId: session.id, studentId: actor.studentId },
    });
    if (existing) {
      await writeAuditEvent(tx, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorType: "user",
        entityType: "teaching_session",
        entityId: session.id,
        action: attendanceAuditActions.qrRejected,
        diff: { reason: "already_checked_in", source: "portal_checkin", studentId: actor.studentId },
        requestId: reqId,
      });
      throw new AppError("CONFLICT");
    }

    const actorContext: AttendanceActor = {
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
    };

    const mark = await upsertAttendanceMarkTx(tx, actorContext, {
      sessionId: session.id,
      studentId: actor.studentId,
      mark: "present",
      source: "qr",
    });

    await writeAuditEvent(tx, {
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      actorType: "user",
      entityType: "attendance_mark",
      entityId: mark.id,
      action: attendanceAuditActions.attendanceMarked,
      diff: { sessionId: session.id, studentId: actor.studentId, mark: "present", source: "qr" },
      requestId: reqId,
    });

    return {
      sessionId: session.id,
      sessionStatus: session.status,
      groupName: session.group?.name ?? session.gradeLabel ?? "Kashkol",
      sessionDate: session.startsAt ? session.startsAt.toISOString() : new Date().toISOString(),
      sessionTime: session.endsAt ? session.endsAt.toISOString() : null,
    };
  });

  // The guardian notification is a system event written after the attendance
  // transaction; its failure must not affect the attendance record.
  // 1. In-app notification + Web Push dispatch (Fix 2 & 3)
  try {
    const notifyScope: Scope = {
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      role: "owner",
      permissions: new Set(),
    };
    await createAttendanceNotification(notifyScope, {
      sessionId: result.sessionId,
      studentId: actor.studentId,
      groupName: result.groupName,
      sessionDate: result.sessionDate,
      sessionTime: result.sessionTime,
      mark: "present",
    });
  } catch {
    // best-effort: in-app notification failure must not affect attendance
  }

  // 2. Outbox enqueue (for message logs / outbox drain)
  try {
    await enqueueAttendanceNotificationForSelfCheckIn(
      { workspaceId: actor.workspaceId, userId: actor.userId, displayName: actor.displayName },
      { studentId: actor.studentId, sessionId: result.sessionId, mark: "present" },
      { requestId: newRequestId() },
    );
  } catch {
    // best-effort: outbox event failure must not affect attendance
  }

  return { mark: "present", sessionId: result.sessionId, sessionStatus: result.sessionStatus };
}

