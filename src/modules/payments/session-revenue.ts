/**
 * Session-based revenue calculations.
 *
 * All functions are pure — no database access, no side effects.
 * Input amounts are always in minor currency units (piastres for EGP).
 *
 * Separation of concerns (NF-1 — no fabricated statistics):
 *   - expectedRevenue: what SHOULD be collected if all eligible students pay
 *   - collectedRevenue: what HAS been received (non-voided payments)
 *   - outstandingRevenue: the gap between expected and collected
 *
 * The system must NEVER report expected revenue as collected cash.
 */

/** How many present/eligible students attended a session. */
export type EligibleAttendanceCount = number;

/** A minimal shape of a payment row sufficient for revenue calculations. */
export type PaymentForRevenue = {
  amountMinor: number;
  voidedAt: Date | string | null;
};

/**
 * Calculate how much revenue a session is expected to generate.
 *
 * Expected revenue = price per student × number of eligible attending students.
 *
 * "Eligible" means present or late (not absent or excused).
 * If the session has no price set, expected revenue is null (unknown).
 */
export function calculateSessionExpectedRevenue(
  pricePerStudentMinor: number | null | undefined,
  eligibleAttendanceCount: EligibleAttendanceCount,
): number | null {
  if (pricePerStudentMinor == null) return null;
  if (pricePerStudentMinor < 0) throw new RangeError("pricePerStudentMinor must be ≥ 0");
  if (!Number.isInteger(pricePerStudentMinor))
    throw new RangeError("pricePerStudentMinor must be an integer (minor units)");
  if (eligibleAttendanceCount < 0) throw new RangeError("eligibleAttendanceCount must be ≥ 0");
  return pricePerStudentMinor * eligibleAttendanceCount;
}

/**
 * Calculate how much revenue has actually been collected for a session.
 *
 * Collected = sum of all non-voided payment amounts linked to this session.
 * Voided payments are excluded — they represent reversed/cancelled transactions.
 */
export function calculateSessionCollectedRevenue(payments: PaymentForRevenue[]): number {
  return payments.reduce((sum, p) => {
    if (p.voidedAt != null) return sum; // voided — excluded
    return sum + p.amountMinor;
  }, 0);
}

/**
 * Calculate how much revenue is still outstanding for a session.
 *
 * Outstanding = expected − collected.
 * Returns null when expected revenue is unknown (no price configured).
 * A negative value means overpayment (collected > expected).
 */
export function calculateSessionOutstanding(
  expectedRevenueMinor: number | null,
  collectedRevenueMinor: number,
): number | null {
  if (expectedRevenueMinor == null) return null;
  return expectedRevenueMinor - collectedRevenueMinor;
}

/** Payment collection rate as a 0–1 fraction, or null when expected is unknown. */
export function calculatePaymentCollectionRate(
  expectedRevenueMinor: number | null,
  collectedRevenueMinor: number,
): number | null {
  if (expectedRevenueMinor == null) return null;
  if (expectedRevenueMinor === 0) return collectedRevenueMinor === 0 ? 1 : null;
  return collectedRevenueMinor / expectedRevenueMinor;
}

export interface SessionRevenueSummary {
  /** Price set on the session (or inherited from group). Null = not configured. */
  pricePerStudentMinor: number | null;
  /** Number of students with mark = present | late. */
  eligibleAttendanceCount: number;
  /** Expected total. Null when no price is set. */
  expectedRevenueMinor: number | null;
  /** Actual sum of non-voided payments. */
  collectedRevenueMinor: number;
  /** Outstanding balance. Null when no price is set. */
  outstandingRevenueMinor: number | null;
  /** 0–1 collection rate. Null when no price is set or expected is 0 but collected > 0. */
  collectionRate: number | null;
}

/** Build a full revenue summary for a session from raw inputs. */
export function buildSessionRevenueSummary(
  pricePerStudentMinor: number | null | undefined,
  eligibleAttendanceCount: number,
  payments: PaymentForRevenue[],
): SessionRevenueSummary {
  const expectedRevenueMinor = calculateSessionExpectedRevenue(
    pricePerStudentMinor,
    eligibleAttendanceCount,
  );
  const collectedRevenueMinor = calculateSessionCollectedRevenue(payments);
  const outstandingRevenueMinor = calculateSessionOutstanding(
    expectedRevenueMinor,
    collectedRevenueMinor,
  );
  const collectionRate = calculatePaymentCollectionRate(
    expectedRevenueMinor,
    collectedRevenueMinor,
  );
  return {
    pricePerStudentMinor: pricePerStudentMinor ?? null,
    eligibleAttendanceCount,
    expectedRevenueMinor,
    collectedRevenueMinor,
    outstandingRevenueMinor,
    collectionRate,
  };
}
