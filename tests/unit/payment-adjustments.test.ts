import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAdjustmentTx, withScope, writeAuditEvent } = vi.hoisted(() => ({
  createAdjustmentTx: vi.fn(),
  withScope: vi.fn(),
  writeAuditEvent: vi.fn(),
}));

vi.mock("@/modules/payments/repository", () => ({
  createAdjustmentTx,
  createFeeRuleTx: vi.fn(),
  createPaymentTx: vi.fn(),
  loadPaymentDashboard: vi.fn(),
}));
vi.mock("@/lib/db/scope", () => ({ withScope }));
vi.mock("@/modules/audit/service", () => ({ writeAuditEvent }));

import { AppError } from "@/lib/http/errors";
import { createPaymentAdjustment } from "@/modules/payments/service";
import { createAdjustmentSchema } from "@/modules/payments/schemas";
import type { Scope } from "@/modules/tenancy/types";

const owner: Scope = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  actorUserId: "10000000-0000-4000-8000-000000000001",
  actorDisplayName: "Owner",
  role: "owner",
  permissions: new Set(),
};

const refundInput = createAdjustmentSchema.parse({
  kind: "refund",
  studentId: "00000000-0000-4000-8000-000000000002",
  paymentId: "00000000-0000-4000-8000-000000000003",
  amount: "12.34",
  paidOn: "2026-10-29",
  reason: "Returned part of the receipt",
  idempotencyKey: "00000000-0000-4000-8000-000000000004",
});

beforeEach(() => {
  vi.clearAllMocks();
  withScope.mockImplementation(async (_scope, callback) => callback({}));
  createAdjustmentTx.mockResolvedValue({
    adjustment: { id: "adjustment-1", amountMinor: 1234, balanceImpact: 1 },
    duplicate: false,
    matches: true,
  });
});

describe("auditable payment adjustments", () => {
  it("writes the refund with its reason and audits the new adjustment atomically", async () => {
    const result = await createPaymentAdjustment(owner, refundInput, { requestId: "request-1" });

    expect(result.duplicate).toBe(false);
    expect(createAdjustmentTx).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        kind: "refund",
        amountMinor: 1234,
        reason: "Returned part of the receipt",
        createdBy: owner.actorUserId,
      }),
    );
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        action: "payment.refund_recorded",
        entityType: "payment_adjustment",
      }),
    );
  });

  it("does not create another audit event when an adjustment request is an exact retry", async () => {
    createAdjustmentTx.mockResolvedValue({
      adjustment: { id: "adjustment-1", amountMinor: 1234, balanceImpact: 1 },
      duplicate: true,
      matches: true,
    });

    const result = await createPaymentAdjustment(owner, refundInput);

    expect(result.duplicate).toBe(true);
    expect(writeAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects refunds that exceed the remaining receipt amount", async () => {
    createAdjustmentTx.mockResolvedValue({ refundExceedsReceived: true });

    await expect(createPaymentAdjustment(owner, refundInput)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    } satisfies Partial<AppError>);
    expect(writeAuditEvent).not.toHaveBeenCalled();
  });

  it("denies assistants without payment-write permission before touching the ledger", async () => {
    await expect(
      createPaymentAdjustment(
        { ...owner, actorUserId: "10000000-0000-4000-8000-000000000005", role: "assistant" },
        refundInput,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(createAdjustmentTx).not.toHaveBeenCalled();
  });
});
