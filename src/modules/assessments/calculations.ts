export type ResultForAverage = {
  status: "graded" | "missing" | "excused" | "not_taken";
  score: number | null;
  maxScore: number;
};

function isScoredResult<T extends ResultForAverage>(
  result: T,
): result is T & { status: "graded"; score: number } {
  return (
    result.status === "graded" &&
    typeof result.score === "number" &&
    Number.isFinite(result.score) &&
    Number.isFinite(result.maxScore) &&
    result.maxScore > 0
  );
}

export function scorePercentage(score: number, maxScore: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
    throw new RangeError("A score percentage requires a finite score and positive maximum.");
  }
  return (score / maxScore) * 100;
}

export function averagePercentage(results: readonly ResultForAverage[]): number | null {
  const percentages = results
    .filter(isScoredResult)
    .map((result) => scorePercentage(result.score, result.maxScore));

  if (percentages.length === 0) return null;
  return percentages.reduce((total, percentage) => total + percentage, 0) / percentages.length;
}

export function groupScoreSummary(results: readonly ResultForAverage[]) {
  const scores = results
    .filter(isScoredResult)
    .map((result) => scorePercentage(result.score, result.maxScore));

  return {
    gradedCount: scores.length,
    averagePercent:
      scores.length === 0
        ? null
        : scores.reduce((total, score) => total + score, 0) / scores.length,
    highestPercent: scores.length === 0 ? null : Math.max(...scores),
    lowestPercent: scores.length === 0 ? null : Math.min(...scores),
  };
}

export function assessmentTrend(
  results: ReadonlyArray<{
    date: string;
    score: number | null;
    maxScore: number;
    status: ResultForAverage["status"];
  }>,
): "improving" | "steady" | "declining" | "insufficient_data" {
  const graded = results
    .filter(isScoredResult)
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date));
  if (graded.length < 2) return "insufficient_data";
  const firstResult = graded[0];
  const lastResult = graded[graded.length - 1];
  if (!firstResult || !lastResult) return "insufficient_data";
  const first = scorePercentage(firstResult.score, firstResult.maxScore);
  const last = scorePercentage(lastResult.score, lastResult.maxScore);
  if (last > first) return "improving";
  if (last < first) return "declining";
  return "steady";
}
