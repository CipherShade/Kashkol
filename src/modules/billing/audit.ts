import type { DbTransactionClient } from "@/lib/db/scope";
import { newUuidV7 } from "@/lib/id";
import { writeAuditEvent } from "@/modules/audit/service";
import { redactDiff } from "@/modules/audit/redact";

export const BILLING_AUDIT_ACTIONS = {
  configUpdated: "billing.config.updated",
  exemptionCreated: "billing.exemption.created",
  exemptionUpdated: "billing.exemption.updated",
  exemptionRevoked: "billing.exemption.revoked",
  exemptionExpired: "billing.exemption.expired",
  activationCreated: "billing.activation.created",
  usageComputed: "billing.usage.computed",
  invoiceIssued: "billing.invoice.issued",
  submissionCreated: "billing.submission.created",
  submissionReviewed: "billing.submission.reviewed",
  evidenceUploaded: "billing.evidence.uploaded",
  evidenceViewed: "billing.evidence.viewed",
  adjustmentCreated: "billing.adjustment.created",
  exemptionReversalCreated: "billing.exemption.reversal.created",
  invoiceCreditCreated: "billing.invoice.credit.created",
  referenceReleased: "billing.reference.released",
} as const;

type BaseAuditInput = {
  workspaceId?: string | null;
  actorUserId: string | null;
  actorDisplayName: string;
  entityType: string;
  entityId: string;
  action: string;
  diff?: unknown;
  /** Stable, coded reason. Free-text notes are never copied to the audit trail. */
  reasonCode?: string;
  requestId: string;
  ipHash?: string | null;
  now: Date;
};

/** Write both audit trails in the caller's transaction, never after it. */
export async function writeBillingAuditTx(
  tx: DbTransactionClient,
  input: BaseAuditInput,
): Promise<string | null> {
  if (input.workspaceId) {
    await writeAuditEvent(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      actorDisplayName: input.actorDisplayName,
      actorType: "platform_admin",
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      diff: input.diff,
      requestId: input.requestId,
      ipHash: input.ipHash ?? null,
    });
  }

  const id = newUuidV7();
  await tx.platformAuditEvent.create({
    data: {
      id,
      actorUserId: input.actorUserId,
      actorDisplayName: input.actorDisplayName,
      targetWorkspaceId: input.workspaceId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      reason: input.reasonCode ?? "billing_audit",
      diff: (input.diff === undefined ? null : redactDiff(input.diff)) as never,
      requestId: input.requestId,
      ipHash: input.ipHash ?? null,
      createdAt: input.now,
    },
  });
  return id;
}

/** Tenant-only audit for teacher actions. The actor is never a platform admin. */
export async function writeBillingTenantAuditTx(
  tx: DbTransactionClient,
  input: Omit<BaseAuditInput, "workspaceId" | "reasonCode"> & { workspaceId: string },
): Promise<void> {
  await writeAuditEvent(tx, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    actorDisplayName: input.actorDisplayName,
    actorType: "user",
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    diff: input.diff,
    requestId: input.requestId,
    ipHash: input.ipHash ?? null,
  });
}
