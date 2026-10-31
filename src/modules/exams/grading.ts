export type QuestionOption = {
  id: string;
  text: string;
};

export type CorrectAnswerSpec =
  | { kind: "mcq_single"; optionId: string }
  | { kind: "true_false"; value: boolean }
  | { kind: "short_answer"; acceptedAnswers: string[]; caseSensitive?: boolean }
  | { kind: "manual" };

export type StudentAnswerPayload =
  | { kind: "mcq_single"; optionId: string }
  | { kind: "true_false"; value: boolean }
  | { kind: "short_answer"; text: string }
  | { kind: "essay"; text: string };

export type GradableQuestion = {
  id: string;
  questionType: "mcq_single" | "true_false" | "short_answer" | "essay";
  points: number;
  autoGradable: boolean;
  correctAnswerJson: unknown;
};

export type EvaluatedQuestionResponse = {
  questionId: string;
  isCorrect: boolean | null;
  autoAwardedPoints: number | null;
  needsManualGrading: boolean;
};

/**
 * Normalize Arabic and Latin short-answer strings for deterministic comparison:
 * - trims and collapses internal whitespace
 * - strips Arabic diacritics (tashkeel) and tatweel
 * - normalizes Arabic alef variants (أ إ آ -> ا) and teh marbuta/heh if needed
 * - lowercases unless caseSensitive is true
 */
export function normalizeShortAnswer(input: string, caseSensitive = false): string {
  const cleaned = input
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا");
  return caseSensitive ? cleaned : cleaned.toLowerCase();
}

export function evaluateSingleQuestion(
  question: GradableQuestion,
  answerJson: unknown,
): EvaluatedQuestionResponse {
  const maxPoints = Math.max(0, Number(question.points));

  if (question.questionType === "essay" || !question.autoGradable) {
    return {
      questionId: question.id,
      isCorrect: null,
      autoAwardedPoints: null,
      needsManualGrading: true,
    };
  }

  const correct = question.correctAnswerJson as Record<string, unknown> | null;
  const answer = (answerJson ?? {}) as Record<string, unknown>;

  if (question.questionType === "mcq_single") {
    const expectedOptionId =
      typeof correct?.optionId === "string" ? correct.optionId.trim() : "";
    const givenOptionId =
      typeof answer.optionId === "string" ? answer.optionId.trim() : "";
    const isCorrect = Boolean(expectedOptionId && givenOptionId === expectedOptionId);
    return {
      questionId: question.id,
      isCorrect,
      autoAwardedPoints: isCorrect ? maxPoints : 0,
      needsManualGrading: false,
    };
  }

  if (question.questionType === "true_false") {
    const expectedValue = typeof correct?.value === "boolean" ? correct.value : null;
    const givenValue = typeof answer.value === "boolean" ? answer.value : null;
    const isCorrect = expectedValue !== null && givenValue === expectedValue;
    return {
      questionId: question.id,
      isCorrect,
      autoAwardedPoints: isCorrect ? maxPoints : 0,
      needsManualGrading: false,
    };
  }

  if (question.questionType === "short_answer") {
    const acceptedRaw = Array.isArray(correct?.acceptedAnswers)
      ? (correct.acceptedAnswers as unknown[]).filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0,
        )
      : [];

    if (acceptedRaw.length === 0) {
      return {
        questionId: question.id,
        isCorrect: null,
        autoAwardedPoints: null,
        needsManualGrading: true,
      };
    }

    const caseSensitive = Boolean(correct?.caseSensitive);
    const givenText = typeof answer.text === "string" ? answer.text : "";
    const normalizedGiven = normalizeShortAnswer(givenText, caseSensitive);
    const isCorrect =
      normalizedGiven.length > 0 &&
      acceptedRaw.some(
        (candidate) => normalizeShortAnswer(candidate, caseSensitive) === normalizedGiven,
      );

    return {
      questionId: question.id,
      isCorrect,
      autoAwardedPoints: isCorrect ? maxPoints : 0,
      needsManualGrading: false,
    };
  }

  return {
    questionId: question.id,
    isCorrect: null,
    autoAwardedPoints: null,
    needsManualGrading: true,
  };
}

export function evaluateExamResponses(
  questions: ReadonlyArray<GradableQuestion>,
  responsesByQuestionId: ReadonlyMap<string, unknown>,
): {
  perQuestion: EvaluatedQuestionResponse[];
  autoScore: number;
  maxScore: number;
  hasManualPending: boolean;
  totalScore: number | null;
} {
  let autoScore = 0;
  let maxScore = 0;
  let hasManualPending = false;
  const perQuestion: EvaluatedQuestionResponse[] = [];

  for (const question of questions) {
    maxScore += Math.max(0, Number(question.points));
    const answerJson = responsesByQuestionId.get(question.id);
    const evaluated = evaluateSingleQuestion(question, answerJson);
    perQuestion.push(evaluated);
    if (evaluated.needsManualGrading) {
      hasManualPending = true;
    } else {
      autoScore += evaluated.autoAwardedPoints ?? 0;
    }
  }

  const roundedAuto = Math.round(autoScore * 100) / 100;
  const roundedMax = Math.round(maxScore * 100) / 100;

  return {
    perQuestion,
    autoScore: roundedAuto,
    maxScore: roundedMax,
    hasManualPending,
    totalScore: hasManualPending ? null : roundedAuto,
  };
}

export function canStudentSeeExamResults(input: {
  resultVisibility: "after_manual_publish" | "immediate_after_submit" | "after_window_close";
  resultsPublishedAt: Date | null;
  availableUntil: Date;
  attemptStatus: "in_progress" | "submitted" | "manual_pending" | "graded";
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  if (input.attemptStatus === "in_progress") {
    return false;
  }
  if (input.resultsPublishedAt !== null) {
    return true;
  }
  if (input.resultVisibility === "immediate_after_submit") {
    return input.attemptStatus === "graded";
  }
  if (input.resultVisibility === "after_window_close") {
    return now.getTime() > input.availableUntil.getTime() && input.attemptStatus === "graded";
  }
  return false;
}
