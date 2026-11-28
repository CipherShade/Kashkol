import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, disconnectDb } from "@/lib/db/client";
import { resetServerEnvForTests } from "@/lib/config/env";
import { withScope } from "@/lib/db/scope";
import { getFileStorageAdapter } from "@/modules/files/adapters";
import { uploadBillingEvidence } from "@/modules/billing/service";
import { getPlatformBillingEvidenceDownload } from "@/modules/billing/service";
import type { PlatformAdminContext } from "@/modules/platform-admin/service";
import { transactionReferenceFingerprint } from "@/modules/billing/reference";
import {
  FIXTURES,
  createTestUser,
  deleteTestUser,
  fixturesScope,
  type TestUser,
} from "./helpers";

const storageRead = vi.hoisted(() => ({ fail: false }));

vi.mock("@/modules/files/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/files/adapters")>();
  return {
    ...actual,
    getMalwareScanAdapter: () => ({ scan: async () => ({ clean: true as const }) }),
  };
});

vi.mock("@/modules/files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/files")>();
  return {
    ...actual,
    readStoredFileForDownload: async (
      input: Parameters<typeof actual.readStoredFileForDownload>[0],
    ) => {
      if (storageRead.fail) throw new Error("storage read unavailable");
      return actual.readStoredFileForDownload(input);
    },
  };
});

const NOW = new Date("2026-11-15T10:00:00.000Z");
const META = { requestId: "billing-evidence-test" };

let adminUser: TestUser;
let admin: PlatformAdminContext;
let storageKey: string | null = null;

beforeAll(async () => {
  process.env.FILE_STORAGE_DRIVER = "local";
  process.env.CLAMAV_HOST = "127.0.0.1";
  resetServerEnvForTests();
  adminUser = await createTestUser("billing-evidence-admin");
  const record = await getDb().platformAdmin.create({
    data: {
      id: randomUUID(),
      userId: adminUser.id,
      grantReason: "billing evidence integration test",
      createdAt: NOW,
      updatedAt: NOW,
    },
  });
  admin = {
    brand: "platform_admin",
    adminRecordId: record.id,
    userId: adminUser.id,
    email: adminUser.email,
    displayName: "Billing Evidence Administrator",
    grantedAt: NOW.toISOString(),
  };
});

afterAll(async () => {
  if (storageKey) await getFileStorageAdapter().delete(storageKey);
  await getDb().platformAdmin.updateMany({
    where: { userId: adminUser.id },
    data: { revokedAt: new Date() },
  });
  await deleteTestUser(adminUser);
  await disconnectDb();
});

describe("billing evidence upload and authenticated download", () => {
  it("stores scanned evidence under the allowed key, streams it, and audits only after reading", async () => {
    const body = Buffer.from("%PDF-1.4\n%%EOF");
    const uploaded = await uploadBillingEvidence(
      fixturesScope(),
      {
        body,
        mime: "application/pdf",
        filename: "instapay-proof.pdf",
        sizeBytes: body.byteLength,
      },
      META,
    );
    expect(uploaded.scanStatus).toBe("clean");

    const file = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.file.findUniqueOrThrow({ where: { id: uploaded.fileId } }),
    );
    expect(file.scope).toBe("billing_evidence");
    expect(file.storageKey).toMatch(
      /^ws\/[0-9a-f-]+\/billing-evidence\/[0-9a-f-]+\.pdf$/u,
    );
    storageKey = file.storageKey;

    const fixtureKey = randomUUID();
    const submission = await withScope({ workspaceId: FIXTURES }, async (tx) => {
      const invoice = await tx.billingInvoice.create({
        data: {
          workspaceId: FIXTURES,
          number: `KSH-EVID-${fixtureKey.slice(0, 8).toUpperCase()}`,
          cycleKey: `evidence-${fixtureKey}`,
          totalMinor: 99,
          currency: "EGP",
          issuedAt: NOW,
          configVersion: 1,
          thresholdMinorAtIssue: 99,
          createdBy: "test:billing-evidence",
        },
      });
      return tx.billingPaymentSubmission.create({
        data: {
          workspaceId: FIXTURES,
          invoiceId: invoice.id,
          referenceRaw: `EVIDENCE-${fixtureKey}`,
          referenceFingerprint: transactionReferenceFingerprint(`EVIDENCE-${fixtureKey}`),
          amountMinor: 99,
          currency: "EGP",
          transferredAt: NOW,
          status: "submitted",
          evidenceFileId: file.id,
          idempotencyKey: `evidence:${fixtureKey}`,
          submittedBy: fixturesScope().actorUserId,
          submittedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW,
        },
      });
    });

    const auditWhere = {
      workspaceId: FIXTURES,
      entityType: "billing_payment_submission",
      entityId: submission.id,
      action: "billing.evidence.viewed",
    };
    const before = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.auditEvent.count({ where: auditWhere }),
    );

    const download = await getPlatformBillingEvidenceDownload(
      admin,
      { workspaceId: FIXTURES },
      submission.id,
      META,
      NOW,
    );
    expect(download.bytes.byteLength).toBeGreaterThan(0);
    expect(download.filename).toMatch(/\.(pdf|png|jpe?g)$/u);
    const after = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.auditEvent.count({ where: auditWhere }),
    );
    expect(after).toBe(before + 1);

    storageRead.fail = true;
    try {
      await expect(
        getPlatformBillingEvidenceDownload(
          admin,
          { workspaceId: FIXTURES },
          submission.id,
          META,
          NOW,
        ),
      ).rejects.toThrow("storage read unavailable");
      const afterFailure = await withScope({ workspaceId: FIXTURES }, (tx) =>
        tx.auditEvent.count({ where: auditWhere }),
      );
      expect(afterFailure).toBe(after);
    } finally {
      storageRead.fail = false;
    }
  });
});
