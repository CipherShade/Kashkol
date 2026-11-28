import { withScope } from "@/lib/db/scope";
import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import {
  createBillingEvidence,
  readStoredFileForDownload,
} from "@/modules/files";
import {
  assertPlatformAdminContext,
  type PlatformAdminContext,
} from "@/modules/platform-admin/service";
import { assertOwner, type Scope } from "@/modules/tenancy/types";
import { computeBillingSummary, formatMinorAsEgpLabel } from "./ledger";
import {
  appendBillingAdjustmentInScope,
  appendBillingConfigVersion,
  assertActivePlatformAdmin,
  assertActivePlatformAdminTx,
  createBillingExemptionInScope,
  findBillingEvidenceForSubmissionTx,
  isBillingUniqueViolation,
  createBillingSubmissionInScope,
  findActiveExemptionForMonthTx,
  getActiveBillingConfig,
  latestUsageSnapshotTx,
  listAttendanceForMonthTx,
  listBillingConfigVersions,
  listBillingExemptionsForAdmin,
  listBillingCycleWorkspaceIds,
  listBillingSubmissionsForAdmin,
  listPlatformBillingWorkspaces,
  listRecordedUsageStudentIdsTx,
  loadBillingDashboardTx,
  releaseBillingReferenceInScope,
  reviewBillingSubmissionInScope,
  revokeBillingExemptionInScope,
  runBillingCycleForWorkspace,
  updateBillingExemptionInScope,
} from "./repository";
import {
  billingAdminQuerySchema,
  billingConfigUpdateSchema,
  billingEvidenceQuerySchema,
  billingQuerySchema,
  createBillingAdjustmentSchema,
  createBillingExemptionSchema,
  billingAuditReasonCodeSchema,
  createBillingSubmissionSchema,
  releaseBillingReferenceSchema,
  reviewBillingSubmissionSchema,
  updateBillingExemptionSchema,
  type BillingConfigUpdateInput,
} from "./schemas";
import {
  cairoMonthFromDate,
  cairoMonthRange,
  isCairoMonth,
} from "./time";
import {
  computeChargeMinor,
  computeQualifyingStudents,
  qualificationLookupRange,
} from "./qualification";
import { BILLING_AUDIT_ACTIONS, writeBillingAuditTx } from "./audit";

const WORKER_ACTOR = "system:billing-worker";

type RequestMeta = { requestId: string; ipHash?: string | null };

function assertBillingOwner(scope: Scope): void {
  // Money is owner-only. This is a service check, not a hidden button.
  assertOwner(scope);
}

function requestMeta(explicit?: RequestMeta): RequestMeta {
  return {
    requestId: explicit?.requestId ?? newRequestId(),
    ipHash: explicit?.ipHash ?? null,
  };
}

function projectLedgerEntry(
  entry: {
    id: string;
    entryType: string;
    direction: string;
    amountMinor: number;
    currency: string;
    periodMonth: string | null;
    createdAt: Date;
    descriptionKey: string | null;
  },
  locale = "en-US",
) {
  return {
    id: entry.id,
    entryType: entry.entryType,
    direction: entry.direction,
    amountMinor: entry.amountMinor,
    amountLabel: formatMinorAsEgpLabel(entry.amountMinor, locale),
    currency: entry.currency,
    periodMonth: entry.periodMonth,
    createdAt: entry.createdAt.toISOString(),
    descriptionKey: entry.descriptionKey,
  };
}

function projectSubmission(
  submission: {
    id: string;
    invoiceId: string;
    referenceRaw: string;
    amountMinor: number;
    currency: string;
    transferredAt: Date;
    status: string;
    evidenceFileId: string | null;
    submittedAt: Date;
    reviewedAt: Date | null;
    reviewNoteCode: string | null;
  },
  locale = "en-US",
) {
  return {
    id: submission.id,
    invoiceId: submission.invoiceId,
    reference: submission.referenceRaw,
    amountMinor: submission.amountMinor,
    amountLabel: formatMinorAsEgpLabel(submission.amountMinor, locale),
    currency: submission.currency,
    transferredAt: submission.transferredAt.toISOString(),
    status: submission.status,
    hasEvidence: submission.evidenceFileId !== null,
    submittedAt: submission.submittedAt.toISOString(),
    reviewedAt: submission.reviewedAt?.toISOString() ?? null,
    reviewNoteCode: submission.reviewNoteCode,
  };
}

/** Teacher-facing billing view. It never exposes another workspace's data. */
export async function getTeacherBilling(
  scope: Scope,
  rawQuery: unknown = {},
  now: Date = new Date(),
  locale = "en-US",
) {
  assertBillingOwner(scope);
  const parsed = billingQuerySchema.parse(rawQuery);
  const month = parsed.month ?? cairoMonthFromDate(now);
  if (!isCairoMonth(month)) throw new AppError("VALIDATION_FAILED");
  const config = await getActiveBillingConfig();

  return withScope(scope, async (tx) => {
    const [dashboard, exemption, latestSnapshot, recordedStudentIds] = await Promise.all([
      loadBillingDashboardTx(tx, scope.workspaceId, config),
      findActiveExemptionForMonthTx(tx, scope.workspaceId, month, now),
      latestUsageSnapshotTx(tx, scope.workspaceId, month),
      listRecordedUsageStudentIdsTx(tx, scope.workspaceId, month),
    ]);

    // The preview must use the same rolling window and activation boundary as
    // the cycle. With no activation, no attendance can produce a charge.
    const monthRange = cairoMonthRange(month);
    const activationStart = dashboard.state
      ? cairoMonthRange(dashboard.state.activationMonth).start
      : monthRange.endExclusive;
    const attendance = await listAttendanceForMonthTx(
      tx,
      scope.workspaceId,
      month,
      qualificationLookupRange(monthRange, activationStart),
    );

    const billable = exemption === null;
    const qualifying = computeQualifyingStudents(attendance, monthRange);
    const recorded = new Set(recordedStudentIds);
    // The preview must agree with what the cycle will charge. Once a snapshot
    // exists it is authoritative; before it exists only students not already
    // recorded for the month can produce a new charge.
    const previewStudentCount = latestSnapshot
      ? latestSnapshot.qualifyingStudentCount
      : qualifying.filter((student) => !recorded.has(student.studentId)).length;
    const previewBillable = latestSnapshot ? latestSnapshot.billable : billable;
    const previewChargeMinor = latestSnapshot
      ? previewBillable
        ? latestSnapshot.chargeMinor
        : 0
      : billable
        ? computeChargeMinor(previewStudentCount, dashboard.config.rateMinor)
        : 0;
    const summary = computeBillingSummary(
      dashboard.ledger,
      dashboard.invoices,
      dashboard.submissions,
      dashboard.invoiceCredits,
    );
    const issuedAtById = new Map(
      dashboard.invoices.map((invoice) => [invoice.id, invoice.issuedAt]),
    );

    return {
      month,
      config: dashboard.config,
      activation: dashboard.state
        ? {
            month: dashboard.state.activationMonth,
            activatedAt: dashboard.state.activatedAt.toISOString(),
          }
        : null,
      exemption: exemption
        ? {
            reason: exemption.reason,
            startDate: exemption.startDate,
            expiresOn: exemption.expiresOn,
            status: exemption.status,
          }
        : null,
      preview: {
        qualifyingStudentCount: previewStudentCount,
        rateMinor: dashboard.config.rateMinor,
        chargeMinor: previewChargeMinor,
        chargeLabel: formatMinorAsEgpLabel(previewChargeMinor, locale),
        billable: previewBillable,
      },
      summary: {
        ...summary,
        unbilledLabel: formatMinorAsEgpLabel(summary.unbilledMinor, locale),
        availableCreditLabel: formatMinorAsEgpLabel(summary.availableCreditMinor, locale),
        paidLabel: formatMinorAsEgpLabel(summary.paidMinor, locale),
        creditedLabel: formatMinorAsEgpLabel(summary.creditedMinor, locale),
        outstandingLabel: formatMinorAsEgpLabel(summary.outstandingMinor, locale),
        invoices: summary.invoices.map((invoice) => ({
          ...invoice,
          issuedAt: issuedAtById.get(invoice.id)?.toISOString() ?? null,
          totalLabel: formatMinorAsEgpLabel(invoice.totalMinor, locale),
          paidLabel: formatMinorAsEgpLabel(invoice.paidMinor, locale),
          creditedLabel: formatMinorAsEgpLabel(invoice.creditedMinor, locale),
          outstandingLabel: formatMinorAsEgpLabel(invoice.outstandingMinor, locale),
        })),
      },
      // Display is deliberately paginated; the summary above uses every row.
      invoices: summary.invoices.slice(0, 100),
      ledger: dashboard.ledger
        .slice(0, 200)
        .map((entry) => projectLedgerEntry(entry, locale)),
      submissions: dashboard.submissions
        .slice(0, 100)
        .map((submission) => projectSubmission(submission, locale)),
    };
  });
}

export async function submitBillingPayment(
  scope: Scope,
  rawInput: unknown,
  meta?: RequestMeta,
  now: Date = new Date(),
  locale = "en-US",
) {
  assertBillingOwner(scope);
  const input = createBillingSubmissionSchema.parse(rawInput);
  let result;
  try {
    result = await createBillingSubmissionInScope(scope, input, requestMeta(meta), now);
  } catch (error) {
    if (!isBillingUniqueViolation(error)) throw error;
    // A concurrent retry aborts the transaction; the second scoped attempt
    // reads the winning row through the idempotency pre-check.
    result = await createBillingSubmissionInScope(scope, input, requestMeta(meta), now);
  }
  return projectSubmission(result, locale);
}

/**
 * Upload optional evidence for a manual submission. The account owner is
 * asserted before any file content is handled. Evidence never proves payment.
 */
export async function uploadBillingEvidence(
  scope: Scope,
  upload: { body: Buffer; mime: string; filename: string; sizeBytes: number },
  meta?: RequestMeta,
) {
  assertBillingOwner(scope);
  if (
    !Buffer.isBuffer(upload?.body) ||
    typeof upload.mime !== "string" ||
    typeof upload.filename !== "string" ||
    !Number.isInteger(upload.sizeBytes)
  ) {
    throw new AppError("VALIDATION_FAILED");
  }
  const file = await createBillingEvidence(
    scope,
    {
      body: upload.body,
      mime: upload.mime,
      filename: upload.filename,
      sizeBytes: upload.sizeBytes,
    },
    requestMeta(meta),
  );
  return { fileId: file.id, scanStatus: file.scanStatus };
}

/** Platform-admin billing view. It contains verification metadata only. */
export async function getPlatformBillingOverview(
  admin: PlatformAdminContext,
  rawQuery: unknown = {},
  locale = "en-US",
) {
  assertPlatformAdminContext(admin);
  const query = billingAdminQuerySchema.parse(rawQuery);
  const [config, versions, workspaces, exemptions, submissions] = await Promise.all([
    getActiveBillingConfig(),
    listBillingConfigVersions(25),
    listPlatformBillingWorkspaces(admin.userId),
    listBillingExemptionsForAdmin(admin.userId, query.limit ?? 50),
    listBillingSubmissionsForAdmin(admin.userId, query.limit ?? 50, query.status),
  ]);
  return {
    config,
    versions,
    // The selector is built from these server-resolved workspaces. A typed
    // workspace UUID is never trusted as an authorisation boundary.
    workspaces,
    exemptions: exemptions.rows,
    exemptionsTruncated: exemptions.truncated,
    submissions: submissions.rows.map((submission) => ({
      ...submission,
      amountLabel: formatMinorAsEgpLabel(submission.amountMinor, locale),
      invoiceTotalLabel: formatMinorAsEgpLabel(submission.invoice.totalMinor, locale),
    })),
    submissionsTruncated: submissions.truncated,
  };
}

/**
 * Narrow, audited access to a scanned evidence file. The authorised app route
 * streams the bytes directly, so no bearer URL exists to be replayed by a
 * different principal. No student data is read.
 */
export async function getPlatformBillingEvidenceDownload(
  admin: PlatformAdminContext,
  rawQuery: unknown,
  submissionId: string,
  meta?: RequestMeta,
  now: Date = new Date(),
) {
  assertPlatformAdminContext(admin);
  const { workspaceId } = billingEvidenceQuerySchema.parse(rawQuery);
  const request = requestMeta(meta);
  const evidence = await withScope({ workspaceId }, async (tx) => {
    await assertActivePlatformAdminTx(tx, admin.userId);
    const found = await findBillingEvidenceForSubmissionTx(tx, workspaceId, submissionId);
    if (!found) throw new AppError("NOT_FOUND");
    return found;
  });
  // Reading is storage work; keep it outside the tenant transaction.
  const download = await readStoredFileForDownload({
    storageKey: evidence.file.storageKey,
    mime: evidence.file.mime,
    title: "Billing evidence",
  });
  // Audit only after the bytes were actually read. A storage failure leaves no
  // false "evidence viewed" claim.
  await withScope({ workspaceId }, async (tx) => {
    await writeBillingAuditTx(tx, {
      workspaceId,
      actorUserId: admin.userId,
      actorDisplayName: admin.displayName,
      entityType: "billing_payment_submission",
      entityId: submissionId,
      action: BILLING_AUDIT_ACTIONS.evidenceViewed,
      diff: { invoiceNumber: evidence.invoiceNumber },
      requestId: request.requestId,
      ipHash: request.ipHash ?? null,
      now,
    });
  });
  return download;
}

export async function updatePlatformBillingConfig(
  admin: PlatformAdminContext,
  rawInput: unknown,
  meta?: RequestMeta,
  now: Date = new Date(),
) {
  assertPlatformAdminContext(admin);
  const input = billingConfigUpdateSchema.parse(rawInput) as BillingConfigUpdateInput;
  const metaWithId = requestMeta(meta);
  try {
    return await appendBillingConfigVersion(input, admin.userId, now, metaWithId.requestId);
  } catch (error) {
    // Two admins can read the same latest version. The unique version column
    // decides the winner; the loser retries the whole append transaction.
    if (!isBillingUniqueViolation(error)) throw error;
    return appendBillingConfigVersion(input, admin.userId, now, metaWithId.requestId);
  }
}

export async function createPlatformBillingExemption(
  admin: PlatformAdminContext,
  workspaceId: string,
  rawInput: unknown,
  meta?: RequestMeta,
  now: Date = new Date(),
) {
  assertPlatformAdminContext(admin);
  const source =
    typeof rawInput === "object" && rawInput !== null
      ? (rawInput as Record<string, unknown>)
      : {};
  const input = createBillingExemptionSchema.parse({ ...source, workspaceId });
  return createBillingExemptionInScope(
    workspaceId,
    input,
    admin,
    requestMeta(meta),
    now,
  );
}

export async function updatePlatformBillingExemption(
  admin: PlatformAdminContext,
  workspaceId: string,
  exemptionId: string,
  rawInput: unknown,
  meta?: RequestMeta,
  now: Date = new Date(),
) {
  assertPlatformAdminContext(admin);
  const input = updateBillingExemptionSchema.parse(rawInput);
  return updateBillingExemptionInScope(
    workspaceId,
    exemptionId,
    input,
    admin,
    requestMeta(meta),
    now,
  );
}

export async function revokePlatformBillingExemption(
  admin: PlatformAdminContext,
  workspaceId: string,
  exemptionId: string,
  reasonCode: unknown,
  meta?: RequestMeta,
  now: Date = new Date(),
) {
  assertPlatformAdminContext(admin);
  const code = billingAuditReasonCodeSchema.parse(reasonCode);
  return revokeBillingExemptionInScope(
    workspaceId,
    exemptionId,
    code,
    admin,
    requestMeta(meta),
    now,
  );
}

export async function reviewPlatformBillingSubmission(
  admin: PlatformAdminContext,
  workspaceId: string,
  submissionId: string,
  rawInput: unknown,
  meta?: RequestMeta,
  now: Date = new Date(),
) {
  assertPlatformAdminContext(admin);
  const input = reviewBillingSubmissionSchema.parse(rawInput);
  const params = {
    workspaceId,
    submissionId,
    input,
    admin,
    meta: requestMeta(meta),
    now,
  };
  try {
    return await reviewBillingSubmissionInScope(params);
  } catch (error) {
    if (!isBillingUniqueViolation(error)) throw error;
    return reviewBillingSubmissionInScope(params);
  }
}

/** Release a disputed transaction reference without exposing it to tenants. */
export async function releasePlatformBillingReference(
  admin: PlatformAdminContext,
  rawInput: unknown,
  meta?: RequestMeta,
  now: Date = new Date(),
) {
  assertPlatformAdminContext(admin);
  const input = releaseBillingReferenceSchema.parse(rawInput);
  try {
    return await releaseBillingReferenceInScope(input, admin, requestMeta(meta), now);
  } catch (error) {
    if (!isBillingUniqueViolation(error)) throw error;
    return releaseBillingReferenceInScope(input, admin, requestMeta(meta), now);
  }
}

/** Narrow, audited correction of a carried platform billing balance. */
export async function createPlatformBillingAdjustment(
  admin: PlatformAdminContext,
  rawInput: unknown,
  meta?: RequestMeta,
  now: Date = new Date(),
) {
  assertPlatformAdminContext(admin);
  const input = createBillingAdjustmentSchema.parse(rawInput);
  try {
    return await appendBillingAdjustmentInScope(
      input.workspaceId,
      input,
      {
        userId: admin.userId,
        displayName: admin.displayName,
        adminRecordId: admin.adminRecordId,
      },
      requestMeta(meta),
      now,
    );
  } catch (error) {
    if (!isBillingUniqueViolation(error)) throw error;
    return appendBillingAdjustmentInScope(
      input.workspaceId,
      input,
      {
        userId: admin.userId,
        displayName: admin.displayName,
        adminRecordId: admin.adminRecordId,
      },
      requestMeta(meta),
      now,
    );
  }
}

/**
 * Run one billing cycle for all active workspaces. Each workspace is scoped
 * independently; no tenant row is read outside its own transaction.
 */
export async function runPlatformBillingCycle(
  admin: PlatformAdminContext,
  now: Date = new Date(),
) {
  assertPlatformAdminContext(admin);
  const [workspaceIds, config] = await Promise.all([
    listBillingCycleWorkspaceIds(),
    getActiveBillingConfig(),
    assertActivePlatformAdmin(admin.userId),
  ]);
  let processed = 0;
  let failed = 0;
  const failures: Array<{ workspaceId: string; code: string }> = [];

  for (const workspaceId of workspaceIds) {
    try {
      await runBillingCycleForWorkspace(workspaceId, now, WORKER_ACTOR, config, admin.userId);
      processed += 1;
    } catch {
      // Never log workspace identifiers or financial details. The workspace id
      // is returned only to the authenticated caller of the admin endpoint.
      failed += 1;
      failures.push({ workspaceId, code: "billing_cycle_failed" });
    }
  }

  return { processed, failed, failures };
}

export { runBillingCycleForWorkspace } from "./repository";
