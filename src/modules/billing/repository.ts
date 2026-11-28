import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db/client";
import {
  withPlatformAdminScope,
  withScope,
  type DbTransactionClient,
} from "@/lib/db/scope";
import { AppError } from "@/lib/http/errors";
import { newUuidV7 } from "@/lib/id";
import { createNotificationTx } from "@/modules/notifications/repository";
import { listActiveWorkspaceIdsForWorker } from "@/modules/tenancy/repository";
import {
  BILLING_AUDIT_ACTIONS,
  writeBillingAuditTx,
  writeBillingTenantAuditTx,
} from "./audit";
import {
  exemptionCoversMonth,
  exemptionPeriodFromRow,
  exemptionsOverlap,
  isForwardOnlyExemptionExpiration,
  resolveExemptionStatus,
} from "./exemption";
import {
  computeChargeMinor,
  computeQualifyingStudents,
  qualificationLookupRange,
  type BillingAttendanceRow,
} from "./qualification";
import { normalizeTransactionReference, transactionReferenceFingerprint } from "./reference";
import { isSafeBillingUrl } from "./schemas";
import type {
  BillingAuditReasonCode,
  BillingConfigUpdateInput,
  CreateBillingExemptionInput,
  CreateBillingAdjustmentInput,
  CreateBillingSubmissionInput,
  ReleaseBillingReferenceInput,
  ReviewBillingSubmissionInput,
  UpdateBillingExemptionInput,
} from "./schemas";
import {
  addCairoMonths,
  cairoDateFromDate,
  cairoMonthFromDate,
  cairoMonthRange,
} from "./time";

const BILLING_WORKER_ACTOR = "system:billing-worker";
const BILLING_WORKER_NAME = "Billing worker";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Exported so the service can map a racing insert outside the failed transaction. */
export function isBillingUniqueViolation(error: unknown): boolean {
  return isUniqueViolation(error);
}

function projectConfig(
  row: {
    id: string;
    version: number;
    rateMinor: number;
    minimumInvoiceMinor: number;
    currency: string;
    billingTimezone: string;
    instapayHandle: string;
    instapayLink: string;
    qrStorageKey: string | null;
    effectiveAt: Date;
    createdAt: Date;
  },
  latestVersion = row.version,
) {
  return {
    id: row.id,
    version: row.version,
    rateMinor: row.rateMinor,
    thresholdMinor: row.minimumInvoiceMinor,
    currency: row.currency,
    timezone: row.billingTimezone,
    instapayHandle: row.instapayHandle,
    // Validate again at read time: an older or repaired row must never become
    // a clickable non-network URL in the teacher console.
    instapayLink: row.instapayLink && isSafeBillingUrl(row.instapayLink) ? row.instapayLink : "",
    qrStorageKey: row.qrStorageKey,
    // The append-only table stores history; the highest version is authoritative.
    isActive: row.version === latestVersion,
    effectiveAt: row.effectiveAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export type BillingConfigView = ReturnType<typeof projectConfig>;

export async function getActiveBillingConfig(): Promise<BillingConfigView> {
  const row = await getDb().billingConfig.findFirst({
    orderBy: [{ version: "desc" }],
  });
  if (!row) throw new Error("No active billing configuration");
  return projectConfig(row, row.version);
}

export async function listBillingConfigVersions(limit = 25): Promise<BillingConfigView[]> {
  const rows = await getDb().billingConfig.findMany({
    orderBy: [{ version: "desc" }],
    take: limit,
  });
  const latestVersion = rows[0]?.version ?? 0;
  return rows.map((row) => projectConfig(row, latestVersion));
}

/**
 * A logical config change has one server-derived key. A retry after an
 * ambiguous outcome returns the same immutable version instead of appending a
 * duplicate, while different content still creates a new version.
 */
function billingConfigIdempotencyKey(input: BillingConfigUpdateInput): string {
  const payload = JSON.stringify([
    input.thresholdMinor,
    input.instapayHandle.trim(),
    input.instapayLink.trim(),
    input.qrStorageKey?.trim() ?? "",
    input.reasonCode,
  ]);
  return `config:${createHash("sha256").update(payload).digest("hex")}`;
}

/**
 * Config versions are append-only. A new admin change adds a version instead
 * of rewriting the old one, so an invoice can always name the rule it used.
 */
export async function appendBillingConfigVersionTx(
  tx: DbTransactionClient,
  input: BillingConfigUpdateInput,
  createdBy: string,
  now: Date,
) {
  const idempotencyKey = billingConfigIdempotencyKey(input);
  const prior = await tx.billingConfigIdempotency.findUnique({
    where: { key: idempotencyKey },
    select: { config: true },
  });
  if (prior) return { config: prior.config, created: false };

  const latest = await tx.billingConfig.findFirst({ orderBy: [{ version: "desc" }] });
  // Versions are append-only. The highest version is authoritative; older rows
  // stay immutable and keep the isActive value they were created with.
  const config = await tx.billingConfig.create({
    data: {
      version: (latest?.version ?? 0) + 1,
      rateMinor: 99,
      minimumInvoiceMinor: input.thresholdMinor,
      currency: "EGP",
      billingTimezone: "Africa/Cairo",
      instapayHandle: input.instapayHandle,
      instapayLink: input.instapayLink,
      qrStorageKey: input.qrStorageKey ?? null,
      isActive: true,
      effectiveAt: now,
      createdBy,
      createdAt: now,
    },
  });
  await tx.billingConfigIdempotency.create({
    data: { key: idempotencyKey, configId: config.id, createdAt: now },
  });
  return { config, created: true };
}

export async function appendBillingConfigVersion(
  input: BillingConfigUpdateInput,
  createdBy: string,
  now: Date,
  requestId: string,
) {
  await assertActivePlatformAdmin(createdBy);
  return getDb().$transaction(async (tx) => {
    await assertActivePlatformAdminTx(tx, createdBy);
    const { config: created, created: appended } = await appendBillingConfigVersionTx(
      tx,
      input,
      createdBy,
      now,
    );
    if (!appended) return projectConfig(created);
    await writeBillingAuditTx(tx, {
      actorUserId: createdBy,
      actorDisplayName: "Platform administrator",
      entityType: "billing_config",
      entityId: created.id,
      action: BILLING_AUDIT_ACTIONS.configUpdated,
      diff: {
        version: created.version,
        thresholdMinor: created.minimumInvoiceMinor,
        instapayConfigured: created.instapayHandle.length > 0,
      },
      reasonCode: auditReason(input.reasonCode),
      requestId,
      now,
    });
    return projectConfig(created);
  });
}

// --- Workspace activation ---------------------------------------------------

export async function getWorkspaceBillingStateTx(tx: DbTransactionClient, workspaceId: string) {
  return tx.workspaceBillingState.findUnique({ where: { workspaceId } });
}

export async function ensureWorkspaceBillingActivationTx(
  tx: DbTransactionClient,
  params: { workspaceId: string; activationMonth: string; now: Date; activatedBy: string },
) {
  const existing = await getWorkspaceBillingStateTx(tx, params.workspaceId);
  if (existing) return existing;
  // A racing insert fails the whole transaction; the caller retries the scoped
  // cycle. Never query again after a failed statement inside one transaction.
  const created = await tx.workspaceBillingState.create({
    data: {
      workspaceId: params.workspaceId,
      activationMonth: params.activationMonth,
      activatedAt: params.now,
      activatedBy: params.activatedBy,
      createdAt: params.now,
    },
  });
  await writeBillingTenantAuditTx(tx, {
    workspaceId: params.workspaceId,
    actorUserId: params.activatedBy === BILLING_WORKER_ACTOR ? null : params.activatedBy,
    actorDisplayName: BILLING_WORKER_NAME,
    entityType: "workspace_billing_state",
    entityId: params.workspaceId,
    action: BILLING_AUDIT_ACTIONS.activationCreated,
    diff: { activationMonth: params.activationMonth },
    requestId: "billing-worker",
    now: params.now,
  });
  return created;
}

export async function findOwnerUserIdTx(tx: DbTransactionClient, workspaceId: string) {
  const member = await tx.workspaceMember.findFirst({
    where: { workspaceId, role: "owner", status: "active" },
    select: { userId: true },
  });
  return member?.userId ?? null;
}

// --- Exemptions -------------------------------------------------------------

export type BillingExemptionView = {
  id: string;
  workspaceId: string;
  reason: string;
  notes: string | null;
  startDate: string;
  expiresOn: string | null;
  status: string;
  revokedOn: string | null;
  createdByAdminId: string;
  modifiedByAdminId: string;
  createdAt: string;
  updatedAt: string;
};

function projectExemption(row: {
  id: string;
  workspaceId: string;
  reason: string;
  notes: string | null;
  startDate: string;
  expiresOn: string | null;
  status: string;
  revokedOn?: Date | null;
  createdByAdminId: string;
  modifiedByAdminId: string;
  createdAt: Date;
  updatedAt: Date;
}): BillingExemptionView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    reason: row.reason,
    // Internal notes are never sent to a client projection.
    notes: null,
    startDate: row.startDate,
    expiresOn: row.expiresOn,
    status: row.status,
    revokedOn: row.revokedOn?.toISOString() ?? null,
    createdByAdminId: row.createdByAdminId,
    modifiedByAdminId: row.modifiedByAdminId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function syncExemptionStatusesTx(
  tx: DbTransactionClient,
  workspaceId: string,
  now: Date,
): Promise<void> {
  const today = cairoDateFromDate(now);
  const rows = await tx.billingExemption.findMany({
    where: { workspaceId, status: { in: ["scheduled", "active"] } },
  });
  for (const row of rows) {
    const next = resolveExemptionStatus(exemptionPeriodFromRow(row), today);
    if (next === row.status) continue;
    await tx.billingExemption.update({
      where: { id: row.id },
      data: { status: next, updatedAt: now },
    });
    await writeBillingAuditTx(tx, {
      workspaceId,
      actorUserId: null,
      actorDisplayName: BILLING_WORKER_NAME,
      entityType: "billing_exemption",
      entityId: row.id,
      action:
        next === "expired"
          ? BILLING_AUDIT_ACTIONS.exemptionExpired
          : BILLING_AUDIT_ACTIONS.exemptionUpdated,
      diff: { status: next, startDate: row.startDate, expiresOn: row.expiresOn },
      reasonCode: "automatic_lifecycle",
      requestId: "billing-worker",
      ipHash: null,
      now,
    });
  }
}

export async function findActiveExemptionForMonthTx(
  tx: DbTransactionClient,
  workspaceId: string,
  month: string,
  now: Date,
) {
  await syncExemptionStatusesTx(tx, workspaceId, now);
  // Coverage is date-based, not status-based. Expired and revoked rows still
  // cover the months their dates specify, so a delayed cycle cannot bill a
  // month that was exempt when it ended or was revoked.
  const rows = await tx.billingExemption.findMany({
    where: { workspaceId },
    orderBy: [{ startDate: "desc" }],
  });
  return rows.find((row) => exemptionCoversMonth(exemptionPeriodFromRow(row), month)) ?? null;
}

export async function listExemptionsForWorkspaceTx(
  tx: DbTransactionClient,
  workspaceId: string,
  now: Date,
): Promise<BillingExemptionView[]> {
  await syncExemptionStatusesTx(tx, workspaceId, now);
  const rows = await tx.billingExemption.findMany({
    where: { workspaceId },
    orderBy: [{ startDate: "desc" }],
  });
  return rows.map(projectExemption);
}

function cairoMonthsBetween(startDate: string, endDate: string): string[] {
  const months: string[] = [];
  let cursor = startDate.slice(0, 7);
  const last = endDate.slice(0, 7);
  while (cursor <= last) {
    if (months.length >= 120) {
      throw new AppError("CONFLICT", { messageKey: "errors.billingCycleRange" });
    }
    months.push(cursor);
    cursor = addCairoMonths(cursor, 1);
  }
  return months;
}

/** Outstanding amount for one immutable invoice, using the same rule as credit allocation. */
async function invoiceOutstandingMinorTx(
  tx: DbTransactionClient,
  workspaceId: string,
  invoiceId: string,
): Promise<number> {
  const [invoice, paymentEntries, submissions, existingCredits] = await Promise.all([
    tx.billingInvoice.findFirst({
      where: { workspaceId, id: invoiceId },
      select: { totalMinor: true },
    }),
    tx.billingLedgerEntry.findMany({
      where: {
        workspaceId,
        entryType: { in: ["payment_credit", "payment_reversal"] },
      },
      select: { sourceId: true, entryType: true, amountMinor: true },
    }),
    tx.billingPaymentSubmission.findMany({
      where: { workspaceId, invoiceId },
      select: { id: true, status: true },
    }),
    tx.billingInvoiceCredit.findMany({
      where: { workspaceId, invoiceId },
      select: { amountMinor: true },
    }),
  ]);
  if (!invoice) return 0;

  const creditBySubmission = new Map<string, number>();
  const reversalBySubmission = new Map<string, number>();
  for (const entry of paymentEntries) {
    const target = entry.entryType === "payment_credit" ? creditBySubmission : reversalBySubmission;
    target.set(entry.sourceId, (target.get(entry.sourceId) ?? 0) + entry.amountMinor);
  }
  const paidMinor = Math.min(
    invoice.totalMinor,
    submissions
      .filter((submission) => submission.status === "approved")
      .reduce(
        (sum, submission) =>
          sum +
          Math.max(
            0,
            (creditBySubmission.get(submission.id) ?? 0) -
              (reversalBySubmission.get(submission.id) ?? 0),
          ),
        0,
      ),
  );
  const creditedMinor = existingCredits.reduce((sum, credit) => sum + credit.amountMinor, 0);
  return Math.max(0, invoice.totalMinor - paidMinor - creditedMinor);
}

/**
 * A retroactive exemption cannot erase history. Unbilled usage receives a
 * signed compensating ledger entry; usage already allocated to an immutable
 * invoice receives an audited invoice credit, capped at the invoice's current
 * outstanding balance, so a settled invoice never creates excess credit.
 */
async function compensateRetroactiveExemptionTx(
  tx: DbTransactionClient,
  params: {
    workspaceId: string;
    exemption: { id: string; startDate: string; expiresOn: string | null };
    actor: string;
    actorDisplayName: string;
    meta: RequestMeta;
    now: Date;
  },
): Promise<void> {
  const today = cairoDateFromDate(params.now);
  const lastDate =
    params.exemption.expiresOn && params.exemption.expiresOn < today
      ? params.exemption.expiresOn
      : today;
  if (params.exemption.startDate > lastDate) return;
  const months = cairoMonthsBetween(params.exemption.startDate, lastDate);
  const entries = await tx.billingLedgerEntry.findMany({
    where: {
      workspaceId: params.workspaceId,
      entryType: "usage_charge",
      periodMonth: { in: months },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  for (const entry of entries) {
    const reversalKey = `exemption-reversal:${params.exemption.id}:${entry.id}`;
    const prior = await tx.billingLedgerEntry.findFirst({
      where: { workspaceId: params.workspaceId, idempotencyKey: reversalKey },
      select: { id: true },
    });
    if (prior) continue;

    const invoiceLine = await tx.billingInvoiceLineItem.findFirst({
      where: { workspaceId: params.workspaceId, ledgerEntryId: entry.id },
      select: { invoiceId: true, amountMinor: true },
    });

    if (invoiceLine) {
      const outstandingMinor = await invoiceOutstandingMinorTx(
        tx,
        params.workspaceId,
        invoiceLine.invoiceId,
      );
      const amountMinor = Math.min(Math.abs(invoiceLine.amountMinor), outstandingMinor);
      // A fully paid or already-credited invoice is settled; adding a credit
      // would create available credit that was never paid or owed.
      if (amountMinor <= 0) continue;
      const creditKey = `invoice-credit:${params.exemption.id}:${entry.id}`;
      const priorCredit = await tx.billingInvoiceCredit.findFirst({
        where: { workspaceId: params.workspaceId, idempotencyKey: creditKey },
        select: { id: true },
      });
      if (priorCredit) continue;
      const ledgerEntry = await appendLedgerEntryTx(tx, {
        workspaceId: params.workspaceId,
        entryType: "invoice_credit",
        direction: "credit",
        amountMinor,
        periodMonth: entry.periodMonth,
        snapshotVersion: entry.snapshotVersion,
        studentId: entry.studentId,
        sourceType: "billing_exemption",
        sourceId: params.exemption.id,
        idempotencyKey: reversalKey,
        descriptionKey: "Billing.ledger.invoiceCredit",
        createdBy: params.actor,
        now: params.now,
      });
      await tx.billingInvoiceCredit.create({
        data: {
          id: newUuidV7(),
          workspaceId: params.workspaceId,
          invoiceId: invoiceLine.invoiceId,
          ledgerEntryId: ledgerEntry.id,
          amountMinor,
          reasonCode: "exemption_retroactive",
          sourceType: "billing_exemption",
          sourceId: params.exemption.id,
          idempotencyKey: creditKey,
          createdAt: params.now,
          createdBy: params.actor,
        },
      });
      await writeBillingAuditTx(tx, {
        workspaceId: params.workspaceId,
        actorUserId: params.actor === BILLING_WORKER_ACTOR ? null : params.actor,
        actorDisplayName: params.actorDisplayName,
        entityType: "billing_invoice_credit",
        entityId: ledgerEntry.id,
        action: BILLING_AUDIT_ACTIONS.invoiceCreditCreated,
        diff: { invoiceId: invoiceLine.invoiceId, amountMinor, studentId: entry.studentId },
        reasonCode: "exemption_created",
        requestId: params.meta.requestId,
        ipHash: params.meta.ipHash ?? null,
        now: params.now,
      });
      continue;
    }

    const amountMinor = entry.amountMinor;
    await appendLedgerEntryTx(tx, {
      workspaceId: params.workspaceId,
      entryType: "exemption_reversal",
      direction: "credit",
      amountMinor,
      periodMonth: entry.periodMonth,
      snapshotVersion: entry.snapshotVersion,
      studentId: entry.studentId,
      sourceType: "billing_exemption",
      sourceId: params.exemption.id,
      idempotencyKey: reversalKey,
      descriptionKey: "Billing.ledger.exemptionReversal",
      createdBy: params.actor,
      now: params.now,
    });
    await writeBillingAuditTx(tx, {
      workspaceId: params.workspaceId,
      actorUserId: params.actor === BILLING_WORKER_ACTOR ? null : params.actor,
      actorDisplayName: params.actorDisplayName,
      entityType: "billing_ledger_entry",
      entityId: entry.id,
      action: BILLING_AUDIT_ACTIONS.exemptionReversalCreated,
      diff: { periodMonth: entry.periodMonth, amountMinor, studentId: entry.studentId },
      reasonCode: "exemption_created",
      requestId: params.meta.requestId,
      ipHash: params.meta.ipHash ?? null,
      now: params.now,
    });
  }
}

type AdminActor = {
  userId: string;
  displayName: string;
  adminRecordId: string;
};

type RequestMeta = { requestId: string; ipHash?: string | null };

/**
 * A platform-admin context is resolved from the session once per request, but
 * the underlying admin record may be revoked before a mutation commits. Every
 * mutation re-checks it inside its own transaction.
 */
export async function assertActivePlatformAdminTx(
  tx: DbTransactionClient,
  userId: string,
): Promise<void> {
  const active = await tx.platformAdmin.findFirst({
    where: { userId, revokedAt: null },
    select: { id: true },
  });
  if (!active) throw new AppError("FORBIDDEN", { messageKey: "errors.platformAdminRequired" });
}

/** A targeted workspace must be visible to the admin's platform RLS policy. */
export async function assertPlatformWorkspaceVisible(
  adminUserId: string,
  workspaceId: string,
): Promise<void> {
  const workspace = await withPlatformAdminScope(adminUserId, (tx) =>
    tx.workspace.findFirst({ where: { id: workspaceId }, select: { id: true } }),
  );
  if (!workspace) throw new AppError("NOT_FOUND");
}

/** Stable audit reasons only; callers never pass free text here. */
function auditReason(code: BillingAuditReasonCode): string {
  return code;
}

/** Re-check a platform-admin session inside the transaction that mutates. */
export async function assertActivePlatformAdmin(adminUserId: string): Promise<void> {
  const active = await withPlatformAdminScope(adminUserId, (tx) =>
    tx.platformAdmin.findFirst({ where: { userId: adminUserId, revokedAt: null }, select: { id: true } }),
  );
  if (!active) throw new AppError("FORBIDDEN", { messageKey: "errors.platformAdminRequired" });
}

/** Every visible workspace, including those with no exemptions or submissions. */
export async function listPlatformBillingWorkspaces(adminUserId: string) {
  const rows = await withPlatformAdminScope(adminUserId, (tx) =>
    tx.workspace.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        members: {
          where: { role: "owner", status: "active", removedAt: null },
          select: { user: { select: { name: true } } },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  );
  return rows.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    ownerName: workspace.members[0]?.user.name ?? null,
  }));
}

/**
 * Apply a ledger credit to outstanding invoices oldest-first. The invoice and
 * its line items stay immutable; each application is a new, keyed row. Any
 * amount left over is reported as available credit, never invented as payment.
 */
async function allocateInvoiceCreditTx(
  tx: DbTransactionClient,
  params: {
    workspaceId: string;
    ledgerEntryId: string;
    amountMinor: number;
    reasonCode: string;
    sourceType: string;
    sourceId: string;
    idempotencyKeyPrefix: string;
    createdBy: string;
    actorDisplayName: string;
    meta: RequestMeta;
    now: Date;
  },
): Promise<void> {
  let remaining = params.amountMinor;
  if (remaining <= 0) return;

  const [invoices, paymentEntries, submissions, existingCredits] = await Promise.all([
    tx.billingInvoice.findMany({
      where: { workspaceId: params.workspaceId },
      orderBy: [{ issuedAt: "asc" }],
      select: { id: true, number: true, totalMinor: true },
    }),
    tx.billingLedgerEntry.findMany({
      where: {
        workspaceId: params.workspaceId,
        entryType: { in: ["payment_credit", "payment_reversal"] },
      },
      select: { sourceId: true, entryType: true, amountMinor: true },
    }),
    tx.billingPaymentSubmission.findMany({
      where: { workspaceId: params.workspaceId },
      select: { id: true, invoiceId: true, status: true },
    }),
    tx.billingInvoiceCredit.findMany({
      where: { workspaceId: params.workspaceId },
      select: { invoiceId: true, amountMinor: true },
    }),
  ]);

  const creditBySubmission = new Map<string, number>();
  const reversalBySubmission = new Map<string, number>();
  for (const entry of paymentEntries) {
    const target = entry.entryType === "payment_credit" ? creditBySubmission : reversalBySubmission;
    target.set(entry.sourceId, (target.get(entry.sourceId) ?? 0) + entry.amountMinor);
  }
  const creditByInvoice = new Map<string, number>();
  for (const credit of existingCredits) {
    creditByInvoice.set(
      credit.invoiceId,
      (creditByInvoice.get(credit.invoiceId) ?? 0) + credit.amountMinor,
    );
  }

  for (const invoice of invoices) {
    if (remaining <= 0) break;
    const paidMinor = Math.min(
      invoice.totalMinor,
      submissions
        .filter(
          (submission) => submission.invoiceId === invoice.id && submission.status === "approved",
        )
        .reduce(
          (sum, submission) =>
            sum +
            Math.max(
              0,
              (creditBySubmission.get(submission.id) ?? 0) -
                (reversalBySubmission.get(submission.id) ?? 0),
            ),
          0,
        ),
    );
    const alreadyCredited = creditByInvoice.get(invoice.id) ?? 0;
    const outstanding = Math.max(0, invoice.totalMinor - paidMinor - alreadyCredited);
    if (outstanding <= 0) continue;

    const amount = Math.min(remaining, outstanding);
    const idempotencyKey = `${params.idempotencyKeyPrefix}:${params.ledgerEntryId}:${invoice.id}`;
    const prior = await tx.billingInvoiceCredit.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: params.workspaceId,
          idempotencyKey,
        },
      },
      select: { id: true },
    });
    if (prior) continue;
    await tx.billingInvoiceCredit.create({
      data: {
        id: newUuidV7(),
        workspaceId: params.workspaceId,
        invoiceId: invoice.id,
        ledgerEntryId: params.ledgerEntryId,
        amountMinor: amount,
        reasonCode: params.reasonCode,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        idempotencyKey,
        createdAt: params.now,
        createdBy: params.createdBy,
      },
    });
    await writeBillingAuditTx(tx, {
      workspaceId: params.workspaceId,
      actorUserId: params.createdBy,
      actorDisplayName: params.actorDisplayName,
      entityType: "billing_invoice_credit",
      entityId: invoice.id,
      action: BILLING_AUDIT_ACTIONS.invoiceCreditCreated,
      diff: { invoiceNumber: invoice.number, amountMinor: amount },
      reasonCode: params.reasonCode,
      requestId: params.meta.requestId,
      ipHash: params.meta.ipHash ?? null,
      now: params.now,
    });
    remaining -= amount;
  }
}

export async function createBillingExemptionInScope(
  workspaceId: string,
  input: CreateBillingExemptionInput,
  admin: AdminActor,
  meta: RequestMeta,
  now: Date,
) {
  await assertPlatformWorkspaceVisible(admin.userId, workspaceId);
  return withScope({ workspaceId }, async (tx) => {
    await assertActivePlatformAdminTx(tx, admin.userId);
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    if (!workspace) throw new AppError("NOT_FOUND");

    await syncExemptionStatusesTx(tx, workspaceId, now);
    const existing = await tx.billingExemption.findMany({ where: { workspaceId } });
    const candidate = {
      startDate: input.startDate,
      expiresOn: input.expiresOn ?? null,
      status: "scheduled" as const,
      revokedOn: null,
    };
    if (
      existing.some((row) => exemptionsOverlap(exemptionPeriodFromRow(row), candidate))
    ) {
      throw new AppError("CONFLICT", { messageKey: "errors.exemptionOverlap" });
    }

    const status = resolveExemptionStatus(candidate, cairoDateFromDate(now));
    const id = newUuidV7();
    const created = await tx.billingExemption.create({
      data: {
        id,
        workspaceId,
        reason: input.reason,
        notes: input.notes ?? null,
        startDate: input.startDate,
        expiresOn: input.expiresOn ?? null,
        status,
        createdByAdminId: admin.adminRecordId,
        modifiedByAdminId: admin.adminRecordId,
        createdAt: now,
        updatedAt: now,
      },
    });
    await writeBillingAuditTx(tx, {
      workspaceId,
      actorUserId: admin.userId,
      actorDisplayName: admin.displayName,
      entityType: "billing_exemption",
      entityId: id,
      action: BILLING_AUDIT_ACTIONS.exemptionCreated,
      diff: {
        exemptionReason: input.reason,
        startDate: input.startDate,
        expiresOn: input.expiresOn ?? null,
        status,
      },
      reasonCode: auditReason(input.reasonCode),
      requestId: meta.requestId,
      ipHash: meta.ipHash ?? null,
      now,
    });
    await compensateRetroactiveExemptionTx(tx, {
      workspaceId,
      exemption: created,
      actor: admin.userId,
      actorDisplayName: admin.displayName,
      meta,
      now,
    });
    return projectExemption(created);
  });
}

export async function updateBillingExemptionInScope(
  workspaceId: string,
  exemptionId: string,
  input: UpdateBillingExemptionInput,
  admin: AdminActor,
  meta: RequestMeta,
  now: Date,
) {
  await assertPlatformWorkspaceVisible(admin.userId, workspaceId);
  return withScope({ workspaceId }, async (tx) => {
    await assertActivePlatformAdminTx(tx, admin.userId);
    // Expire stale rows before deciding whether this exemption may still be
    // updated. Otherwise an already-expired record could be extended back into
    // billable days without the compensation required by ADR-0048.
    await syncExemptionStatusesTx(tx, workspaceId, now);
    const existing = await tx.billingExemption.findFirst({
      where: { workspaceId, id: exemptionId },
    });
    if (!existing || existing.status === "revoked" || existing.status === "expired") {
      throw new AppError("NOT_FOUND");
    }
    const nextExpiresOn = input.expiresOn === undefined ? existing.expiresOn : input.expiresOn;
    if (nextExpiresOn && nextExpiresOn < existing.startDate) {
      throw new AppError("VALIDATION_FAILED", { fields: { expiresOn: ["invalidExemptionPeriod"] } });
    }
    if (!isForwardOnlyExemptionExpiration(nextExpiresOn, cairoDateFromDate(now))) {
      throw new AppError("VALIDATION_FAILED", { fields: { expiresOn: ["noRetroactiveExpiration"] } });
    }
    const others = await tx.billingExemption.findMany({
      where: { workspaceId, id: { not: existing.id } },
    });
    const candidate = exemptionPeriodFromRow({
      ...existing,
      expiresOn: nextExpiresOn,
    });
    if (others.some((row) => exemptionsOverlap(exemptionPeriodFromRow(row), candidate))) {
      throw new AppError("CONFLICT", { messageKey: "errors.exemptionOverlap" });
    }
    const updated = await tx.billingExemption.update({
      where: { id: existing.id },
      data: {
        reason: input.reason ?? existing.reason,
        notes: input.notes === undefined ? existing.notes : input.notes,
        expiresOn: input.expiresOn === undefined ? existing.expiresOn : input.expiresOn,
        modifiedByAdminId: admin.adminRecordId,
        updatedAt: now,
      },
    });
    await writeBillingAuditTx(tx, {
      workspaceId,
      actorUserId: admin.userId,
      actorDisplayName: admin.displayName,
      entityType: "billing_exemption",
      entityId: existing.id,
      action: BILLING_AUDIT_ACTIONS.exemptionUpdated,
      diff: {
        exemptionReason: updated.reason,
        expiresOn: updated.expiresOn,
      },
      reasonCode: auditReason(input.reasonCode),
      requestId: meta.requestId,
      ipHash: meta.ipHash ?? null,
      now,
    });
    return projectExemption(updated);
  });
}

export async function revokeBillingExemptionInScope(
  workspaceId: string,
  exemptionId: string,
  reasonCode: BillingAuditReasonCode,
  admin: AdminActor,
  meta: RequestMeta,
  now: Date,
) {
  await assertPlatformWorkspaceVisible(admin.userId, workspaceId);
  return withScope({ workspaceId }, async (tx) => {
    await assertActivePlatformAdminTx(tx, admin.userId);
    const existing = await tx.billingExemption.findFirst({
      where: { workspaceId, id: exemptionId },
    });
    if (!existing || existing.status === "revoked") throw new AppError("NOT_FOUND");
    const updated = await tx.billingExemption.update({
      where: { id: existing.id },
      data: {
        status: "revoked",
        revokedOn: now,
        modifiedByAdminId: admin.adminRecordId,
        updatedAt: now,
      },
    });
    await writeBillingAuditTx(tx, {
      workspaceId,
      actorUserId: admin.userId,
      actorDisplayName: admin.displayName,
      entityType: "billing_exemption",
      entityId: existing.id,
      action: BILLING_AUDIT_ACTIONS.exemptionRevoked,
      diff: { status: "revoked", revokedOn: now.toISOString() },
      reasonCode: auditReason(reasonCode),
      requestId: meta.requestId,
      ipHash: meta.ipHash ?? null,
      now,
    });
    return projectExemption(updated);
  });
}

export async function listBillingExemptionsForAdmin(
  adminUserId: string,
  limit: number,
  now: Date = new Date(),
) {
  // The selector is complete; this list is only the bounded history view.
  // Each workspace is read in its own transaction, sequentially, so a large
  // platform never exhausts the connection pool with parallel fan-out.
  const workspaces = await listPlatformBillingWorkspaces(adminUserId);
  const all: Array<{
    workspace: { id: string; name: string; slug: string };
    exemption: BillingExemptionView;
  }> = [];
  for (const workspace of workspaces) {
    const exemptions = await withScope({ workspaceId: workspace.id }, (tx) =>
      listExemptionsForWorkspaceTx(tx, workspace.id, now),
    );
    for (const exemption of exemptions) {
      all.push({
        workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
        exemption,
      });
    }
  }
  const grouped = new Map<
    string,
    { workspace: { id: string; name: string; slug: string }; exemptions: BillingExemptionView[] }
  >();
  for (const item of all.slice(0, limit)) {
    const current = grouped.get(item.workspace.id) ?? { workspace: item.workspace, exemptions: [] };
    current.exemptions.push(item.exemption);
    grouped.set(item.workspace.id, current);
  }
  return { rows: [...grouped.values()], truncated: all.length > limit };
}

// --- Usage snapshots and attendance ----------------------------------------

export async function listAttendanceForMonthTx(
  tx: DbTransactionClient,
  workspaceId: string,
  periodMonth: string,
  range: { start: Date; endExclusive: Date },
): Promise<BillingAttendanceRow[]> {
  const rows = await tx.attendanceMark.findMany({
    where: {
      workspaceId,
      session: {
        startsAt: { gte: range.start, lt: range.endExclusive },
      },
    },
    select: {
      id: true,
      studentId: true,
      mark: true,
      session: { select: { status: true, startsAt: true } },
    },
  });
  return rows.map((row) => ({
    markId: row.id,
    studentId: row.studentId,
    mark: row.mark,
    sessionStatus: row.session.status,
    startsAt: row.session.startsAt,
  }));
}

export async function latestUsageSnapshotTx(
  tx: DbTransactionClient,
  workspaceId: string,
  periodMonth: string,
) {
  return tx.billingUsageSnapshot.findFirst({
    where: { workspaceId, periodMonth },
    orderBy: [{ version: "desc" }],
  });
}

/** Student ids already recorded for a Cairo month, used for an accurate preview. */
export async function listRecordedUsageStudentIdsTx(
  tx: DbTransactionClient,
  workspaceId: string,
  periodMonth: string,
): Promise<string[]> {
  const rows = await tx.billingUsageStudent.findMany({
    where: { workspaceId, periodMonth },
    select: { studentId: true },
  });
  return rows.map((row) => row.studentId);
}

export async function createUsageSnapshotTx(
  tx: DbTransactionClient,
  params: {
    workspaceId: string;
    periodMonth: string;
    rateMinor: number;
    configVersion: number;
    qualifyingStudents: Array<{ studentId: string; markIds: string[] }>;
    billable: boolean;
    now: Date;
    createdBy: string;
  },
) {
  const latest = await latestUsageSnapshotTx(tx, params.workspaceId, params.periodMonth);
  const recorded = await tx.billingUsageStudent.findMany({
    where: { workspaceId: params.workspaceId, periodMonth: params.periodMonth },
    select: { studentId: true },
  });
  const recordedIds = new Set(recorded.map((row) => row.studentId));
  // A student is charged once per Cairo month. Later cycles only add students
  // who have since become qualifying; a repeated cycle creates no new charge.
  const delta = params.qualifyingStudents.filter((student) => !recordedIds.has(student.studentId));
  if (latest && delta.length === 0) return latest;

  const version = (latest?.version ?? 0) + 1;
  const chargeMinor = params.billable
    ? computeChargeMinor(delta.length, params.rateMinor)
    : 0;
  const id = newUuidV7();
  const snapshot = await tx.billingUsageSnapshot.create({
    data: {
      id,
      workspaceId: params.workspaceId,
      periodMonth: params.periodMonth,
      version,
      rateMinor: params.rateMinor,
      configVersion: params.configVersion,
      qualifyingStudentCount: delta.length,
      chargeMinor,
      billable: params.billable,
      computedAt: params.now,
      createdBy: params.createdBy,
    },
  });
  if (delta.length > 0) {
    await tx.billingUsageStudent.createMany({
      data: delta.map((student) => ({
        id: newUuidV7(),
        workspaceId: params.workspaceId,
        snapshotId: id,
        periodMonth: params.periodMonth,
        version,
        studentId: student.studentId,
        markIds: student.markIds,
        createdAt: params.now,
      })),
    });
  }
  if (params.billable && chargeMinor > 0) {
    for (const student of delta) {
      await appendLedgerEntryTx(tx, {
        workspaceId: params.workspaceId,
        entryType: "usage_charge",
        direction: "debit",
        amountMinor: params.rateMinor,
        periodMonth: params.periodMonth,
        snapshotVersion: version,
        studentId: student.studentId,
        sourceType: "billing_usage_snapshot",
        sourceId: id,
        idempotencyKey: `usage:${params.workspaceId}:${params.periodMonth}:${student.studentId}`,
        descriptionKey: "Billing.ledger.usageCharge",
        createdBy: params.createdBy,
        now: params.now,
      });
    }
  }
  return snapshot;
}

// --- Ledger -----------------------------------------------------------------

export async function appendLedgerEntryTx(
  tx: DbTransactionClient,
  params: {
    workspaceId: string;
    entryType:
      | "usage_charge"
      | "adjustment"
      | "invoice_allocation"
      | "payment_credit"
      | "exemption_reversal"
      | "invoice_credit"
      | "payment_reversal";
    direction: "debit" | "credit";
    amountMinor: number;
    periodMonth?: string | null;
    snapshotVersion?: number | null;
    studentId?: string | null;
    sourceType: string;
    sourceId: string;
    idempotencyKey: string;
    descriptionKey?: string | null;
    createdBy: string;
    now: Date;
  },
) {
  // Check before insert: a failed INSERT aborts a PostgreSQL transaction, so a
  // post-P2002 lookup inside the same transaction would always fail with 25P02.
  const existing = await tx.billingLedgerEntry.findUnique({
    where: {
      workspaceId_idempotencyKey: {
        workspaceId: params.workspaceId,
        idempotencyKey: params.idempotencyKey,
      },
    },
  });
  if (existing) return existing;
  return tx.billingLedgerEntry.create({
    data: {
      id: newUuidV7(),
      workspaceId: params.workspaceId,
      entryType: params.entryType,
      direction: params.direction,
      amountMinor: params.amountMinor,
      currency: "EGP",
      periodMonth: params.periodMonth ?? null,
      snapshotVersion: params.snapshotVersion ?? null,
      studentId: params.studentId ?? null,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      idempotencyKey: params.idempotencyKey,
      descriptionKey: params.descriptionKey ?? null,
      createdBy: params.createdBy,
      createdAt: params.now,
    },
  });
}

/** Complete reads for financial computation. Display pages use the `Recent` variants. */
export async function listLedgerTx(tx: DbTransactionClient, workspaceId: string) {
  return tx.billingLedgerEntry.findMany({
    where: { workspaceId },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function listRecentLedgerTx(
  tx: DbTransactionClient,
  workspaceId: string,
  limit = 200,
) {
  return tx.billingLedgerEntry.findMany({
    where: { workspaceId },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });
}

// --- Invoices ---------------------------------------------------------------

export async function listInvoicesTx(tx: DbTransactionClient, workspaceId: string) {
  return tx.billingInvoice.findMany({
    where: { workspaceId },
    orderBy: [{ issuedAt: "desc" }],
  });
}

export async function listRecentInvoicesTx(
  tx: DbTransactionClient,
  workspaceId: string,
  limit = 100,
) {
  return tx.billingInvoice.findMany({
    where: { workspaceId },
    orderBy: [{ issuedAt: "desc" }],
    take: limit,
  });
}

export async function listInvoiceCreditsTx(tx: DbTransactionClient, workspaceId: string) {
  return tx.billingInvoiceCredit.findMany({
    where: { workspaceId },
    select: { invoiceId: true, ledgerEntryId: true, amountMinor: true },
  });
}

export async function listSubmissionsForWorkspaceTx(
  tx: DbTransactionClient,
  workspaceId: string,
) {
  return tx.billingPaymentSubmission.findMany({
    where: { workspaceId },
    orderBy: [{ submittedAt: "desc" }],
  });
}

export async function listRecentSubmissionsForWorkspaceTx(
  tx: DbTransactionClient,
  workspaceId: string,
  limit = 100,
) {
  return tx.billingPaymentSubmission.findMany({
    where: { workspaceId },
    orderBy: [{ submittedAt: "desc" }],
    take: limit,
  });
}

/**
 * Issue at most one invoice per Cairo month. The whole accumulated balance is
 * invoiced once the configured threshold is reached; no partial allocation.
 */
export async function issueInvoiceForMonthTx(
  tx: DbTransactionClient,
  params: {
    workspaceId: string;
    month: string;
    thresholdMinor: number;
    configVersion: number;
    now: Date;
    createdBy: string;
  },
) {
  const existing = await tx.billingInvoice.findUnique({
    where: {
      workspaceId_cycleKey: {
        workspaceId: params.workspaceId,
        cycleKey: params.month,
      },
    },
  });
  if (existing) return null;

  const allocated = await tx.billingInvoiceLineItem.findMany({
    where: { workspaceId: params.workspaceId },
    select: { ledgerEntryId: true },
  });
  const allocatedIds = new Set(allocated.map((item) => item.ledgerEntryId));
  const entries = await tx.billingLedgerEntry.findMany({
    where: {
      workspaceId: params.workspaceId,
      entryType: { in: ["usage_charge", "adjustment"] },
    },
    orderBy: [{ createdAt: "asc" }],
  });
  const eligible = entries.filter((entry) => !allocatedIds.has(entry.id));
  const totalMinor = eligible.reduce(
    (sum, entry) => sum + (entry.direction === "debit" ? entry.amountMinor : -entry.amountMinor),
    0,
  );
  if (totalMinor < params.thresholdMinor || totalMinor <= 0) return null;

  const number = `KSH-${params.month.replace("-", "")}-${newUuidV7().slice(0, 8).toUpperCase()}`;
  const invoice = await tx.billingInvoice.create({
    data: {
      id: newUuidV7(),
      workspaceId: params.workspaceId,
      number,
      cycleKey: params.month,
      totalMinor,
      currency: "EGP",
      issuedAt: params.now,
      configVersion: params.configVersion,
      thresholdMinorAtIssue: params.thresholdMinor,
      createdBy: params.createdBy,
    },
  });

  for (const [index, entry] of eligible.entries()) {
    const signedAmount =
      entry.direction === "debit" ? entry.amountMinor : -entry.amountMinor;
    await tx.billingInvoiceLineItem.create({
      data: {
        id: newUuidV7(),
        workspaceId: params.workspaceId,
        invoiceId: invoice.id,
        ledgerEntryId: entry.id,
        amountMinor: signedAmount,
        position: index + 1,
        descriptionKey: entry.descriptionKey,
        createdAt: params.now,
      },
    });
    // The allocation reverses the signed effect of the source entry. Credit
    // adjustments therefore receive a debit allocation and are consumed once.
    await appendLedgerEntryTx(tx, {
      workspaceId: params.workspaceId,
      entryType: "invoice_allocation",
      direction: signedAmount >= 0 ? "credit" : "debit",
      amountMinor: Math.abs(signedAmount),
      periodMonth: params.month,
      sourceType: "billing_invoice",
      sourceId: invoice.id,
      idempotencyKey: `invoice-allocation:${invoice.id}:${entry.id}`,
      descriptionKey: "Billing.ledger.invoiceAllocation",
      createdBy: params.createdBy,
      now: params.now,
    });
  }

  const ownerId = await findOwnerUserIdTx(tx, params.workspaceId);
  if (ownerId) {
    await createNotificationTx(tx, params.workspaceId, {
      recipientUserId: ownerId,
      type: "billing_invoice_issued",
      severity: "info",
      messageKey: "Notifications.messages.billingInvoiceIssued",
      messageParams: { month: params.month },
      dedupeKey: `billing-invoice:${invoice.id}`,
      entityType: "billing_invoice",
      entityId: invoice.id,
    });
  }

  await writeBillingAuditTx(tx, {
    workspaceId: params.workspaceId,
    actorUserId: params.createdBy === BILLING_WORKER_ACTOR ? null : params.createdBy,
    actorDisplayName: BILLING_WORKER_NAME,
    entityType: "billing_invoice",
    entityId: invoice.id,
    action: BILLING_AUDIT_ACTIONS.invoiceIssued,
    diff: { invoiceNumber: invoice.number, totalMinor, month: params.month },
    reasonCode: "threshold_reached",
    requestId: "billing-worker",
    now: params.now,
  });
  return invoice;
}

// --- Payment submissions ----------------------------------------------------

export async function loadBillingDashboardTx(
  tx: DbTransactionClient,
  workspaceId: string,
  config: BillingConfigView,
) {
  const [state, ledger, invoices, submissions, invoiceCredits] = await Promise.all([
    getWorkspaceBillingStateTx(tx, workspaceId),
    listLedgerTx(tx, workspaceId),
    listInvoicesTx(tx, workspaceId),
    listSubmissionsForWorkspaceTx(tx, workspaceId),
    listInvoiceCreditsTx(tx, workspaceId),
  ]);
  return { state, config, ledger, invoices, submissions, invoiceCredits };
}

export async function createBillingSubmissionInScope(
  scope: { workspaceId: string; actorUserId: string; actorDisplayName: string },
  input: CreateBillingSubmissionInput,
  meta: RequestMeta,
  now: Date,
) {
  return withScope({ workspaceId: scope.workspaceId }, async (tx) => {
    const invoice = await tx.billingInvoice.findFirst({
      where: { id: input.invoiceId, workspaceId: scope.workspaceId },
    });
    if (!invoice) throw new AppError("NOT_FOUND");

    if (input.evidenceFileId) {
      const file = await tx.file.findFirst({
        where: {
          id: input.evidenceFileId,
          workspaceId: scope.workspaceId,
          scope: "billing_evidence",
          scanStatus: "clean",
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!file) throw new AppError("VALIDATION_FAILED", { fields: { evidenceFileId: ["invalid"] } });
    }

    const retried = await tx.billingPaymentSubmission.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.workspaceId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (retried) return retried;

    const reference = normalizeTransactionReference(input.reference);
    const fingerprint = transactionReferenceFingerprint(reference);
    const existing = await tx.billingPaymentSubmission.findUnique({
      where: {
        workspaceId_invoiceId_referenceFingerprint: {
          workspaceId: scope.workspaceId,
          invoiceId: invoice.id,
          referenceFingerprint: fingerprint,
        },
      },
    });
    if (existing) return existing;

    const id = newUuidV7();
    const created = await tx.billingPaymentSubmission.create({
      data: {
        id,
        workspaceId: scope.workspaceId,
        invoiceId: invoice.id,
        referenceRaw: reference,
        referenceFingerprint: fingerprint,
        amountMinor: input.amountMinor,
        currency: "EGP",
        transferredAt: new Date(input.transferredAt),
        status: "submitted",
        evidenceFileId: input.evidenceFileId ?? null,
        idempotencyKey: input.idempotencyKey,
        submittedBy: scope.actorUserId,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });
    await writeBillingTenantAuditTx(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      entityType: "billing_payment_submission",
      entityId: id,
      action: BILLING_AUDIT_ACTIONS.submissionCreated,
      diff: { invoiceNumber: invoice.number, amountMinor: input.amountMinor },
      requestId: meta.requestId,
      ipHash: meta.ipHash ?? null,
      now,
    });
    return created;
  });
}

export async function findSubmissionForAdminTx(
  tx: DbTransactionClient,
  workspaceId: string,
  submissionId: string,
) {
  return tx.billingPaymentSubmission.findFirst({
    where: { workspaceId, id: submissionId },
    include: { invoice: { select: { number: true, totalMinor: true, cycleKey: true } } },
  });
}

/** Locate a scanned evidence file attached to a submission in the same scope. */
export async function findBillingEvidenceForSubmissionTx(
  tx: DbTransactionClient,
  workspaceId: string,
  submissionId: string,
) {
  const submission = await tx.billingPaymentSubmission.findFirst({
    where: { id: submissionId, workspaceId },
    select: {
      id: true,
      evidenceFileId: true,
      invoice: { select: { number: true } },
    },
  });
  if (!submission?.evidenceFileId) return null;
  const file = await tx.file.findFirst({
    where: {
      id: submission.evidenceFileId,
      workspaceId,
      scope: "billing_evidence",
      deletedAt: null,
      scanStatus: "clean",
    },
    select: { id: true, storageKey: true, mime: true },
  });
  if (!file) return null;
  return { file, invoiceNumber: submission.invoice.number };
}

export async function reviewBillingSubmissionInScope(
  params: {
    workspaceId: string;
    submissionId: string;
    input: ReviewBillingSubmissionInput;
    admin: AdminActor;
    meta: RequestMeta;
    now: Date;
  },
) {
  const { workspaceId, submissionId, input, admin, meta, now } = params;
  await assertPlatformWorkspaceVisible(admin.userId, workspaceId);
  return withScope({ workspaceId }, async (tx) => {
    await assertActivePlatformAdminTx(tx, admin.userId);

    const submission = await findSubmissionForAdminTx(tx, workspaceId, submissionId);
    if (!submission) throw new AppError("NOT_FOUND");
    if (submission.reversedAt) {
      throw new AppError("CONFLICT", { messageKey: "errors.billingReferenceReleased" });
    }
    // A replay key is scoped to this submission and this decision. Reusing a
    // key for another submission or another action never returns stale data.
    const priorReview = await tx.billingPaymentSubmission.findFirst({
      where: {
        workspaceId,
        id: submissionId,
        reviewIdempotencyKey: input.idempotencyKey,
        reviewAction: input.action,
      },
    });
    if (priorReview) return priorReview;

    if (submission.status === "approved" || submission.status === "rejected") {
      throw new AppError("CONFLICT", { messageKey: "errors.billingSubmissionFinal" });
    }

    const credits = await tx.billingLedgerEntry.findMany({
      where: {
        workspaceId,
        entryType: "payment_credit",
        sourceId: submission.id,
      },
    });
    const alreadyCredited = credits.some((entry) => entry.idempotencyKey === `payment-credit:${submission.id}`);
    if (alreadyCredited) return submission;

    if (input.action === "approved") {
      if (submission.amountMinor !== submission.invoice.totalMinor) {
        throw new AppError("CONFLICT", { messageKey: "errors.billingAmountMismatch" });
      }
      const invoiceCredits = await tx.billingLedgerEntry.findMany({
        where: { workspaceId, entryType: "payment_credit" },
      });
      const approvedSubmissionIds = (
        await tx.billingPaymentSubmission.findMany({
          where: { workspaceId, invoiceId: submission.invoiceId, status: "approved" },
          select: { id: true },
        })
      ).map((row) => row.id);
      const paidMinor = invoiceCredits
        .filter((entry) => approvedSubmissionIds.includes(entry.sourceId))
        .reduce((sum, entry) => sum + entry.amountMinor, 0);
      if (paidMinor >= submission.invoice.totalMinor) {
        throw new AppError("CONFLICT", { messageKey: "errors.billingInvoicePaid" });
      }

      const registryRow = await tx.billingReferenceFingerprint.findUnique({
        where: { fingerprint: submission.referenceFingerprint },
      });
      if (
        registryRow?.status === "active" &&
        registryRow.submissionId !== submission.id
      ) {
        throw new AppError("CONFLICT", { messageKey: "errors.billingReferenceUsed" });
      }
      if (registryRow?.status === "revoked") {
        // A released reference is reclaimable only through a fresh, approved
        // submission. The release and reclamation are both global audit events.
        await tx.billingReferenceFingerprint.update({
          where: { fingerprint: submission.referenceFingerprint },
          data: {
            workspaceId,
            submissionId: submission.id,
            status: "active",
            revokedAt: null,
            revokedBy: null,
            revokeReasonCode: null,
          },
        });
      } else if (!registryRow) {
        await tx.billingReferenceFingerprint.create({
          data: {
            fingerprint: submission.referenceFingerprint,
            workspaceId,
            submissionId: submission.id,
            status: "active",
            createdAt: now,
          },
        });
      }
      await tx.billingReferenceEvent.create({
        data: {
          id: newUuidV7(),
          fingerprint: submission.referenceFingerprint,
          eventType: registryRow ? "reclaimed" : "claimed",
          workspaceId,
          submissionId: submission.id,
          actorUserId: admin.userId,
          reasonCode: "review_decision",
          createdAt: now,
        },
      });
      await appendLedgerEntryTx(tx, {
        workspaceId,
        entryType: "payment_credit",
        direction: "credit",
        amountMinor: submission.amountMinor,
        sourceType: "billing_payment_submission",
        sourceId: submission.id,
        idempotencyKey: `payment-credit:${submission.id}`,
        descriptionKey: "Billing.ledger.paymentCredit",
        createdBy: admin.userId,
        now,
      });
    }

    const reviewed = await tx.billingPaymentSubmission.update({
      where: { id: submission.id },
      data: {
        status: input.action,
        reviewedBy: admin.userId,
        reviewedAt: now,
        reviewNoteCode: input.noteCode ?? null,
        reviewIdempotencyKey: input.idempotencyKey,
        reviewAction: input.action,
        updatedAt: now,
      },
    });

    const auditId = await writeBillingAuditTx(tx, {
      workspaceId,
      actorUserId: admin.userId,
      actorDisplayName: admin.displayName,
      entityType: "billing_payment_submission",
      entityId: submission.id,
      action: BILLING_AUDIT_ACTIONS.submissionReviewed,
      diff: {
        reviewAction: input.action,
        noteCode: input.noteCode ?? null,
        invoiceNumber: submission.invoice.number,
      },
      reasonCode: auditReason(input.reasonCode),
      requestId: meta.requestId,
      ipHash: meta.ipHash ?? null,
      now,
    });

    await tx.billingReviewEvent.create({
      data: {
        id: newUuidV7(),
        workspaceId,
        submissionId: submission.id,
        action: input.action,
        noteCode: input.noteCode ?? null,
        actorUserId: admin.userId,
        actorDisplayName: admin.displayName,
        actorType: "platform_admin",
        platformAuditEventId: auditId,
        createdAt: now,
      },
    });

    const ownerId = await findOwnerUserIdTx(tx, workspaceId);
    if (ownerId && input.action !== "under_review") {
      await createNotificationTx(tx, workspaceId, {
        recipientUserId: ownerId,
        type:
          input.action === "approved"
            ? "billing_submission_approved"
            : input.action === "flagged"
              ? "billing_submission_flagged"
              : "billing_submission_rejected",
        severity: input.action === "approved" ? "info" : "warning",
        messageKey:
          input.action === "approved"
            ? "Notifications.messages.billingSubmissionApproved"
            : input.action === "flagged"
              ? "Notifications.messages.billingSubmissionFlagged"
              : "Notifications.messages.billingSubmissionRejected",
        messageParams: { invoiceNumber: submission.invoice.number },
        dedupeKey: `billing-review:${submission.id}:${input.action}`,
        entityType: "billing_payment_submission",
        entityId: submission.id,
      });
    }

    return reviewed;
  });
}

/**
 * Release a disputed reference from the global registry. The submission is
 * named by id, never by a client-supplied fingerprint, and the reversal is a
 * new ledger entry. A later valid submission may reclaim the same fingerprint.
 */
export async function releaseBillingReferenceInScope(
  input: ReleaseBillingReferenceInput,
  admin: AdminActor,
  meta: RequestMeta,
  now: Date,
) {
  const { workspaceId, submissionId } = input;
  await assertPlatformWorkspaceVisible(admin.userId, workspaceId);
  return withScope({ workspaceId }, async (tx) => {
    await assertActivePlatformAdminTx(tx, admin.userId);
    const submission = await tx.billingPaymentSubmission.findFirst({
      where: { workspaceId, id: submissionId },
      select: { id: true, status: true, referenceFingerprint: true, reversedAt: true },
    });
    if (!submission) throw new AppError("NOT_FOUND");
    if (submission.reversedAt) {
      throw new AppError("CONFLICT", { messageKey: "errors.billingReferenceReleased" });
    }

    const registryRow = await tx.billingReferenceFingerprint.findUnique({
      where: { fingerprint: submission.referenceFingerprint },
    });
    if (!registryRow || registryRow.status !== "active") {
      throw new AppError("CONFLICT", { messageKey: "errors.billingReferenceNotActive" });
    }
    if (registryRow.workspaceId !== workspaceId || registryRow.submissionId !== submissionId) {
      throw new AppError("CONFLICT", { messageKey: "errors.billingReferenceOwnerMismatch" });
    }

    const credits = await tx.billingLedgerEntry.findMany({
      where: {
        workspaceId,
        entryType: "payment_credit",
        sourceId: submission.id,
      },
      select: { amountMinor: true },
    });
    const reversalAmountMinor = credits.reduce((sum, entry) => sum + entry.amountMinor, 0);
    await appendLedgerEntryTx(tx, {
      workspaceId,
      entryType: "payment_reversal",
      direction: "debit",
      amountMinor: reversalAmountMinor,
      sourceType: "billing_reference_release",
      sourceId: submission.id,
      idempotencyKey: `reference-release:${submission.id}`,
      descriptionKey: "Billing.ledger.paymentReversal",
      createdBy: admin.userId,
      now,
    });

    await tx.billingPaymentSubmission.update({
      where: { id: submission.id },
      data: {
        status: "flagged",
        reviewNoteCode: "duplicate_reference",
        reversedAt: now,
        reversalReasonCode: input.reasonCode,
        reviewedBy: admin.userId,
        reviewedAt: now,
        updatedAt: now,
      },
    });
    await tx.billingReferenceFingerprint.update({
      where: { fingerprint: submission.referenceFingerprint },
      data: {
        status: "revoked",
        revokedAt: now,
        revokedBy: admin.userId,
        revokeReasonCode: input.reasonCode,
      },
    });
    await tx.billingReferenceEvent.create({
      data: {
        id: newUuidV7(),
        fingerprint: submission.referenceFingerprint,
        eventType: "released",
        workspaceId,
        submissionId: submission.id,
        actorUserId: admin.userId,
        reasonCode: input.reasonCode,
        createdAt: now,
      },
    });
    await writeBillingAuditTx(tx, {
      workspaceId,
      actorUserId: admin.userId,
      actorDisplayName: admin.displayName,
      entityType: "billing_payment_submission",
      entityId: submission.id,
      action: BILLING_AUDIT_ACTIONS.referenceReleased,
      diff: { reasonCode: input.reasonCode, reversed: credits.length > 0 },
      reasonCode: "reference_release",
      requestId: meta.requestId,
      ipHash: meta.ipHash ?? null,
      now,
    });
    return { submissionId: submission.id, status: "flagged" as const, releasedAt: now.toISOString() };
  });
}

/**
 * Audited manual correction to a carried platform balance. It is append-only,
 * scoped to the target workspace, and keyed so a retry cannot apply twice.
 */
export async function appendBillingAdjustmentInScope(
  workspaceId: string,
  input: CreateBillingAdjustmentInput,
  admin: AdminActor,
  meta: RequestMeta,
  now: Date,
) {
  await assertPlatformWorkspaceVisible(admin.userId, workspaceId);
  return withScope({ workspaceId }, async (tx) => {
    await assertActivePlatformAdminTx(tx, admin.userId);
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    if (!workspace) throw new AppError("NOT_FOUND");

    const idempotencyKey = `adjustment:${workspaceId}:${input.idempotencyKey}`;
    const existing = await tx.billingLedgerEntry.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId,
          idempotencyKey,
        },
      },
    });
    if (existing) return projectLedgerEntry(existing);

    const adjustmentId = newUuidV7();
    // A credit is real account value: allocate it to the oldest outstanding
    // invoices, leaving any remainder as available credit. A debit stays in
    // the carried balance and is invoiced with the next cycle.
    const entry = await appendLedgerEntryTx(tx, {
      workspaceId,
      entryType: input.direction === "credit" ? "invoice_credit" : "adjustment",
      direction: input.direction,
      amountMinor: input.amountMinor,
      sourceType: "platform_admin_adjustment",
      sourceId: adjustmentId,
      idempotencyKey,
      descriptionKey:
        input.direction === "credit"
          ? "Billing.ledger.invoiceCredit"
          : "Billing.ledger.adjustment",
      createdBy: admin.userId,
      now,
    });
    if (input.direction === "credit") {
      await allocateInvoiceCreditTx(tx, {
        workspaceId,
        ledgerEntryId: entry.id,
        amountMinor: input.amountMinor,
        reasonCode: "manual_adjustment",
        sourceType: "platform_admin_adjustment",
        sourceId: adjustmentId,
        idempotencyKeyPrefix: "manual-credit",
        createdBy: admin.userId,
        actorDisplayName: admin.displayName,
        meta,
        now,
      });
    }
    await writeBillingAuditTx(tx, {
      workspaceId,
      actorUserId: admin.userId,
      actorDisplayName: admin.displayName,
      entityType: "billing_ledger_entry",
      entityId: adjustmentId,
      action: BILLING_AUDIT_ACTIONS.adjustmentCreated,
      diff: {
        direction: input.direction,
        amountMinor: input.amountMinor,
        allocatedToInvoices: input.direction === "credit",
      },
      reasonCode: auditReason(input.reasonCode),
      requestId: meta.requestId,
      ipHash: meta.ipHash ?? null,
      now,
    });
    return projectLedgerEntry(entry);
  });
}

function projectLedgerEntry(entry: {
  id: string;
  entryType: string;
  direction: string;
  amountMinor: number;
  currency: string;
  periodMonth: string | null;
  createdAt: Date;
  descriptionKey: string | null;
}) {
  return {
    id: entry.id,
    entryType: entry.entryType,
    direction: entry.direction,
    amountMinor: entry.amountMinor,
    currency: entry.currency,
    periodMonth: entry.periodMonth,
    createdAt: entry.createdAt.toISOString(),
    descriptionKey: entry.descriptionKey,
  };
}

export async function listBillingSubmissionsForAdmin(
  adminUserId: string,
  limit: number,
  status?: "all" | "submitted" | "under_review" | "approved" | "rejected" | "flagged",
) {
  // Query every visible workspace through its tenant scope, then apply one
  // global, explicit limit. Older workspaces are never silently omitted.
  // Sequential scoped reads keep the connection pool bounded on a large platform.
  const workspaces = await listPlatformBillingWorkspaces(adminUserId);
  const all: Array<{
    id: string;
    workspaceId: string;
    invoiceId: string;
    referenceRaw: string;
    amountMinor: number;
    transferredAt: string;
    status: string;
    evidenceFileId: string | null;
    reversedAt: string | null;
    submittedAt: string;
    invoice: { number: string; totalMinor: number; cycleKey: string };
    workspace: { id: string; name: string; slug: string };
  }> = [];
  for (const workspace of workspaces) {
    const submissions = await withScope({ workspaceId: workspace.id }, (tx) =>
      tx.billingPaymentSubmission.findMany({
        where:
          status && status !== "all"
            ? { status }
            : { status: { in: ["submitted", "under_review", "flagged"] } },
        orderBy: [{ submittedAt: "desc" }],
        select: {
          id: true,
          workspaceId: true,
          invoiceId: true,
          referenceRaw: true,
          amountMinor: true,
          transferredAt: true,
          status: true,
          evidenceFileId: true,
          reversedAt: true,
          submittedAt: true,
          invoice: { select: { number: true, totalMinor: true, cycleKey: true } },
        },
      }),
    );
    for (const submission of submissions) {
      all.push({
        ...submission,
        workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
        transferredAt: submission.transferredAt.toISOString(),
        reversedAt: submission.reversedAt?.toISOString() ?? null,
        submittedAt: submission.submittedAt.toISOString(),
      });
    }
  }
  all.sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  return { rows: all.slice(0, limit), truncated: all.length > limit };
}

// --- Worker cycle -----------------------------------------------------------

export async function listBillingCycleWorkspaceIds(): Promise<string[]> {
  return listActiveWorkspaceIdsForWorker();
}

type BillingCycleResult = {
  month: string;
  skipped: "before_activation" | null;
  snapshotVersion: number | null;
  qualifyingStudentCount: number;
  chargeMinor: number;
  billable: boolean;
  invoiceNumber: string | null;
  monthsProcessed: number;
};

const MAX_CATCH_UP_MONTHS = 24;

async function runBillingCycleAttempt(
  workspaceId: string,
  now: Date,
  actor: string,
  config: BillingConfigView,
  adminUserId?: string,
): Promise<BillingCycleResult> {
  return withScope({ workspaceId }, async (tx) => {
    // An admin-triggered cycle re-checks the admin record in the same
    // transaction that creates billing state. Revocation mid-request stops it.
    if (adminUserId) await assertActivePlatformAdminTx(tx, adminUserId);
    const currentMonth = cairoMonthFromDate(now);
    const state = await ensureWorkspaceBillingActivationTx(tx, {
      workspaceId,
      activationMonth: currentMonth,
      now,
      activatedBy: actor,
    });
    if (currentMonth < state.activationMonth) {
      return {
        month: currentMonth,
        skipped: "before_activation",
        snapshotVersion: null,
        qualifyingStudentCount: 0,
        chargeMinor: 0,
        billable: false,
        invoiceNumber: null,
        monthsProcessed: 0,
      };
    }

    let cursor = state.activationMonth;
    let processed = 0;
    let qualifyingStudentCount = 0;
    let chargeMinor = 0;
    let latestSnapshotVersion: number | null = null;
    let latestBillable = true;
    let latestInvoiceNumber: string | null = null;

    while (cursor <= currentMonth) {
      if (processed >= MAX_CATCH_UP_MONTHS) {
        throw new AppError("CONFLICT", { messageKey: "errors.billingCycleRange" });
      }
      const month = cursor;
      const exemption = await findActiveExemptionForMonthTx(tx, workspaceId, month, now);
      const billable = exemption === null;
      const monthRange = cairoMonthRange(month);
      // Read the billed month plus the preceding rolling window, clamped to
      // activation. Two sessions in that window can qualify a student even
      // when one of them fell in the previous Cairo month (ADR-0051).
      const lookupRange = qualificationLookupRange(
        monthRange,
        cairoMonthRange(state.activationMonth).start,
      );
      const attendance = await listAttendanceForMonthTx(
        tx,
        workspaceId,
        month,
        lookupRange,
      );
      const qualifyingStudents = computeQualifyingStudents(attendance, monthRange);
      const snapshot = await createUsageSnapshotTx(tx, {
        workspaceId,
        periodMonth: month,
        rateMinor: config.rateMinor,
        configVersion: config.version,
        qualifyingStudents,
        billable,
        now,
        createdBy: actor,
      });

      const invoice = billable
        ? await issueInvoiceForMonthTx(tx, {
            workspaceId,
            month,
            thresholdMinor: config.thresholdMinor,
            configVersion: config.version,
            now,
            createdBy: actor,
          })
        : null;

      await writeBillingAuditTx(tx, {
        workspaceId,
        actorUserId: actor === BILLING_WORKER_ACTOR ? null : actor,
        actorDisplayName: BILLING_WORKER_NAME,
        entityType: "billing_usage_snapshot",
        entityId: snapshot.id,
        action: BILLING_AUDIT_ACTIONS.usageComputed,
        diff: {
          month,
          version: snapshot.version,
          qualifyingStudentCount: qualifyingStudents.length,
          chargeMinor: snapshot.chargeMinor,
          billable,
          exemptionReason: exemption?.reason ?? null,
        },
        reasonCode: "automatic_lifecycle",
        requestId: "billing-worker",
        now,
      });

      processed += 1;
      qualifyingStudentCount += qualifyingStudents.length;
      chargeMinor += snapshot.chargeMinor;
      latestSnapshotVersion = snapshot.version;
      latestBillable = billable;
      latestInvoiceNumber = invoice?.number ?? latestInvoiceNumber;
      cursor = addCairoMonths(cursor, 1);
    }

    return {
      month: currentMonth,
      skipped: null,
      snapshotVersion: latestSnapshotVersion,
      qualifyingStudentCount,
      chargeMinor,
      billable: latestBillable,
      invoiceNumber: latestInvoiceNumber,
      monthsProcessed: processed,
    };
  });
}

/**
 * Compute each Cairo month from activation through the current one. Activation
 * is created on the first cycle after the feature is enabled, so no historical
 * attendance predating activation is charged. A delayed cycle still reaches the
 * first uncovered month after an exemption. Every attempt is atomic; a racing
 * insert is retried as a whole scoped transaction, never inside the failed one.
 */
export async function runBillingCycleForWorkspace(
  workspaceId: string,
  now: Date,
  actor: string = BILLING_WORKER_ACTOR,
  config?: BillingConfigView,
  adminUserId?: string,
): Promise<BillingCycleResult> {
  // Global config is read before the tenant transaction so no other connection
  // is used while a workspace scope is open.
  const effectiveConfig = config ?? (await getActiveBillingConfig());
  try {
    return await runBillingCycleAttempt(workspaceId, now, actor, effectiveConfig, adminUserId);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return runBillingCycleAttempt(workspaceId, now, actor, effectiveConfig, adminUserId);
  }
}
