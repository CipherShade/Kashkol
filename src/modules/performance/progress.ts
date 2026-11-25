/**
 * F-P2-06 / ADR-0040: three progress series computed from real records.
 * Nothing here reads a stored trend or caches a result.
 */

export type ProgressDirection =
  | "improving"
  | "steady"
  | "declining"
  | "insufficient_data";

export type ProgressPoint = {
  /** Calendar month, `YYYY-MM`. A missing month is never invented. */
  period: string;
  value: number;
  sampleSize: number;
};

export type ProgressSeries = {
  direction: ProgressDirection;
  points: ProgressPoint[];
  sampleSize: number;
  deltaPercent: number | null;
  rule: string;
};

export const PROGRESS_DIRECTION_RULE =
  "mean(latest half) - mean(previous half); >=+5 improving, <=-5 declining, otherwise steady";

const DIRECTION_BAND = 5;
const MIN_POINTS = 3;

/** F-P2-06: excused attendance is excluded, never counted as a miss. */
export function attendanceValue(mark: string): number | null {
  if (mark === "present" || mark === "late") return 100;
  if (mark === "absent") return 0;
  return null;
}

/** A completion mark wins over a submission; excused work is excluded. */
export function homeworkCompletionValue(status: string): boolean | null {
  if (status === "completed" || status === "submitted" || status === "late") return true;
  if (status === "not_completed" || status === "not_submitted") return false;
  return null;
}

/** Missing, excused, and not-taken results are excluded, not scored as zero. */
export function assessmentValue(
  status: string,
  score: number | null,
  maxScore: number,
): number | null {
  if (status !== "graded" || score === null || !Number.isFinite(score) || maxScore <= 0) return null;
  return Math.min(100, Math.max(0, (score / maxScore) * 100));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Group real observations into populated monthly buckets and classify the
 * direction from those buckets. Values outside 0–100 and malformed dates are
 * skipped rather than silently coerced.
 */
export function buildProgressSeries(
  observations: ReadonlyArray<{ date: string; value: number }>,
): ProgressSeries {
  const buckets = new Map<string, { total: number; count: number }>();
  for (const observation of observations) {
    const period = observation.date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) continue;
    if (!Number.isFinite(observation.value)) continue;
    const value = Math.min(100, Math.max(0, observation.value));
    const bucket = buckets.get(period) ?? { total: 0, count: 0 };
    bucket.total += value;
    bucket.count += 1;
    buckets.set(period, bucket);
  }

  const points = [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, bucket]) => ({
      period,
      value: round1(bucket.total / bucket.count),
      sampleSize: bucket.count,
    }));

  const sampleSize = points.reduce((total, point) => total + point.sampleSize, 0);
  const insufficient: ProgressSeries = {
    direction: "insufficient_data",
    points,
    sampleSize,
    deltaPercent: null,
    rule: PROGRESS_DIRECTION_RULE,
  };
  if (points.length < MIN_POINTS) return insufficient;

  const recentSize = Math.ceil(points.length / 2);
  const previous = points.slice(0, points.length - recentSize);
  const recent = points.slice(points.length - recentSize);
  const delta = mean(recent.map((point) => point.value)) - mean(previous.map((point) => point.value));
  return {
    direction: delta >= DIRECTION_BAND ? "improving" : delta <= -DIRECTION_BAND ? "declining" : "steady",
    points,
    sampleSize,
    deltaPercent: round1(delta),
    rule: PROGRESS_DIRECTION_RULE,
  };
}
