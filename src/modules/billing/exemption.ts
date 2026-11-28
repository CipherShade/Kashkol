import { cairoDateFromDate, cairoMonthDateBounds } from "./time";

export type ExemptionPeriod = {
  startDate: string;
  expiresOn: string | null;
  status: "scheduled" | "active" | "expired" | "revoked";
  /** Cairo date on which a revocation took effect. Historical rows omit it. */
  revokedOn?: string | null;
};

/** Inclusive Cairo-date check, using ISO date strings. */
export function exemptionCoversDate(exemption: ExemptionPeriod, date: string): boolean {
  if (exemption.status === "revoked") {
    // Revocation is never retroactive within the month in which it happened.
    if (!exemption.revokedOn || date > exemption.revokedOn) return false;
  }
  if (date < exemption.startDate) return false;
  if (exemption.status === "revoked" && exemption.revokedOn) {
    return date <= exemption.revokedOn;
  }
  return exemption.expiresOn === null || date <= exemption.expiresOn;
}

export function exemptionCoversMonth(exemption: ExemptionPeriod, month: string): boolean {
  const { firstDay, lastDay } = cairoMonthDateBounds(month);
  if (exemption.status === "revoked") {
    // Revocation is never retroactive within the month in which it happened:
    // the whole month remains non-billable. Only later months become billable.
    // A scheduled exemption revoked before its start date covered no day at
    // all, so it must not cover the month merely because both fall in it.
    if (
      !exemption.revokedOn ||
      firstDay > exemption.revokedOn ||
      exemption.startDate > exemption.revokedOn
    )
      return false;
  }
  if (lastDay < exemption.startDate) return false;
  return exemption.expiresOn === null || exemption.expiresOn >= firstDay;
}

export function resolveExemptionStatus(
  exemption: ExemptionPeriod,
  today: string,
): ExemptionPeriod["status"] {
  if (exemption.status === "revoked") return "revoked";
  if (exemption.expiresOn && today > exemption.expiresOn) return "expired";
  if (today >= exemption.startDate) return "active";
  return "scheduled";
}

/**
 * An expiration change must not make an already-covered Cairo month billable.
 * Expiring today is allowed; expiring before today would reach into the past.
 */
export function isForwardOnlyExemptionExpiration(
  expiresOn: string | null,
  today: string,
): boolean {
  return expiresOn === null || expiresOn >= today;
}

/**
 * Two non-revoked exemptions may not cover the same day. Revoked rows are
 * excluded exactly as the database exclusion constraint excludes them.
 */
export function exemptionsOverlap(a: ExemptionPeriod, b: ExemptionPeriod): boolean {
  if (a.status === "revoked" || b.status === "revoked") return false;
  const aEnd = exemptionLastCoveredDate(a);
  const bEnd = exemptionLastCoveredDate(b);
  if (!aEnd || !bEnd) return false;
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

function exemptionLastCoveredDate(exemption: ExemptionPeriod): string | null {
  if (exemption.status === "revoked" && !exemption.revokedOn) return null;
  const scheduledEnd = exemption.expiresOn ?? "9999-12-31";
  if (exemption.status === "revoked" && exemption.revokedOn) {
    return exemption.revokedOn < scheduledEnd ? exemption.revokedOn : scheduledEnd;
  }
  return scheduledEnd;
}

/** Bridge a stored exemption row to the date helpers without leaking notes. */
export function exemptionPeriodFromRow(row: {
  startDate: string;
  expiresOn: string | null;
  status: string;
  revokedOn?: Date | null;
  updatedAt?: Date;
}): ExemptionPeriod {
  const revokedAt = row.revokedOn ?? (row.status === "revoked" ? row.updatedAt ?? null : null);
  return {
    startDate: row.startDate,
    expiresOn: row.expiresOn,
    status: row.status as ExemptionPeriod["status"],
    revokedOn: revokedAt ? cairoDateFromDate(revokedAt) : null,
  };
}
