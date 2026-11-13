import { describe, it, expect } from "vitest";
import {
  calculateSessionExpectedRevenue,
  calculateSessionCollectedRevenue,
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

  it("unreceipted session is not counted (it has no payment record)", () => {
    // This test documents the design: no receipt = 0 collected.
    expect(calculateSessionCollectedRevenue([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildSessionRevenueSummary — integration of above
// ---------------------------------------------------------------------------

describe("buildSessionRevenueSummary", () => {
  it("full scenario: 100 students, 130 EGP price, one session receipt recorded", () => {
    // 100 attending students; price = 13,000 piastres each; expected = 1,300,000
    // Exactly one receipt covering the session → collected is the receipt amount,
    // never inferred from attendance.
    const payments = [payment(1_300_000)];
    const summary = buildSessionRevenueSummary(13_000, 100, payments);

    expect(summary.pricePerStudentMinor).toBe(13_000);
    expect(summary.eligibleAttendanceCount).toBe(100);
    expect(summary.expectedRevenueMinor).toBe(1_300_000); // 100 × 13,000
    expect(summary.collectedRevenueMinor).toBe(1_300_000);
    expect(summary).not.toHaveProperty("outstandingRevenueMinor");
    expect(summary).not.toHaveProperty("collectionRate");
  });

  it("produces null expected when no price configured", () => {
    const payments = [payment(13_000)];
    const summary = buildSessionRevenueSummary(null, 10, payments);

    expect(summary.pricePerStudentMinor).toBeNull();
    expect(summary.expectedRevenueMinor).toBeNull();
    expect(summary.collectedRevenueMinor).toBe(13_000);
  });

  it("collected is always real payments — never inferred from attendance", () => {
    // No payments recorded — collected must be 0, NOT price × attendance
    const summary = buildSessionRevenueSummary(13_000, 50, []);
    expect(summary.collectedRevenueMinor).toBe(0);
    expect(summary.expectedRevenueMinor).toBe(650_000); // price × attendance
  });
});
