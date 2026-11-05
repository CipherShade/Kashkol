import type { FormLogicAction, FormLogicOperator, FormQuestionType } from "./schemas";

/**
 * A form answer as it is evaluated for conditional logic. It intentionally
 * mirrors the shared `answerValueSchema` without importing the runtime schema,
 * so the logic stays a pure function that unit tests can exercise directly.
 */
export type LogicAnswer = {
  text?: string;
  optionId?: string;
  optionIds?: string[];
  number?: number;
  date?: string;
  time?: string;
  fileIds?: string[];
  rating?: number;
  scaleValue?: number;
};

export type LogicComparison = {
  optionId?: string;
  text?: string;
  number?: number;
  date?: string;
  time?: string;
};

export type FormLogicRule = {
  id?: string;
  sourceQuestionId: string;
  operator: FormLogicOperator;
  comparison: LogicComparison;
  action: FormLogicAction;
  targetQuestionId?: string | null;
  targetSectionId?: string | null;
};

export type LogicQuestion = {
  id: string;
  sectionId: string | null;
  isRequired: boolean;
  questionType: FormQuestionType;
};

export type FormVisibility = {
  visibleSectionIds: ReadonlySet<string>;
  visibleQuestionIds: ReadonlySet<string>;
  requiredQuestionIds: ReadonlySet<string>;
};

export function answerIsEmpty(answer: LogicAnswer | undefined | null): boolean {
  if (!answer) return true;
  if (typeof answer.text === "string" && answer.text.trim().length > 0) return false;
  if (typeof answer.optionId === "string" && answer.optionId.length > 0) return false;
  if (Array.isArray(answer.optionIds) && answer.optionIds.length > 0) return false;
  if (typeof answer.number === "number" && Number.isFinite(answer.number)) return false;
  if (typeof answer.date === "string" && answer.date.length > 0) return false;
  if (typeof answer.time === "string" && answer.time.length > 0) return false;
  if (Array.isArray(answer.fileIds) && answer.fileIds.length > 0) return false;
  if (typeof answer.rating === "number" && Number.isFinite(answer.rating)) return false;
  if (typeof answer.scaleValue === "number" && Number.isFinite(answer.scaleValue)) return false;
  return true;
}

export function parseLogicComparison(value: unknown): LogicComparison {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const comparison: LogicComparison = {};
  if (typeof record.optionId === "string") comparison.optionId = record.optionId;
  if (typeof record.text === "string") comparison.text = record.text;
  if (typeof record.number === "number" && Number.isFinite(record.number)) {
    comparison.number = record.number;
  }
  if (typeof record.date === "string") comparison.date = record.date;
  if (typeof record.time === "string") comparison.time = record.time;
  return comparison;
}

function selectedOptionIds(answer: LogicAnswer): string[] {
  if (Array.isArray(answer.optionIds)) return answer.optionIds;
  if (typeof answer.optionId === "string") return [answer.optionId];
  return [];
}

function comparableNumber(answer: LogicAnswer): number | undefined {
  if (typeof answer.number === "number" && Number.isFinite(answer.number)) return answer.number;
  if (typeof answer.rating === "number" && Number.isFinite(answer.rating)) return answer.rating;
  if (typeof answer.scaleValue === "number" && Number.isFinite(answer.scaleValue)) {
    return answer.scaleValue;
  }
  return undefined;
}

function equal(answer: LogicAnswer, comparison: LogicComparison): boolean {
  if (comparison.optionId !== undefined) {
    return selectedOptionIds(answer).includes(comparison.optionId);
  }
  if (comparison.number !== undefined) {
    return comparableNumber(answer) === comparison.number;
  }
  if (comparison.text !== undefined) {
    return answer.text === comparison.text;
  }
  if (comparison.date !== undefined) {
    return answer.date === comparison.date;
  }
  if (comparison.time !== undefined) {
    return answer.time === comparison.time;
  }
  return false;
}

/**
 * Evaluate one conditional rule against the answer to its source question.
 * A missing comparison value on an operator that needs one is treated as
 * "does not match", never as a wildcard.
 */
export function logicConditionMatches(
  operator: FormLogicOperator,
  comparison: LogicComparison,
  answer: LogicAnswer | undefined,
): boolean {
  if (operator === "is_answered") return !answerIsEmpty(answer);
  if (operator === "is_not_answered") return answerIsEmpty(answer);
  if (!answer) return false;

  if (operator === "equals") return equal(answer, comparison);
  if (operator === "not_equals") return !equal(answer, comparison);

  if (operator === "contains") {
    if (comparison.optionId !== undefined) {
      return selectedOptionIds(answer).includes(comparison.optionId);
    }
    if (comparison.text !== undefined && typeof answer.text === "string") {
      return answer.text.includes(comparison.text);
    }
    return false;
  }

  const leftNumber = comparableNumber(answer);
  if (comparison.number !== undefined) {
    if (leftNumber === undefined) return false;
    return operator === "greater_than"
      ? leftNumber > comparison.number
      : leftNumber < comparison.number;
  }

  if (comparison.date !== undefined && typeof answer.date === "string") {
    return operator === "greater_than"
      ? answer.date > comparison.date
      : answer.date < comparison.date;
  }
  if (comparison.time !== undefined && typeof answer.time === "string") {
    return operator === "greater_than"
      ? answer.time > comparison.time
      : answer.time < comparison.time;
  }
  return false;
}

function rulesTargetSection(
  rules: ReadonlyArray<FormLogicRule>,
  sectionId: string,
): FormLogicRule[] {
  return rules.filter((rule) => rule.targetSectionId === sectionId);
}

function rulesTargetQuestion(
  rules: ReadonlyArray<FormLogicRule>,
  questionId: string,
): FormLogicRule[] {
  return rules.filter((rule) => rule.targetQuestionId === questionId);
}

function isVisible(
  rules: FormLogicRule[],
  answers: ReadonlyMap<string, LogicAnswer>,
  baseVisible: boolean,
): boolean {
  if (!baseVisible) return false;
  const showRules = rules.filter((rule) => rule.action === "show");
  if (showRules.length > 0 && !showRules.some((rule) => matches(rule, answers))) return false;
  const hideRules = rules.filter((rule) => rule.action === "hide");
  if (hideRules.some((rule) => matches(rule, answers))) return false;
  return true;
}

function isRequired(
  rules: FormLogicRule[],
  answers: ReadonlyMap<string, LogicAnswer>,
  baseRequired: boolean,
): boolean {
  if (baseRequired) return true;
  return rules
    .filter((rule) => rule.action === "require")
    .some((rule) => matches(rule, answers));
}

function matches(rule: FormLogicRule, answers: ReadonlyMap<string, LogicAnswer>): boolean {
  return logicConditionMatches(
    rule.operator,
    rule.comparison,
    answers.get(rule.sourceQuestionId),
  );
}

/**
 * Resolve which questions are visible and required for a given set of answers.
 *
 * A section can be hidden or conditionally shown as a whole. A question is
 * visible only when its section is visible, and can then be hidden or
 * conditionally shown independently. Multiple `hide` rules are disjunctive;
 * multiple `show` rules require at least one match; a `require` rule adds to
 * the question's static `isRequired` flag.
 */
export function computeFormVisibility(
  sections: ReadonlyArray<{ id: string }>,
  questions: ReadonlyArray<LogicQuestion>,
  rules: ReadonlyArray<FormLogicRule>,
  answers: ReadonlyMap<string, LogicAnswer>,
): FormVisibility {
  const visibleSectionIds = new Set<string>();
  for (const section of sections) {
    if (isVisible(rulesTargetSection(rules, section.id), answers, true)) {
      visibleSectionIds.add(section.id);
    }
  }

  const visibleQuestionIds = new Set<string>();
  const requiredQuestionIds = new Set<string>();
  for (const question of questions) {
    const sectionVisible = question.sectionId === null || visibleSectionIds.has(question.sectionId);
    const questionRules = rulesTargetQuestion(rules, question.id);
    const visible = isVisible(questionRules, answers, sectionVisible);
    if (visible) {
      visibleQuestionIds.add(question.id);
      if (isRequired(questionRules, answers, question.isRequired)) {
        requiredQuestionIds.add(question.id);
      }
    }
  }

  return { visibleSectionIds, visibleQuestionIds, requiredQuestionIds };
}
