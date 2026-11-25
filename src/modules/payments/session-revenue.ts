/**
 * Collected session earnings calculation.
 *
 * Pure function: no database access, no side effects. Amounts are integer
 * minor units (piastres for EGP).
 *
 * Only money the workspace owner actually recorded against a session is
 * counted. No expected revenue, attendance projection, balance, credit, or
 * adjustment figure exists in the product (`ADR-0041`).
 */

/** A minimal shape of a receipt sufficient for the collected total. */
export type PaymentForRevenue = {
  amountMinor: number;
};

export interface SessionRevenueSummary {
  /** Sum of real receipts linked to the session. */
  collectedRevenueMinor: number;
}

/**
 * Sum the receipts actually recorded for a session.
 *
 * Every stored receipt is collected money (`ADR-0043`); there is no void or
 * reversal state left in the workspace schema.
 */
export function calculateSessionCollectedRevenue(payments: PaymentForRevenue[]): number {
  return payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
}

export function buildSessionRevenueSummary(payments: PaymentForRevenue[]): SessionRevenueSummary {
  return { collectedRevenueMinor: calculateSessionCollectedRevenue(payments) };
}
