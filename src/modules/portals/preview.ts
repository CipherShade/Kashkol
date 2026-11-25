import { withScope } from "@/lib/db/scope";
import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { writeAuditEvent } from "@/modules/audit/service";
import {
  findPortalStudentProjection,
  type PortalGrantRow,
} from "@/modules/identity/repository";
import type { PortalContext } from "@/modules/identity/session";
import { authorize, type Scope } from "@/modules/tenancy/types";
import { getParentPortalOverview } from "./service";

export type PortalPreviewRequestContext = {
  requestId?: string;
  ipHash?: string | null;
};

/**
 * F-P2-09 / F17: render the real parent portal for one student without creating
 * a parent account, sending a message, or establishing a parent session.
 *
 * The projection is produced by `getParentPortalOverview` with an in-memory
 * grant built from the teacher's scope. If a real active parent grant exists,
 * its stored visibility permissions are reused; otherwise the portal defaults
 * are used. Nothing is persisted except the audit event.
 */
export async function previewParentPortalForStudent(
  scope: Scope,
  studentId: string,
  reqCtx?: PortalPreviewRequestContext,
  now: Date = new Date(),
) {
  // The preview exposes the same child projection as the parent portal, so it
  // needs the same two permissions before any data is read.
  authorize(scope, "students", "read");
  authorize(scope, "portal_access", "read");

  const student = await findPortalStudentProjection(scope.workspaceId, studentId);
  if (!student) throw new AppError("NOT_FOUND");

  const storedGrant = await withScope(scope, (tx) =>
    tx.portalGrant.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        studentId,
        kind: "parent",
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true, guardianId: true, permissions: true },
    }),
  );

  const grant: PortalGrantRow = {
    id: storedGrant?.id,
    workspaceId: scope.workspaceId,
    studentId,
    guardianId: storedGrant?.guardianId ?? null,
    kind: "parent",
    permissions: storedGrant?.permissions ?? null,
    expiresAt: null,
  };

  const portal: PortalContext = {
    userId: scope.actorUserId,
    grants: [grant],
    workspaceIds: [scope.workspaceId],
    studentIds: new Set([studentId]),
  };

  const overview = await getParentPortalOverview(portal, studentId, now);

  const ctx = {
    requestId: reqCtx?.requestId ?? newRequestId(),
    ipHash: reqCtx?.ipHash ?? null,
  };
  await withScope(scope, (tx) =>
    writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "student",
      entityId: studentId,
      action: "portal.previewed",
      diff: {
        kind: "parent",
        source: storedGrant ? "active_grant" : "default_permissions",
      },
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    }),
  );

  return overview;
}
