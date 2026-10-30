import type { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";

/** The transaction type, re-exported so services never import Prisma itself. */
export type AuditTransaction = Prisma.TransactionClient;

export type AuditRecord = {
  workspaceId: string;
  actorUserId: string | null;
  actorDisplayName: string;
  actorType: "user" | "system" | "platform_admin";
  entityType: string;
  entityId: string;
  action: string;
  requestId: string;
  ipHash: string | null;
  diff?: unknown;
};

/**
 * The only write path for `audit_event` (ADR-0014).
 *
 * The caller passes the *transaction client* of the mutation it is recording,
 * so the event commits or rolls back with the change. There is no update and no
 * delete export, and the migration revokes UPDATE/DELETE from the app role.
 */
export async function insertAuditEvent(tx: AuditTransaction, data: AuditRecord): Promise<void> {
  await tx.auditEvent.create({
    data: {
      workspaceId: data.workspaceId,
      actorUserId: data.actorUserId,
      actorDisplayName: data.actorDisplayName,
      actorType: data.actorType,
      entityType: data.entityType,
      entityId: data.entityId,
      action: data.action,
      requestId: data.requestId,
      ipHash: data.ipHash,
      ...(data.diff === undefined ? {} : { diff: data.diff as Prisma.InputJsonValue }),
    },
  });
}

export async function listAuditEventsForWorkspace(scope: { workspaceId: string }) {
  return withScope(scope, (tx) =>
    tx.auditEvent.findMany({
      where: { workspaceId: scope.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        actorDisplayName: true,
        actorType: true,
        entityType: true,
        entityId: true,
        action: true,
        createdAt: true,
        requestId: true,
      },
    }),
  );
}
