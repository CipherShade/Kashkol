import type { FormQuestionType } from "./schemas";
import type { LogicAnswer } from "./logic";

export type AnswerValidationQuestion = {
  id: string;
  questionType: FormQuestionType;
  config: unknown;
  optionIds: ReadonlySet<string>;
};

export type AnswerValidationResult =
  | { ok: true }
  | { ok: false; messageKey: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function invalid(messageKey = "errors.formAnswerInvalid"): AnswerValidationResult {
  return { ok: false, messageKey };
}

export function validateAnswerValue(
  question: AnswerValidationQuestion,
  answer: LogicAnswer,
): AnswerValidationResult {
  const config = record(question.config);

  switch (question.questionType) {
    case "short_answer":
    case "long_answer": {
      if (typeof answer.text !== "string") return invalid();
      const text = answer.text.trim();
      const minLength = numberValue(config.minLength, 0);
      const maxLength = numberValue(
        config.maxLength,
        question.questionType === "short_answer" ? 500 : 5000,
      );
      if (text.length < minLength || text.length > maxLength) return invalid();
      return { ok: true };
    }

    case "multiple_choice":
    case "dropdown": {
      if (typeof answer.optionId !== "string" || answer.optionId.length === 0) {
        return invalid();
      }
      if (!question.optionIds.has(answer.optionId)) {
        return invalid("errors.formOptionInvalid");
      }
      return { ok: true };
    }

    case "checkboxes": {
      if (!Array.isArray(answer.optionIds) || answer.optionIds.length === 0) {
        return invalid();
      }
      if (new Set(answer.optionIds).size !== answer.optionIds.length) {
        return invalid("errors.formOptionInvalid");
      }
      if (answer.optionIds.some((optionId) => !question.optionIds.has(optionId))) {
        return invalid("errors.formOptionInvalid");
      }
      return { ok: true };
    }

    case "number": {
      if (typeof answer.number !== "number" || !Number.isFinite(answer.number)) {
        return invalid();
      }
      if (config.integer === true && !Number.isInteger(answer.number)) return invalid();
      const min = optionalNumber(config.min);
      const max = optionalNumber(config.max);
      if (min !== undefined && answer.number < min) return invalid();
      if (max !== undefined && answer.number > max) return invalid();
      const step = optionalNumber(config.step);
      if (step !== undefined && step > 0) {
        const base = min ?? 0;
        const steps = (answer.number - base) / step;
        if (Math.abs(steps - Math.round(steps)) > 1e-9) return invalid();
      }
      return { ok: true };
    }

    case "date": {
      if (typeof answer.date !== "string" || !ISO_DATE.test(answer.date)) return invalid();
      const min = optionalString(config.minDate);
      const max = optionalString(config.maxDate);
      if (min !== undefined && answer.date < min) return invalid();
      if (max !== undefined && answer.date > max) return invalid();
      return { ok: true };
    }

    case "time": {
      if (typeof answer.time !== "string" || !ISO_TIME.test(answer.time)) return invalid();
      const min = optionalString(config.minTime);
      const max = optionalString(config.maxTime);
      if (min !== undefined && answer.time < min) return invalid();
      if (max !== undefined && answer.time > max) return invalid();
      return { ok: true };
    }

    case "file_upload": {
      if (!Array.isArray(answer.fileIds) || answer.fileIds.length === 0) {
        return invalid("errors.formFileInvalid");
      }
      if (new Set(answer.fileIds).size !== answer.fileIds.length) {
        return invalid("errors.formFileInvalid");
      }
      const maxFiles = numberValue(config.maxFiles, 1);
      if (answer.fileIds.length > maxFiles) return invalid("errors.formFileInvalid");
      return { ok: true };
    }

    case "rating": {
      if (typeof answer.rating !== "number" || !Number.isInteger(answer.rating)) {
        return invalid();
      }
      const max = numberValue(config.max, 5);
      if (answer.rating < 1 || answer.rating > max) return invalid();
      return { ok: true };
    }

    case "linear_scale": {
      if (typeof answer.scaleValue !== "number" || !Number.isInteger(answer.scaleValue)) {
        return invalid();
      }
      const min = numberValue(config.min, 1);
      const max = numberValue(config.max, 5);
      if (answer.scaleValue < min || answer.scaleValue > max) return invalid();
      return { ok: true };
    }

    default:
      return invalid();
  }
}
