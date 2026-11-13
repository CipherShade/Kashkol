/**
 * Timezone helpers shared by the payments/dashboard/reports modules.
 *
 * The per-student balance machinery that used to live in this file was
 * removed by ADR-0028 (session-scoped finance). Only the pure timezone
 * helpers remain.
 */

export function currentMonthInTimezone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new RangeError("Unable to resolve the current month in the workspace timezone");
  return `${year}-${month}`;
}

export function currentDateInTimezone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new RangeError("Unable to resolve the current date in the workspace timezone");
  }
  return `${year}-${month}-${day}`;
}
