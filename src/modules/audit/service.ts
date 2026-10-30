import { authorize, type Scope } from "@/modules/tenancy/types";
import { redactDiff } from "./redact";
import {
  insertAuditEvent,
  listAuditEventsForWorkspace,
  type AuditTransaction,
} from "./repository";

export type AuditActorType = "user" | "system" | "platform_admin";

export type AuditInput = {
  workspaceId: string;
  actorUserId: string | null;
  /** A snapshot: a later rename must not rewrite history. */
  actorDisplayName: string;
  actorType: AuditActorType;
  entityType: string;
  entityId: string;
  action: string;
  diff?: unknown;
  requestId: string;
  ipHash?: string | null;
};

/**
 * Write an audit event inside the caller's tenant transaction.
 *
 * `diff` is passed through the redactor first, so a service cannot accidentally
 * persist a password, a token, a note body, an email address, or a phone number.
 */
export async function writeAuditEvent(tx: AuditTransaction, input: AuditInput): Promise<void> {
  const redacted = input.diff === undefined ? undefined : redactDiff(input.diff);
  await insertAuditEvent(tx, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    actorDisplayName: input.actorDisplayName.slice(0, 120),
    actorType: input.actorType,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    requestId: input.requestId,
    ipHash: input.ipHash ?? null,
    ...(redacted === undefined ? {} : { diff: redacted }),
  });
}

/**
 * The read side of the audit log. `audit:read` is required and only the
 * columns a reviewer needs are returned: the stored diff never leaves the
 * server through this surface, so a redaction bug cannot become a data leak.
 */
export async function listAuditEvents(scope: Scope) {
  authorize(scope, "audit", "read");
  return listAuditEventsForWorkspace(scope);
}
