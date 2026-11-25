import { describe, expect, it } from "vitest";

/**
 * ADR-0041 removed discounts, refunds, corrections, and fee rules. These
 * assertions keep the removed capabilities from quietly returning to the
 * payments module surface.
 */
describe("no money adjustments or fee rules", () => {
  it("exports no adjustment or fee-rule service operation", async () => {
    const service = await import("@/modules/payments/service");
    expect(service).not.toHaveProperty("createPaymentAdjustment");
    expect(service).not.toHaveProperty("createFeeRule");
  });

  it("exports no adjustment or fee-rule schema", async () => {
    const schemas = await import("@/modules/payments/schemas");
    expect(schemas).not.toHaveProperty("createAdjustmentSchema");
    expect(schemas).not.toHaveProperty("createFeeRuleSchema");
  });

  it("exports no adjustment or fee-rule repository operation", async () => {
    const repository = await import("@/modules/payments/repository");
    expect(repository).not.toHaveProperty("createAdjustmentTx");
    expect(repository).not.toHaveProperty("createFeeRuleTx");
    expect(repository).not.toHaveProperty("voidPaymentTx");
  });
});
