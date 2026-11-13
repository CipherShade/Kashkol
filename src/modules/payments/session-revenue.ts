/**
 * Session-based revenue calculations.
 *
 * All functions are pure — no database access, no side effects.
 * Input amounts are always in minor currency units (piastres for EGP).
 *
 * Separation of concerns (NF-1 — no fabricated statistics):
 *   - expectedRevenue: what SHOULD be collected if all present/late students pay
 *   - collectedRevenue: what HAS been received (non-voided payments)
 *
 * The session-scoped model (ADR-0028) shows ONLY expected and collected — it
 * never reports an outstanding/balance/credit figure.
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

export interface SessionRevenueSummary {
  /** Price set on the session (or inherited from group). Null = not configured. */
  pricePerStudentMinor: number | null;
  /** Number of students with mark = present | late. */
  eligibleAttendanceCount: number;
  /** Expected total. Null when no price is set. */
  expectedRevenueMinor: number | null;
  /** Actual sum of non-voided payments. */
  collectedRevenueMinor: number;
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
  return {
    pricePerStudentMinor: pricePerStudentMinor ?? null,
    expectedRevenueMinor,
    eligibleAttendanceCount,
    collectedRevenueMinor,
  };
}
