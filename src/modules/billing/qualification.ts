/**
 * Qualification rules for the per-student platform fee (ADR-0045, ADR-0051).
 *
 * A student qualifies when two qualifying attendance sessions fall inside a
 * rolling 30-day window that includes at least one session in the billed Cairo
 * month. The window is measured in elapsed time so Cairo daylight-saving
 * transitions cannot change qualification. Attendance history is the only
 * input: archiving or deleting a student never removes an earned charge.
 */

export type QualifyingMarkValue = "present" | "absent" | "late" | "excused";
export type QualifyingSessionStatus = "scheduled" | "started" | "completed" | "cancelled";

/** Thirty 24-hour days, fixed rather than calendar days, for a stable window. */
export const BILLING_QUALIFICATION_WINDOW_DAYS = 30;
const WINDOW_MS = BILLING_QUALIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * A qualifying mark is a real `present` or `late` attendance record on a
 * non-cancelled session. `absent`, `excused`, and cancelled-session marks are
 * never billable (ADR-0045).
 */
export type BillingAttendanceRow = {
  studentId: string;
  markId: string;
  mark: QualifyingMarkValue;
  sessionStatus: QualifyingSessionStatus;
  startsAt: Date;
};

export type QualifyingStudent = {
  studentId: string;
  /** The mark ids in the rolling window that established qualification. */
  markIds: string[];
};

export type BillingPeriod = { start: Date; endExclusive: Date };

export function isQualifyingBillingMark(row: BillingAttendanceRow): boolean {
  return (
    (row.mark === "present" || row.mark === "late") && row.sessionStatus !== "cancelled"
  );
}

function periodBounds(period: BillingPeriod): { startMs: number; endMs: number } {
  const startMs = period.start.getTime();
  const endMs = period.endExclusive.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error("Invalid billing period range");
  }
  return { startMs, endMs };
}

/**
 * Attendance lookup range for a Cairo month: the month plus the preceding
 * rolling window. The lower bound is clamped to the workspace activation
 * month, so pre-activation attendance can never establish a charge.
 */
export function qualificationLookupRange(
  period: BillingPeriod,
  activationStart?: Date | null,
): BillingPeriod {
  const { startMs, endMs } = periodBounds(period);
  const earliest = startMs - WINDOW_MS;
  const activationMs = activationStart?.getTime();
  const lower =
    activationMs !== undefined && Number.isFinite(activationMs)
      ? Math.max(earliest, activationMs)
      : earliest;
  return {
    start: new Date(Math.min(lower, endMs)),
    endExclusive: period.endExclusive,
  };
}

/**
 * Count each student once per workspace per month. A window of at most 30
 * elapsed days must contain two distinct qualifying marks, and at least one of
 * those marks must be in the billed month. Marks are de-duplicated by id and
 * the unique `(session_id, student_id)` constraint prevents duplicate
 * check-ins.
 */
export function computeQualifyingStudents(
  rows: readonly BillingAttendanceRow[],
  period: BillingPeriod,
): QualifyingStudent[] {
  const { startMs, endMs } = periodBounds(period);
  const inPeriod = (time: number) => time >= startMs && time < endMs;
  const byStudent = new Map<string, Map<string, number>>();

  for (const row of rows) {
    if (!isQualifyingBillingMark(row)) continue;
    const time = row.startsAt.getTime();
    if (!Number.isFinite(time)) throw new Error("Invalid billing attendance timestamp");
    const marks = byStudent.get(row.studentId) ?? new Map<string, number>();
    marks.set(row.markId, time);
    byStudent.set(row.studentId, marks);
  }

  const qualifying: QualifyingStudent[] = [];
  for (const [studentId, marksById] of byStudent) {
    const marks = [...marksById.entries()]
      .map(([markId, time]) => ({ markId, time }))
      .sort((left, right) => left.time - right.time || left.markId.localeCompare(right.markId));

    let windowMarkIds: string[] | null = null;
    let right = 0;
    let inPeriodCount = 0;
    for (let left = 0; left < marks.length; left += 1) {
      while (right < marks.length && marks[right]!.time - marks[left]!.time <= WINDOW_MS) {
        if (inPeriod(marks[right]!.time)) inPeriodCount += 1;
        right += 1;
      }
      if (right - left >= 2 && inPeriodCount > 0) {
        windowMarkIds = marks.slice(left, right).map((mark) => mark.markId).sort();
        break;
      }
      if (inPeriod(marks[left]!.time)) inPeriodCount -= 1;
    }

    if (windowMarkIds) qualifying.push({ studentId, markIds: windowMarkIds });
  }

  return qualifying.sort((a, b) => a.studentId.localeCompare(b.studentId));
}

export function computeChargeMinor(qualifyingCount: number, rateMinor: number): number {
  if (!Number.isInteger(qualifyingCount) || qualifyingCount < 0) {
    throw new Error("Qualifying student count must be a non-negative integer");
  }
  if (!Number.isInteger(rateMinor) || rateMinor < 0) {
    throw new Error("Billing rate must be a non-negative integer");
  }
  return qualifyingCount * rateMinor;
}
