import crypto from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";

export async function createInAppNotificationTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  data: {
    studentId: string;
    guardianId?: string | null;
    type: "attendance_present" | "attendance_absent" | "attendance_late" | "attendance_excused";
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
  },
) {
  // Idempotency: prevent duplicate notifications for the same attendance event
  if (data.idempotencyKey) {
    const all = await tx.notification.findMany({
      where: { workspaceId, studentId: data.studentId },
      select: { metadata: true, createdAt: true },
      take: 10,
    });
    const existing = all.find((n) => {
      try {
        const meta = n.metadata as { idempotencyKey?: string } | null;
        return meta?.idempotencyKey === data.idempotencyKey;
      } catch {
        return false;
      }
    });
    if (existing) return existing;
  }

  return tx.notification.create({
    data: {
      id: crypto.randomUUID(),
      workspaceId,
      studentId: data.studentId,
      guardianId: data.guardianId || null,
      type: data.type,
      title: data.title,
      body: data.body,
      isRead: false,
      entityType: data.entityType ?? null,
      entityId: data.entityId ?? null,
      metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });
}

export async function listNotificationsForGuardian(
  scope: Scope,
  studentId?: string,
) {
  return withScope(scope, async (tx) => {
    // Find all authorized guardians in this workspace to enforce student-level authorization
    const guardians = await tx.guardian.findMany({
      where: {
        workspaceId: scope.workspaceId,
        isAuthorized: true,
        optOut: false,
      },
      select: { id: true, studentId: true },
    });
    const guardianIds = guardians.map((g) => g.id);
    const allowedStudentIds = new Set(guardians.map((g) => g.studentId));

    // Only retrieve notifications linked to authorized guardians for allowed students
    const notifications = await tx.notification.findMany({
      where: {
        workspaceId: scope.workspaceId,
        guardianId: { in: guardianIds.length ? guardianIds : ["no-match"] },
        studentId: studentId ? studentId : { in: Array.from(allowedStudentIds) },
      },
      include: {
        student: { select: { firstName: true, lastName: true } },
        guardian: { select: { firstName: true, lastName: true, relation: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 50,
    });

    // Final filter: notification student must belong to an authorized guardian (cross-parent protection)
    return notifications.filter((n) => allowedStudentIds.has(n.studentId));
  });
}

export async function markNotificationReadTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  notificationId: string,
) {
  return tx.notification.update({
    where: { workspaceId, id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });
}
