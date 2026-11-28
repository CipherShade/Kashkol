import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import { TENANT_TABLES } from "@/lib/db/tenant-tables";
import type { PlatformAdminContext } from "@/modules/platform-admin/service";
import {
  createPlatformBillingAdjustment,
  createPlatformBillingExemption,
  getPlatformBillingOverview,
  getTeacherBilling,
  releasePlatformBillingReference,
  reviewPlatformBillingSubmission,
  runBillingCycleForWorkspace,
  updatePlatformBillingConfig,
  updatePlatformBillingExemption,
} from "@/modules/billing/service";
import { transactionReferenceFingerprint } from "@/modules/billing/reference";
import { cairoMonthFromDate } from "@/modules/billing/time";
import type { Scope } from "@/modules/tenancy/types";
import {
  DELTA,
  createStudent,
  createTestUser,
  deleteTestUser,
  fixturesScope,
  type TestUser,
} from "./helpers";

const NOW = new Date("2026-11-15T10:00:00.000Z");
const MONTH = cairoMonthFromDate(NOW);
const META = { requestId: "billing-remediation-test" };

let adminUser: TestUser;
let admin: PlatformAdminContext;

type InvoiceFixture = {
  invoiceId: string;
  submissionId: string;
  reference: string;
  fingerprint: string;
  studentId: string;
  creditEntryId: string | null;
  snapshotId: string;
  exemptionId: string;
  usageEntryId: string;
  month: string;
};

type FixtureOptions = {
  issuedAt?: Date;
  periodMonth?: string;
  preCredited?: boolean;
  reference?: string;
};

function suffix(): string {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function uniqueExemptionDates(key: string): { startDate: string; expiresOn: string; month: string } {
  const numeric = Number.parseInt(key.replace(/\D/g, "").slice(-6) || "1", 10);
  const year = 2000 + (numeric % 25);
  const month = 1 + (numeric % 12);
  const day = 1 + (numeric % 27);
  const startDate = `${year}-${pad(month)}-${pad(day)}`;
  return {
    startDate,
    expiresOn: `${year}-${pad(month)}-${pad(day + 1)}`,
    month: startDate.slice(0, 7),
  };
}

async function createBillingWorkspace(key: string): Promise<{
  workspaceId: string;
  scope: Scope;
}> {
  const workspaceId = randomUUID();
  await withScope({ workspaceId }, async (tx) => {
    await tx.workspace.create({
      data: {
        id: workspaceId,
        name: `Billing ${key}`,
        slug: `billing-${key.toLowerCase()}`,
        teachingName: `Billing ${key}`,
        primarySubject: null,
        gradesTaught: [],
        status: "active",
        planTier: "pilot",
        planStatus: "pilot_active",
      },
    });
    await tx.workspaceSettings.create({
      data: {
        workspaceId,
        atRiskAfter: 2,
        inactiveAfter: 4,
        locale: "en",
        theme: "system",
        timezone: "Africa/Cairo",
        currency: "EGP",
      },
    });
  });
  return { workspaceId, scope: { ...fixturesScope(), workspaceId } };
}

async function createInvoiceFixture(
  workspaceId: string,
  key: string,
  periodMonth: string,
  options: FixtureOptions = {},
): Promise<InvoiceFixture> {
  const studentId = await createStudent(workspaceId, "Billing", key);
  const reference = options.reference ?? `INSTAPAY-${key}`;
  const fingerprint = transactionReferenceFingerprint(reference);
  const exemptionDates = uniqueExemptionDates(key);
  const issuedAt = options.issuedAt ?? NOW;
  const preCredited = options.preCredited ?? true;

  return withScope({ workspaceId }, async (tx) => {
    const state = await tx.workspaceBillingState.findUnique({ where: { workspaceId } });
    if (!state) {
      await tx.workspaceBillingState.create({
        data: {
          workspaceId,
          activationMonth: MONTH,
          activatedAt: NOW,
          activatedBy: "system:billing-worker",
          createdAt: NOW,
        },
      });
    }

    const latestSnapshot = await tx.billingUsageSnapshot.findFirst({
      where: { workspaceId, periodMonth },
      orderBy: [{ version: "desc" }],
    });
    const version = (latestSnapshot?.version ?? 0) + 1;
    const snapshot = await tx.billingUsageSnapshot.create({
      data: {
        workspaceId,
        periodMonth,
        version,
        rateMinor: 99,
        configVersion: 1,
        qualifyingStudentCount: 1,
        chargeMinor: 99,
        billable: true,
        computedAt: NOW,
        createdBy: "test:billing",
      },
    });
    await tx.billingUsageStudent.create({
      data: {
        workspaceId,
        snapshotId: snapshot.id,
        periodMonth,
        version,
        studentId,
        markIds: [randomUUID()],
        createdAt: NOW,
      },
    });
    const usageEntry = await tx.billingLedgerEntry.create({
      data: {
        workspaceId,
        entryType: "usage_charge",
        direction: "debit",
        amountMinor: 99,
        currency: "EGP",
        periodMonth,
        snapshotVersion: version,
        studentId,
        sourceType: "billing_usage_snapshot",
        sourceId: snapshot.id,
        idempotencyKey: `test:usage:${key}`,
        createdBy: "test:billing",
        createdAt: NOW,
      },
    });
    const invoice = await tx.billingInvoice.create({
      data: {
        workspaceId,
        number: `KSH-TEST-${key.slice(0, 10).toUpperCase()}`,
        cycleKey: `test-${key}`,
        totalMinor: 99,
        currency: "EGP",
        issuedAt,
        configVersion: 1,
        thresholdMinorAtIssue: 99,
        createdBy: "test:billing",
      },
    });
    await tx.billingInvoiceLineItem.create({
      data: {
        workspaceId,
        invoiceId: invoice.id,
        ledgerEntryId: usageEntry.id,
        amountMinor: 99,
        position: 1,
        createdAt: NOW,
      },
    });
    await tx.billingLedgerEntry.create({
      data: {
        workspaceId,
        entryType: "invoice_allocation",
        direction: "credit",
        amountMinor: 99,
        currency: "EGP",
        periodMonth,
        sourceType: "billing_invoice",
        sourceId: invoice.id,
        idempotencyKey: `test:allocation:${key}`,
        createdBy: "test:billing",
        createdAt: NOW,
      },
    });
    let creditEntryId: string | null = null;
    if (preCredited) {
      const creditEntry = await tx.billingLedgerEntry.create({
        data: {
          workspaceId,
          entryType: "invoice_credit",
          direction: "credit",
          amountMinor: 99,
          currency: "EGP",
          periodMonth,
          sourceType: "test",
          sourceId: key,
          idempotencyKey: `test:credit-entry:${key}`,
          createdBy: "test:billing",
          createdAt: NOW,
        },
      });
      creditEntryId = creditEntry.id;
      await tx.billingInvoiceCredit.create({
        data: {
          workspaceId,
          invoiceId: invoice.id,
          ledgerEntryId: creditEntry.id,
          amountMinor: 99,
          reasonCode: "test",
          sourceType: "test",
          sourceId: key,
          idempotencyKey: `test:credit:${key}`,
          createdBy: "test:billing",
          createdAt: NOW,
        },
      });
    }
    const submission = await tx.billingPaymentSubmission.create({
      data: {
        workspaceId,
        invoiceId: invoice.id,
        referenceRaw: reference,
        referenceFingerprint: fingerprint,
        amountMinor: 99,
        currency: "EGP",
        transferredAt: NOW,
        status: "submitted",
        idempotencyKey: `test:submission:${key}`,
        submittedBy: fixturesScope().actorUserId,
        submittedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
    const exemption = await tx.billingExemption.create({
      data: {
        workspaceId,
        reason: "internal_testing",
        notes: null,
        startDate: exemptionDates.startDate,
        expiresOn: exemptionDates.expiresOn,
        status: "active",
        createdByAdminId: admin.adminRecordId,
        modifiedByAdminId: admin.adminRecordId,
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
    return {
      invoiceId: invoice.id,
      submissionId: submission.id,
      reference,
      fingerprint,
      studentId,
      creditEntryId,
      snapshotId: snapshot.id,
      exemptionId: exemption.id,
      usageEntryId: usageEntry.id,
      month: periodMonth,
    };
  });
}

const BILLING_TENANT_TABLES = TENANT_TABLES.filter((table) => table.includes("billing"));
const BILLING_TENANT_DELEGATES = [
  ["workspace_billing_state", "workspaceBillingState"],
  ["billing_exemption", "billingExemption"],
  ["billing_usage_snapshot", "billingUsageSnapshot"],
  ["billing_usage_student", "billingUsageStudent"],
  ["billing_ledger_entry", "billingLedgerEntry"],
  ["billing_invoice", "billingInvoice"],
  ["billing_invoice_line_item", "billingInvoiceLineItem"],
  ["billing_invoice_credit", "billingInvoiceCredit"],
  ["billing_payment_submission", "billingPaymentSubmission"],
  ["billing_review_event", "billingReviewEvent"],
] as const;

beforeAll(async () => {
  adminUser = await createTestUser("billing-admin");
  const record = await getDb().platformAdmin.create({
    data: {
      id: randomUUID(),
      userId: adminUser.id,
      grantReason: "billing remediation integration test",
      createdAt: NOW,
      updatedAt: NOW,
    },
  });
  admin = {
    brand: "platform_admin",
    adminRecordId: record.id,
    userId: adminUser.id,
    email: adminUser.email,
    displayName: "Billing Test Administrator",
    grantedAt: NOW.toISOString(),
  };
});

afterAll(async () => {
  await getDb().platformAdmin.updateMany({
    where: { userId: adminUser.id },
    data: { revokedAt: new Date() },
  });
  await deleteTestUser(adminUser);
  await disconnectDb();
});

describe("billing remediation against PostgreSQL RLS", () => {
  it("compensates a retroactive exemption with an invoice credit, never a rewritten invoice", async () => {
    const { workspaceId, scope } = await createBillingWorkspace(suffix());
    const key = suffix();
    const dates = uniqueExemptionDates(key);
    const fixture = await createInvoiceFixture(workspaceId, key, dates.month, {
      preCredited: false,
    });

    const before = await getTeacherBilling(scope, { month: dates.month }, NOW);
    const invoiceBefore = before.summary.invoices.find((invoice) => invoice.id === fixture.invoiceId);
    expect(invoiceBefore?.totalMinor).toBe(99);
    expect(invoiceBefore?.outstandingMinor).toBe(99);

    // The fixture's matching past exemption is revoked first so the same
    // unique past dates can be reused for a retroactive correction.
    await withScope({ workspaceId }, (tx) =>
      tx.billingExemption.update({
        where: { id: fixture.exemptionId },
        data: { status: "revoked", revokedOn: NOW, updatedAt: NOW },
      }),
    );
    const created = await createPlatformBillingExemption(
      admin,
      workspaceId,
      {
        reason: "beta_tester",
        startDate: dates.startDate,
        expiresOn: dates.expiresOn,
        reasonCode: "exemption_created",
      },
      META,
      NOW,
    );

    const entries = await withScope({ workspaceId }, (tx) =>
      tx.billingLedgerEntry.findMany({
        where: { workspaceId, sourceId: created.id },
        orderBy: [{ createdAt: "asc" }],
      }),
    );
    expect(entries.map((entry) => entry.entryType)).toEqual(["invoice_credit"]);
    expect(entries[0]?.studentId).toBe(fixture.studentId);
    const invoice = await withScope({ workspaceId }, (tx) =>
      tx.billingInvoice.findUniqueOrThrow({ where: { id: fixture.invoiceId } }),
    );
    expect(invoice.totalMinor).toBe(99);
    expect(invoice.cycleKey).toBe(`test-${key}`);
  });

  it("does not create excess credit when the invoiced usage was already settled", async () => {
    const { workspaceId, scope } = await createBillingWorkspace(suffix());
    const key = suffix();
    const dates = uniqueExemptionDates(key);
    const fixture = await createInvoiceFixture(workspaceId, key, dates.month, {
      preCredited: true,
    });
    await withScope({ workspaceId }, (tx) =>
      tx.billingExemption.update({
        where: { id: fixture.exemptionId },
        data: { status: "revoked", revokedOn: NOW, updatedAt: NOW },
      }),
    );

    const created = await createPlatformBillingExemption(
      admin,
      workspaceId,
      {
        reason: "beta_tester",
        startDate: dates.startDate,
        expiresOn: dates.expiresOn,
        reasonCode: "exemption_created",
      },
      META,
      NOW,
    );
    const ledgerEntries = await withScope({ workspaceId }, (tx) =>
      tx.billingLedgerEntry.findMany({
        where: { workspaceId, sourceId: created.id },
      }),
    );
    const credits = await withScope({ workspaceId }, (tx) =>
      tx.billingInvoiceCredit.findMany({
        where: { workspaceId, sourceId: created.id },
      }),
    );
    expect(ledgerEntries).toHaveLength(0);
    expect(credits).toHaveLength(0);
    const invoice = await withScope({ workspaceId }, (tx) =>
      tx.billingInvoice.findUniqueOrThrow({ where: { id: fixture.invoiceId } }),
    );
    expect(invoice.totalMinor).toBe(99);
    const summary = await getTeacherBilling(scope, { month: dates.month }, NOW);
    expect(summary.summary.availableCreditMinor).toBe(0);
  });

  it("caps a retroactive invoice credit at the remaining outstanding balance", async () => {
    const { workspaceId, scope } = await createBillingWorkspace(suffix());
    const key = suffix();
    const dates = uniqueExemptionDates(key);
    const fixture = await createInvoiceFixture(workspaceId, key, dates.month, {
      preCredited: false,
    });
    await createPlatformBillingAdjustment(
      admin,
      {
        workspaceId,
        direction: "credit",
        amountMinor: 40,
        reasonCode: "manual_adjustment",
        idempotencyKey: `partial-credit:${randomUUID()}`,
      },
      META,
      NOW,
    );
    await withScope({ workspaceId }, (tx) =>
      tx.billingExemption.update({
        where: { id: fixture.exemptionId },
        data: { status: "revoked", revokedOn: NOW, updatedAt: NOW },
      }),
    );

    const created = await createPlatformBillingExemption(
      admin,
      workspaceId,
      {
        reason: "internal_testing",
        startDate: dates.startDate,
        expiresOn: dates.expiresOn,
        reasonCode: "exemption_created",
      },
      META,
      NOW,
    );
    const credit = await withScope({ workspaceId }, (tx) =>
      tx.billingInvoiceCredit.findFirstOrThrow({
        where: { workspaceId, sourceId: created.id, invoiceId: fixture.invoiceId },
      }),
    );
    expect(credit.amountMinor).toBe(59);
    const summary = await getTeacherBilling(scope, { month: dates.month }, NOW);
    expect(summary.summary.availableCreditMinor).toBe(0);
    expect(
      summary.summary.invoices.find((invoice) => invoice.id === fixture.invoiceId)?.outstandingMinor,
    ).toBe(0);
  });

  it("allocates a manual credit oldest-first and records each application", async () => {
    const { workspaceId, scope } = await createBillingWorkspace(suffix());
    const older = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    const first = await createInvoiceFixture(workspaceId, suffix(), MONTH, {
      issuedAt: older,
      preCredited: false,
    });
    const second = await createInvoiceFixture(workspaceId, suffix(), "2025-12", {
      preCredited: false,
    });

    const adjustment = await createPlatformBillingAdjustment(
      admin,
      {
        workspaceId,
        direction: "credit",
        amountMinor: 250,
        reasonCode: "manual_adjustment",
        idempotencyKey: `manual-credit:${randomUUID()}`,
      },
      META,
      NOW,
    );

    const credits = await withScope({ workspaceId }, (tx) =>
      tx.billingInvoiceCredit.findMany({
        where: {
          workspaceId,
          ledgerEntryId: adjustment.id,
          invoiceId: { in: [first.invoiceId, second.invoiceId] },
          reasonCode: "manual_adjustment",
        },
        orderBy: [{ invoice: { issuedAt: "asc" } }],
      }),
    );
    expect(credits).toHaveLength(2);
    expect(credits.map((credit) => credit.invoiceId)).toEqual([
      first.invoiceId,
      second.invoiceId,
    ]);
    expect(credits.map((credit) => credit.amountMinor)).toEqual([99, 99]);

    const summary = await getTeacherBilling(scope, { month: MONTH }, NOW);
    expect(summary.summary.availableCreditMinor).toBe(52);
    expect(summary.summary.unbilledMinor).toBe(0);
  });

  it("releases a disputed reference, reverses only its payment, and reclaims it on approval", async () => {
    const { workspaceId } = await createBillingWorkspace(suffix());
    const key = suffix();
    const first = await createInvoiceFixture(workspaceId, key, MONTH);
    await reviewPlatformBillingSubmission(
      admin,
      workspaceId,
      first.submissionId,
      {
        action: "approved",
        noteCode: null,
        reasonCode: "review_decision",
        idempotencyKey: `approve:${randomUUID()}`,
      },
      META,
      NOW,
    );

    await releasePlatformBillingReference(
      admin,
      {
        workspaceId,
        submissionId: first.submissionId,
        reasonCode: "duplicate_reported",
      },
      META,
      NOW,
    );

    const afterRelease = await withScope({ workspaceId }, async (tx) => ({
      registry: await tx.billingReferenceFingerprint.findUniqueOrThrow({
        where: { fingerprint: first.fingerprint },
      }),
      reversal: await tx.billingLedgerEntry.findFirst({
        where: {
          workspaceId,
          entryType: "payment_reversal",
          sourceId: first.submissionId,
        },
      }),
    }));
    expect(afterRelease.registry.status).toBe("revoked");
    expect(afterRelease.reversal?.direction).toBe("debit");
    expect(afterRelease.reversal?.amountMinor).toBe(99);

    const secondKey = suffix();
    const second = await createInvoiceFixture(workspaceId, secondKey, "2025-11", {
      reference: first.reference,
    });
    const reclaimed = await reviewPlatformBillingSubmission(
      admin,
      workspaceId,
      second.submissionId,
      {
        action: "approved",
        noteCode: null,
        reasonCode: "review_decision",
        idempotencyKey: `approve:${randomUUID()}`,
      },
      META,
      NOW,
    );
    expect(reclaimed.id).toBe(second.submissionId);
    const registry = await getDb().billingReferenceFingerprint.findUniqueOrThrow({
      where: { fingerprint: first.fingerprint },
    });
    expect(registry.status).toBe("active");
    expect(registry.submissionId).toBe(second.submissionId);
    const events = await getDb().billingReferenceEvent.findMany({
      where: { fingerprint: first.fingerprint },
      orderBy: [{ createdAt: "asc" }],
    });
    expect(events.map((event) => event.eventType)).toEqual(["claimed", "released", "reclaimed"]);
  });

  it("replays a review key only for the same submission and action", async () => {
    const { workspaceId } = await createBillingWorkspace(suffix());
    const fixture = await createInvoiceFixture(workspaceId, suffix(), MONTH);
    const review = {
      noteCode: null,
      reasonCode: "review_decision" as const,
      idempotencyKey: `review:${randomUUID()}`,
    };
    const first = await reviewPlatformBillingSubmission(
      admin,
      workspaceId,
      fixture.submissionId,
      { ...review, action: "under_review" },
      META,
      NOW,
    );
    const replay = await reviewPlatformBillingSubmission(
      admin,
      workspaceId,
      fixture.submissionId,
      { ...review, action: "under_review" },
      META,
      NOW,
    );
    expect(replay.id).toBe(first.id);
    const eventsAfterReplay = await withScope({ workspaceId }, (tx) =>
      tx.billingReviewEvent.count({ where: { submissionId: fixture.submissionId } }),
    );
    expect(eventsAfterReplay).toBe(1);

    await reviewPlatformBillingSubmission(
      admin,
      workspaceId,
      fixture.submissionId,
      { ...review, action: "approved" },
      META,
      NOW,
    );
    const eventsAfterAction = await withScope({ workspaceId }, (tx) =>
      tx.billingReviewEvent.count({ where: { submissionId: fixture.submissionId } }),
    );
    expect(eventsAfterAction).toBe(2);
  });

  it("rechecks admin status inside the mutation transaction", async () => {
    const configInput = {
      thresholdMinor: 5000,
      instapayHandle: "admin-recheck@kashkol.test",
      instapayLink: "https://instapay.example.test/verify",
      reasonCode: "config_change" as const,
    };
    await expect(updatePlatformBillingConfig(admin, configInput, META, NOW)).resolves.toMatchObject({
      instapayHandle: configInput.instapayHandle,
    });
    await getDb().platformAdmin.update({
      where: { id: admin.adminRecordId },
      data: { revokedAt: NOW, updatedAt: NOW },
    });
    try {
      await expect(
        updatePlatformBillingConfig(admin, configInput, META, NOW),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await getDb().platformAdmin.update({
        where: { id: admin.adminRecordId },
        data: { revokedAt: null, updatedAt: NOW },
      });
    }
  });

  it("appends one config version for the same logical change", async () => {
    const handle = `idempotent-${suffix()}@kashkol.test`;
    const input = {
      thresholdMinor: 5100,
      instapayHandle: handle,
      instapayLink: `https://instapay.example.test/${suffix()}`,
      reasonCode: "config_change" as const,
    };
    const first = await updatePlatformBillingConfig(admin, input, META, NOW);
    const replay = await updatePlatformBillingConfig(admin, input, META, NOW);
    expect(replay.id).toBe(first.id);
    expect(replay.version).toBe(first.version);
    const rows = await getDb().billingConfig.findMany({ where: { instapayHandle: handle } });
    expect(rows).toHaveLength(1);

    const changed = await updatePlatformBillingConfig(
      admin,
      { ...input, thresholdMinor: 5200 },
      META,
      NOW,
    );
    expect(changed.id).not.toBe(first.id);
    expect(changed.version).toBeGreaterThan(first.version);
  });

  it("refuses to extend an already-expired exemption into billable days", async () => {
    const { workspaceId } = await createBillingWorkspace(suffix());
    const created = await createPlatformBillingExemption(
      admin,
      workspaceId,
      {
        reason: "internal_testing",
        startDate: "2026-10-01",
        expiresOn: "2026-10-02",
        reasonCode: "exemption_created",
      },
      META,
      NOW,
    );

    await expect(
      updatePlatformBillingExemption(
        admin,
        workspaceId,
        created.id,
        { expiresOn: "2026-12-31", reasonCode: "exemption_updated" },
        META,
        NOW,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const stored = await withScope({ workspaceId }, (tx) =>
      tx.billingExemption.findUniqueOrThrow({ where: { id: created.id } }),
    );
    expect(stored.status).toBe("expired");
    expect(stored.expiresOn).toBe("2026-10-02");
  });

  it("signals truncated admin lists while keeping every workspace in the selector", async () => {
    const first = await createBillingWorkspace(suffix());
    const second = await createBillingWorkspace(suffix());
    await createInvoiceFixture(first.workspaceId, suffix(), "2097-01");
    await createInvoiceFixture(second.workspaceId, suffix(), "2097-02");
    const overview = await getPlatformBillingOverview(admin, { limit: 1 }, "en-US");
    expect(overview.workspaces.map((workspace) => workspace.id)).toEqual(
      expect.arrayContaining([first.workspaceId, second.workspaceId]),
    );
    expect(overview.exemptionsTruncated).toBe(true);
    expect(overview.submissionsTruncated).toBe(true);
  });

  it("isolates every tenant billing table under RLS", async () => {
    // A disposable workspace keeps every table's fixture local to this run;
    // shared fixture rows from earlier runs cannot satisfy the assertions.
    const { workspaceId } = await createBillingWorkspace(suffix());
    const fixture = await createInvoiceFixture(workspaceId, suffix(), "2099-01");
    await withScope({ workspaceId }, (tx) =>
      tx.billingReviewEvent.create({
        data: {
          workspaceId,
          submissionId: fixture.submissionId,
          action: "under_review",
          noteCode: null,
          actorUserId: fixturesScope().actorUserId,
          actorDisplayName: fixturesScope().actorDisplayName,
          actorType: "user",
          createdAt: NOW,
        },
      }),
    );

    expect(new Set(BILLING_TENANT_DELEGATES.map(([table]) => table))).toEqual(
      new Set(BILLING_TENANT_TABLES),
    );
    type Delegate = {
      findMany: (args: { where: { workspaceId: string } }) => Promise<unknown[]>;
    };
    for (const [table, delegateName] of BILLING_TENANT_DELEGATES) {
      const crossTenant = await withScope({ workspaceId: DELTA }, (tx) => {
        const delegate = (tx as unknown as Record<string, Delegate>)[delegateName];
        return delegate.findMany({ where: { workspaceId } });
      });
      expect(crossTenant, `${table} leaked across tenants`).toHaveLength(0);

      const ownTenant = await withScope({ workspaceId }, (tx) => {
        const delegate = (tx as unknown as Record<string, Delegate>)[delegateName];
        return delegate.findMany({ where: { workspaceId } });
      });
      expect(ownTenant.length, `${table} fixture was not written`).toBeGreaterThan(0);

      const unscoped = getDb() as unknown as Record<string, Delegate>;
      await expect(unscoped[delegateName].findMany({ where: { workspaceId } })).resolves.toHaveLength(0);
    }

    // The reference registry and its event log are global by design. They must
    // never carry the raw reference, which stays in the RLS-protected submission.
    const registry = await getDb().billingReferenceFingerprint.create({
      data: {
        fingerprint: fixture.fingerprint,
        workspaceId,
        submissionId: fixture.submissionId,
        status: "active",
        createdAt: NOW,
      },
    });
    await getDb().billingReferenceEvent.create({
      data: {
        fingerprint: fixture.fingerprint,
        eventType: "claimed",
        workspaceId,
        submissionId: fixture.submissionId,
        actorUserId: fixturesScope().actorUserId,
        reasonCode: "review_decision",
        createdAt: NOW,
      },
    });
    expect(registry.fingerprint).toBe(fixture.fingerprint);
    expect(JSON.stringify(registry)).not.toContain(fixture.reference);
    const events = await getDb().billingReferenceEvent.findMany({
      where: { fingerprint: fixture.fingerprint },
    });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(fixture.reference);
  });

  it("runs concurrent billing cycles without double-charging a qualifying student", async () => {
    const key = suffix();
    // A fresh workspace keeps the cycle assertion repeatable: no prior run can
    // have issued the current month's invoice for this tenant.
    const { workspaceId, scope } = await createBillingWorkspace(key);

    const studentId = await createStudent(workspaceId, "Cycle", key);
    await withScope({ workspaceId }, async (tx) => {
      const group = await tx.group.create({
        data: { workspaceId, name: `Cycle ${key}`, color: "indigo" },
      });
      // Two distinct marks on different sessions are required to qualify a
      // student for the month; the unique constraint prevents two on one session.
      for (const mark of ["present", "late"] as const) {
        const session = await tx.teachingSession.create({
          data: {
            workspaceId,
            groupId: group.id,
            startsAt: new Date(NOW.getTime() + (mark === "late" ? 60_000 : 0)),
            status: "completed",
          },
        });
        await tx.attendanceMark.create({
          data: {
            workspaceId,
            sessionId: session.id,
            studentId,
            mark,
            recordedBy: scope.actorUserId,
            createdAt: NOW,
          },
        });
      }
    });

    const attempts = await Promise.allSettled([
      runBillingCycleForWorkspace(workspaceId, NOW),
      runBillingCycleForWorkspace(workspaceId, NOW),
    ]);
    expect(attempts.map((attempt) => attempt.status)).toEqual(["fulfilled", "fulfilled"]);

    const charges = await withScope({ workspaceId }, (tx) =>
      tx.billingLedgerEntry.findMany({
        where: {
          workspaceId,
          entryType: "usage_charge",
          studentId,
          periodMonth: MONTH,
        },
      }),
    );
    expect(charges).toHaveLength(1);
    expect(charges[0]?.amountMinor).toBe(99);
  });
});
