/**
 * Pure state mapping and helpers for the visual form editor.
 *
 * This module deliberately has no React or browser dependency so the mapping
 * between the API definition (ids, ordered rows) and the editor state
 * (indices, local keys) can be unit tested without a DOM.
 */

export type QuestionType =
  | "short_answer"
  | "long_answer"
  | "multiple_choice"
  | "checkboxes"
  | "dropdown"
  | "number"
  | "date"
  | "time"
  | "file_upload"
  | "rating"
  | "linear_scale";

export type LogicOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "is_answered"
  | "is_not_answered"
  | "greater_than"
  | "less_than";

export type LogicAction = "show" | "hide" | "require";
export type FormStatus = "draft" | "published" | "archived";

export interface OptionInput {
  label: string;
}

export interface SectionInput {
  key: string;
  title: string;
  description: string;
  pageBreakBefore: boolean;
}

export interface QuestionInput {
  key: string;
  prompt: string;
  description: string;
  isRequired: boolean;
  sectionIndex: number | null;
  questionType: QuestionType;
  options: OptionInput[];
  config: Record<string, unknown>;
}

export interface LogicInput {
  key: string;
  sourceQuestionIndex: number;
  operator: LogicOperator;
  comparison: Record<string, unknown>;
  action: LogicAction;
  targetQuestionIndex: number | null;
  targetSectionIndex: number | null;
}

export interface FormSettings {
  allowMultipleSubmissions: boolean;
  shuffleQuestions: boolean;
  showProgressBar: boolean;
}

export interface FormDefinitionState {
  id: string;
  title: string;
  description: string;
  status: FormStatus;
  submissionMode: "identified" | "anonymous";
  isPublic: boolean;
  publicSlug: string;
  acceptingResponses: boolean;
  confirmationMessage: string;
  settings: FormSettings;
  sections: SectionInput[];
  questions: QuestionInput[];
  logic: LogicInput[];
  updatedAt: string;
  submissionCount: number;
}

export interface ApiFormOption {
  id: string;
  label: string;
  orderIndex: number;
}

export interface ApiFormQuestion {
  id: string;
  sectionId: string | null;
  orderIndex: number;
  questionType: string;
  prompt: string;
  description: string | null;
  isRequired: boolean;
  configJson: unknown;
  options: ApiFormOption[];
}

export interface ApiFormSection {
  id: string;
  title: string;
  description: string | null;
  orderIndex: number;
  pageBreakBefore: boolean;
}

export interface ApiFormLogicRule {
  id: string;
  sourceQuestionId: string;
  operator: string;
  comparisonJson: unknown;
  action: string;
  targetQuestionId: string | null;
  targetSectionId: string | null;
}

export interface ApiFormDetail {
  id: string;
  title: string;
  description: string | null;
  status: FormStatus;
  submissionMode: string;
  isPublic: boolean;
  publicSlug: string | null;
  acceptingResponses: boolean;
  confirmationMessage: string | null;
  settingsJson: unknown;
  sections: ApiFormSection[];
  questions: ApiFormQuestion[];
  logicRules: ApiFormLogicRule[];
  updatedAt: string;
  _count?: { questions: number; submissions: number };
}

export const QUESTION_TYPES: QuestionType[] = [
  "short_answer",
  "long_answer",
  "multiple_choice",
  "checkboxes",
  "dropdown",
  "number",
  "date",
  "time",
  "file_upload",
  "rating",
  "linear_scale",
];

export const CHOICE_TYPES: ReadonlySet<QuestionType> = new Set<QuestionType>([
  "multiple_choice",
  "checkboxes",
  "dropdown",
]);

export const OPERATORS: LogicOperator[] = [
  "is_answered",
  "is_not_answered",
  "equals",
  "not_equals",
  "contains",
  "greater_than",
  "less_than",
];

export const ACTIONS: LogicAction[] = ["show", "hide", "require"];

export function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function asOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function asQuestionType(value: unknown): QuestionType {
  return QUESTION_TYPES.includes(value as QuestionType)
    ? (value as QuestionType)
    : "short_answer";
}

export function asOperator(value: unknown): LogicOperator {
  return OPERATORS.includes(value as LogicOperator)
    ? (value as LogicOperator)
    : "is_answered";
}

export function asAction(value: unknown): LogicAction {
  return ACTIONS.includes(value as LogicAction) ? (value as LogicAction) : "show";
}

export function defaultConfig(type: QuestionType): Record<string, unknown> {
  switch (type) {
    case "short_answer":
      return { minLength: 0, maxLength: 500, placeholder: "" };
    case "long_answer":
      return { minLength: 0, maxLength: 5000, rows: 5, placeholder: "" };
    case "number":
      return { min: null, max: null, integer: false, step: null };
    case "date":
      return { minDate: null, maxDate: null };
    case "time":
      return { minTime: null, maxTime: null };
    case "file_upload":
      return {
        maxFiles: 1,
        maxSizeBytes: 10 * 1024 * 1024,
        allowedMimeTypes: [],
      };
    case "rating":
      return { max: 5, icon: "star" };
    case "linear_scale":
      return { min: 1, max: 5, minLabel: "", maxLabel: "" };
    case "multiple_choice":
    case "checkboxes":
    case "dropdown":
      return { shuffleOptions: false };
    default:
      return {};
  }
}

export function defaultOptionCount(type: QuestionType): number {
  return type === "dropdown" ? 1 : 2;
}

export function emptyQuestion(
  type: QuestionType,
  sectionIndex: number | null,
  prompt: string,
  optionLabel: string,
): QuestionInput {
  const count = CHOICE_TYPES.has(type) ? defaultOptionCount(type) : 0;
  return {
    key: newKey(),
    prompt,
    description: "",
    isRequired: false,
    sectionIndex,
    questionType: type,
    options: Array.from({ length: count }, (_, index) => ({
      label: `${optionLabel} ${index + 1}`,
    })),
    config: defaultConfig(type),
  };
}

export function toFormState(
  data: ApiFormDetail,
  labels: { sectionDefaultTitle: string },
): FormDefinitionState {
  const rawSections = Array.isArray(data.sections) ? data.sections : [];
  const sections: SectionInput[] = rawSections.map((section) => ({
    key: section.id,
    title: section.title,
    description: section.description ?? "",
    pageBreakBefore: Boolean(section.pageBreakBefore),
  }));
  if (sections.length === 0) {
    sections.push({
      key: newKey(),
      title: labels.sectionDefaultTitle,
      description: "",
      pageBreakBefore: false,
    });
  }

  const sectionIndexById = new Map<string, number>();
  rawSections.forEach((section, index) => sectionIndexById.set(section.id, index));

  const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
  const questionIndexById = new Map<string, number>();
  rawQuestions.forEach((question, index) => questionIndexById.set(question.id, index));

  const questions: QuestionInput[] = rawQuestions.map((question) => ({
    key: question.id,
    prompt: question.prompt,
    description: question.description ?? "",
    isRequired: Boolean(question.isRequired),
    sectionIndex:
      question.sectionId === null
        ? null
        : (sectionIndexById.get(question.sectionId) ?? null),
    questionType: asQuestionType(question.questionType),
    options: Array.isArray(question.options)
      ? question.options.map((option) => ({ label: option.label }))
      : [],
    config: asRecord(question.configJson),
  }));

  const rawLogic = Array.isArray(data.logicRules) ? data.logicRules : [];
  const logic: LogicInput[] = rawLogic.flatMap((rule) => {
    const sourceIndex = questionIndexById.get(rule.sourceQuestionId);
    if (sourceIndex === undefined) return [];
    const targetQuestionIndex =
      rule.targetQuestionId === null
        ? null
        : questionIndexById.get(rule.targetQuestionId);
    const targetSectionIndex =
      rule.targetSectionId === null
        ? null
        : sectionIndexById.get(rule.targetSectionId);
    const hasQuestionTarget = typeof targetQuestionIndex === "number";
    const hasSectionTarget = typeof targetSectionIndex === "number";
    if (!hasQuestionTarget && !hasSectionTarget) return [];
    return [
      {
        key: rule.id,
        sourceQuestionIndex: sourceIndex,
        operator: asOperator(rule.operator),
        comparison: asRecord(rule.comparisonJson),
        action: asAction(rule.action),
        targetQuestionIndex: hasQuestionTarget ? targetQuestionIndex : null,
        targetSectionIndex:
          !hasQuestionTarget && hasSectionTarget ? targetSectionIndex : null,
      },
    ];
  });

  const settings = asRecord(data.settingsJson);
  return {
    id: data.id,
    title: data.title,
    description: data.description ?? "",
    status: data.status,
    submissionMode: data.submissionMode === "anonymous" ? "anonymous" : "identified",
    isPublic: Boolean(data.isPublic),
    publicSlug: data.publicSlug ?? "",
    acceptingResponses: data.acceptingResponses ?? true,
    confirmationMessage: data.confirmationMessage ?? "",
    settings: {
      allowMultipleSubmissions: asBoolean(settings.allowMultipleSubmissions),
      shuffleQuestions: asBoolean(settings.shuffleQuestions),
      showProgressBar: asBoolean(settings.showProgressBar, true),
    },
    sections,
    questions,
    logic,
    updatedAt: data.updatedAt,
    submissionCount: data._count?.submissions ?? 0,
  };
}

export interface FormDefinitionPayload {
  title: string;
  description: string | null;
  submissionMode: "identified" | "anonymous";
  isPublic: boolean;
  publicSlug: string | null;
  acceptingResponses: boolean;
  confirmationMessage: string | null;
  settings: FormSettings;
  sections: Array<{
    title: string;
    description: string | null;
    pageBreakBefore: boolean;
  }>;
  questions: Array<{
    prompt: string;
    description: string | null;
    isRequired: boolean;
    sectionIndex: number | null;
    questionType: QuestionType;
    options?: OptionInput[];
    config: Record<string, unknown>;
  }>;
  logic: Array<{
    sourceQuestionIndex: number;
    operator: LogicOperator;
    comparison: Record<string, unknown>;
    action: LogicAction;
    targetQuestionIndex: number | null;
    targetSectionIndex: number | null;
  }>;
}

/**
 * The exact body sent to `PATCH /api/forms/[formId]`, minus `updatedAt`.
 *
 * Keeping this pure lets the editor compare the current definition with the
 * saved baseline for the unsaved-changes warning, and lets the server schema
 * parse exactly the same object the editor would send.
 */
export function toDefinitionPayload(
  state: FormDefinitionState,
): FormDefinitionPayload {
  return {
    title: state.title.trim(),
    description: state.description.trim() || null,
    submissionMode: state.submissionMode,
    isPublic: state.isPublic,
    publicSlug: state.isPublic ? state.publicSlug.trim() || null : null,
    acceptingResponses: state.acceptingResponses,
    confirmationMessage: state.confirmationMessage.trim() || null,
    settings: state.settings,
    sections: state.sections.map((section) => ({
      title: section.title.trim(),
      description: section.description.trim() || null,
      pageBreakBefore: section.pageBreakBefore,
    })),
    questions: state.questions.map((question) => ({
      prompt: question.prompt.trim(),
      description: question.description.trim() || null,
      isRequired: question.isRequired,
      sectionIndex: question.sectionIndex,
      questionType: question.questionType,
      ...(CHOICE_TYPES.has(question.questionType)
        ? { options: question.options.map((option) => ({ label: option.label.trim() })) }
        : {}),
      config: question.config,
    })),
    logic: state.logic.map((rule) => ({
      sourceQuestionIndex: rule.sourceQuestionIndex,
      operator: rule.operator,
      comparison: rule.comparison,
      action: rule.action,
      targetQuestionIndex: rule.targetQuestionIndex,
      targetSectionIndex: rule.targetSectionIndex,
    })),
  };
}

/**
 * Applies the client-side rules that the server schema enforces, returning a
 * message key for the first problem or `null` when the definition is valid.
 */
export function validateFormState(
  state: FormDefinitionState,
  publicSlugPattern: RegExp,
): string | null {
  if (!state.title.trim()) return "editor.validation.titleRequired";
  if (
    state.isPublic &&
    state.publicSlug.trim() &&
    !publicSlugPattern.test(state.publicSlug.trim())
  ) {
    return "editor.validation.slugInvalid";
  }
  if (state.sections.some((section) => !section.title.trim())) {
    return "editor.validation.sectionTitleRequired";
  }
  for (const question of state.questions) {
    if (!question.prompt.trim()) return "editor.validation.promptRequired";
    if (CHOICE_TYPES.has(question.questionType)) {
      const minimum = defaultOptionCount(question.questionType);
      if (
        question.options.length < minimum ||
        question.options.some((option) => !option.label.trim())
      ) {
        return "editor.validation.optionsRequired";
      }
    }
    if (
      question.sectionIndex !== null &&
      (question.sectionIndex < 0 || question.sectionIndex >= state.sections.length)
    ) {
      return "editor.validation.sectionInvalid";
    }
  }
  for (const rule of state.logic) {
    if (rule.sourceQuestionIndex >= state.questions.length) {
      return "editor.validation.logicSourceInvalid";
    }
    const hasQuestionTarget = rule.targetQuestionIndex !== null;
    const hasSectionTarget = rule.targetSectionIndex !== null;
    if (hasQuestionTarget === hasSectionTarget) {
      return "editor.validation.logicTargetInvalid";
    }
    if (hasQuestionTarget && rule.targetQuestionIndex === rule.sourceQuestionIndex) {
      return "editor.validation.logicTargetSame";
    }
    if (rule.action === "require" && hasSectionTarget) {
      return "editor.validation.logicRequireSection";
    }
    if (
      rule.operator !== "is_answered" &&
      rule.operator !== "is_not_answered" &&
      !Object.values(rule.comparison).some(
        (value) => value !== undefined && value !== null && value !== "",
      )
    ) {
      return "editor.validation.logicComparisonRequired";
    }
  }
  return null;
}
