/**
 * Cairo calendar-month helpers for platform billing (ADR-0045).
 *
 * Egypt observes daylight saving time, so a fixed UTC offset is not correct.
 * The conversion below derives the offset from `Intl` and converges on the
 * local instant; it has no dependency and uses no ambient clock.
 */

export const BILLING_TIMEZONE = "Africa/Cairo";

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function partsInCairo(date: Date): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BILLING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

const OFFSET_PATTERN = /^GMT([+-])(\d{2})(?::(\d{2}))?$/;

/** The UTC offset in minutes in force at an instant, derived from `Intl`. */
function cairoOffsetMinutesAt(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BILLING_TIMEZONE,
    timeZoneName: "longOffset",
  }).formatToParts(instant);
  const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  if (name === "GMT") return 0;
  const match = OFFSET_PATTERN.exec(name);
  if (!match) throw new Error(`Unsupported Cairo offset: ${name}`);
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  const total = hours * 60 + minutes;
  return match[1] === "-" ? -total : total;
}

function wallTimeAsUtc(parts: ZonedParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
}

function sameWallTime(left: ZonedParts, right: ZonedParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

/**
 * Convert a wall-clock time in Cairo to the corresponding UTC instant.
 *
 * DST transitions can make a wall time ambiguous (two instants) or nonexistent
 * (skipped). We derive the offsets on both sides of the target, verify every
 * candidate against `Intl`, and choose deterministically:
 *   - ambiguous: the earliest matching instant;
 *   - nonexistent: the first valid instant after the skipped wall time.
 * This converges without an unbounded iteration and without a fixed offset.
 */
export function cairoWallTimeToUtc(input: ZonedParts): Date {
  const target = wallTimeAsUtc(input);
  const dayMs = 24 * 60 * 60 * 1000;
  const candidates = new Set<number>();
  for (const probe of [target - dayMs, target, target + dayMs]) {
    const offset = cairoOffsetMinutesAt(new Date(probe));
    candidates.add(target - offset * 60_000);
  }
  const ordered = [...candidates].sort((left, right) => left - right);
  for (const candidate of ordered) {
    if (sameWallTime(partsInCairo(new Date(candidate)), input)) return new Date(candidate);
  }
  const afterSkippedTime = ordered.find(
    (candidate) => wallTimeAsUtc(partsInCairo(new Date(candidate))) >= target,
  );
  return new Date(afterSkippedTime ?? ordered[0] ?? target);
}

export function isCairoMonth(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

export function assertCairoMonth(value: string): string {
  if (!isCairoMonth(value)) {
    throw new Error(`Invalid Cairo billing month: ${value}`);
  }
  return value;
}

/** The Cairo calendar month containing an instant, as `YYYY-MM`. */
export function cairoMonthFromDate(date: Date): string {
  const parts = partsInCairo(date);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}`;
}

/** The Cairo calendar date containing an instant, as `YYYY-MM-DD`. */
export function cairoDateFromDate(date: Date): string {
  const parts = partsInCairo(date);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function parseCairoMonth(month: string): { year: number; month: number } {
  const match = MONTH_PATTERN.exec(month);
  if (!match) throw new Error(`Invalid Cairo billing month: ${month}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function formatCairoMonth(year: number, month: number): string {
  if (month < 1 || month > 12) throw new Error(`Invalid Cairo billing month: ${month}`);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function addCairoMonths(month: string, delta: number): string {
  const { year, month: current } = parseCairoMonth(month);
  const index = year * 12 + (current - 1) + delta;
  return formatCairoMonth(Math.floor(index / 12), (index % 12) + 1);
}

/** Half-open UTC interval for a Cairo calendar month. */
export function cairoMonthRange(month: string): { start: Date; endExclusive: Date } {
  const { year, month: current } = parseCairoMonth(month);
  const start = cairoWallTimeToUtc({ year, month: current, day: 1, hour: 0, minute: 0 });
  const next = addCairoMonths(month, 1);
  const nextParts = parseCairoMonth(next);
  const endExclusive = cairoWallTimeToUtc({
    year: nextParts.year,
    month: nextParts.month,
    day: 1,
    hour: 0,
    minute: 0,
  });
  return { start, endExclusive };
}

/** Inclusive date bounds for an exemption covering a billing month. */
export function cairoMonthDateBounds(month: string): { firstDay: string; lastDay: string } {
  const { year, month: current } = parseCairoMonth(month);
  const next = addCairoMonths(month, 1);
  const { year: nextYear, month: nextMonth } = parseCairoMonth(next);
  const lastDate = new Date(Date.UTC(nextYear, nextMonth - 1, 0));
  return {
    firstDay: `${String(year).padStart(4, "0")}-${String(current).padStart(2, "0")}-01`,
    lastDay: `${String(lastDate.getUTCFullYear()).padStart(4, "0")}-${String(
      lastDate.getUTCMonth() + 1,
    ).padStart(2, "0")}-${String(lastDate.getUTCDate()).padStart(2, "0")}`,
  };
}
