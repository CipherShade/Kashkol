import { describe, it, expect } from "vitest";
import {
  calculateSessionCollectedRevenue,
  buildSessionRevenueSummary,
} from "../../src/modules/payments/session-revenue.js";

function receipt(amountMinor: number) {
  return { amountMinor };
}

describe("calculateSessionCollectedRevenue", () => {
  it("sums the collected receipts recorded for a session", () => {
    expect(calculateSessionCollectedRevenue([receipt(10_000), receipt(5_000)])).toBe(15_000);
  });

  it("returns 0 for an empty receipt set", () => {
    expect(calculateSessionCollectedRevenue([])).toBe(0);
  });

  it("has no reversal, expected, or attendance input", () => {
    const input = receipt(10_000);
    expect(input).not.toHaveProperty("voidedAt");
    expect(input).not.toHaveProperty("presentCount");
    expect(calculateSessionCollectedRevenue([input])).toBe(10_000);
  });
});

describe("buildSessionRevenueSummary", () => {
  it("contains only the collected total", () => {
    const summary = buildSessionRevenueSummary([receipt(1_300_000)]);
    expect(summary).toEqual({ collectedRevenueMinor: 1_300_000 });
    expect(summary).not.toHaveProperty("expectedRevenueMinor");
    expect(summary).not.toHaveProperty("outstandingRevenueMinor");
    expect(summary).not.toHaveProperty("collectionRate");
    expect(summary).not.toHaveProperty("pricePerStudentMinor");
    expect(summary).not.toHaveProperty("eligibleAttendanceCount");
  });

  it("never infers money from attendance or a session price", () => {
    expect(buildSessionRevenueSummary([])).toEqual({ collectedRevenueMinor: 0 });
  });
});
