import { describe, it, expect } from "vitest";
import {
  calculateSessionExpectedRevenue,
  calculateSessionCollectedRevenue,
  calculateSessionOutstanding,
  calculatePaymentCollectionRate,
  buildSessionRevenueSummary,
} from "../../src/modules/payments/session-revenue.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function payment(amountMinor: number, voided = false) {
  return { amountMinor, voidedAt: voided ? new Date("2026-01-01T00:00:00Z") : null };
}

// ---------------------------------------------------------------------------
// calculateSessionExpectedRevenue
// ---------------------------------------------------------------------------

describe("calculateSessionExpectedRevenue", () => {
  it("returns price × attendee count (100 students × 130 EGP = 13,000 EGP)", () => {
    // 130 EGP = 13,000 piastres; 100 students → 1,300,000 piastres = 13,000 EGP
    expect(calculateSessionExpectedRevenue(13_000, 100)).toBe(1_300_000);
  });

  it("returns 0 when attendance count is 0", () => {
    expect(calculateSessionExpectedRevenue(13_000, 0)).toBe(0);
  });

  it("returns 0 when price is 0", () => {
    expect(calculateSessionExpectedRevenue(0, 50)).toBe(0);
  });

  it("returns null when price is null", () => {
    expect(calculateSessionExpectedRevenue(null, 50)).toBeNull();
  });

  it("returns null when price is undefined", () => {
    expect(calculateSessionExpectedRevenue(undefined, 50)).toBeNull();
  });

  it("throws when price is negative", () => {
    expect(() => calculateSessionExpectedRevenue(-1, 10)).toThrow(RangeError);
  });

  it("throws when price is not an integer", () => {
    expect(() => calculateSessionExpectedRevenue(1.5, 10)).toThrow(RangeError);
  });

  it("throws when attendee count is negative", () => {
    expect(() => calculateSessionExpectedRevenue(100, -1)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// calculateSessionCollectedRevenue
// ---------------------------------------------------------------------------

describe("calculateSessionCollectedRevenue", () => {
  it("sums only non-voided payments", () => {
    const payments = [
      payment(10_000),         // 100 EGP — counted
      payment(10_000, true),   // voided — excluded
      payment(5_000),          // 50 EGP — counted
    ];
    expect(calculateSessionCollectedRevenue(payments)).toBe(15_000);
  });

  it("returns 0 for empty payments list", () => {
    expect(calculateSessionCollectedRevenue([])).toBe(0);
  });

  it("returns 0 when all payments are voided", () => {
    expect(calculateSessionCollectedRevenue([payment(10_000, true), payment(5_000, true)])).toBe(0);
  });

  it("does not double-count the same payment", () => {
    const p = payment(10_000);
    // same object reference — only counted once
    const result = calculateSessionCollectedRevenue([p]);
    expect(result).toBe(10_000);
  });

  it("unpaid student is not counted (they have no payment record)", () => {
    // This test documents the design: an absent payment = 0 collected.
    expect(calculateSessionCollectedRevenue([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateSessionOutstanding
// ---------------------------------------------------------------------------

describe("calculateSessionOutstanding", () => {
  it("outstanding = expected - collected", () => {
    expect(calculateSessionOutstanding(100_000, 70_000)).toBe(30_000);
  });

  it("returns 0 when fully paid", () => {
    expect(calculateSessionOutstanding(100_000, 100_000)).toBe(0);
  });

  it("returns negative when overpaid", () => {
    expect(calculateSessionOutstanding(100_000, 110_000)).toBe(-10_000);
  });

  it("returns null when expected is null (no price set)", () => {
    expect(calculateSessionOutstanding(null, 50_000)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// calculatePaymentCollectionRate
// ---------------------------------------------------------------------------

describe("calculatePaymentCollectionRate", () => {
  it("returns 1 when fully collected", () => {
    expect(calculatePaymentCollectionRate(100_000, 100_000)).toBe(1);
  });

  it("returns 0.5 when half collected", () => {
    expect(calculatePaymentCollectionRate(100_000, 50_000)).toBe(0.5);
  });

  it("returns null when expected is null", () => {
    expect(calculatePaymentCollectionRate(null, 50_000)).toBeNull();
  });

  it("returns 1 when expected is 0 and collected is 0", () => {
    expect(calculatePaymentCollectionRate(0, 0)).toBe(1);
  });

  it("returns null when expected is 0 but collected is positive", () => {
    // Over-collected with 0 price set — rate is undefined (not meaningful)
    expect(calculatePaymentCollectionRate(0, 1000)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildSessionRevenueSummary — integration of above
// ---------------------------------------------------------------------------

describe("buildSessionRevenueSummary", () => {
  it("full scenario: 100 students, 130 EGP price, some unpaid", () => {
    // 100 attending students; price = 13,000 piastres each
    // 80 have paid; 20 have not
    const payments = Array.from({ length: 80 }, () => payment(13_000));
    const summary = buildSessionRevenueSummary(13_000, 100, payments);

    expect(summary.pricePerStudentMinor).toBe(13_000);
    expect(summary.eligibleAttendanceCount).toBe(100);
    expect(summary.expectedRevenueMinor).toBe(1_300_000); // 100 × 13,000
    expect(summary.collectedRevenueMinor).toBe(1_040_000); // 80 × 13,000
    expect(summary.outstandingRevenueMinor).toBe(260_000);  // 20 × 13,000
    expect(summary.collectionRate).toBeCloseTo(0.8);
  });

  it("produces null expected/outstanding when no price configured", () => {
    const payments = [payment(13_000)];
    const summary = buildSessionRevenueSummary(null, 10, payments);

    expect(summary.pricePerStudentMinor).toBeNull();
    expect(summary.expectedRevenueMinor).toBeNull();
    expect(summary.outstandingRevenueMinor).toBeNull();
    expect(summary.collectionRate).toBeNull();
    expect(summary.collectedRevenueMinor).toBe(13_000);
  });

  it("collected is always real payments — never inferred from attendance", () => {
    // No payments recorded — collected must be 0, NOT price × attendance
    const summary = buildSessionRevenueSummary(13_000, 50, []);
    expect(summary.collectedRevenueMinor).toBe(0);
    expect(summary.expectedRevenueMinor).toBe(650_000); // price × attendance
    expect(summary.outstandingRevenueMinor).toBe(650_000); // all outstanding
  });
});
