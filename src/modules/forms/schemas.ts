import { z } from "zod";
import { AppError } from "@/lib/http/errors";

export const formStatusSchema = z.enum(["draft", "published", "archived"]);
export const formSubmissionModeSchema = z.enum(["identified", "anonymous"]);
export const formQuestionTypeSchema = z.enum([
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
]);
export const formLogicOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "contains",
  "is_answered",
  "is_not_answered",
  "greater_than",
  "less_than",
]);
export const formLogicActionSchema = z.enum(["show", "hide", "require"]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const PUBLIC_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

export const formOptionInputSchema = z.object({
  label: z.string().trim().min(1).max(200),
});

export const formSectionInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).nullable().optional(),
  pageBreakBefore: z.boolean().default(false),
});

const shortAnswerConfigSchema = z
  .object({
    minLength: z.coerce.number().int().min(0).max(5000).default(0),
    maxLength: z.coerce.number().int().min(1).max(5000).default(500),
    placeholder: z.string().trim().max(200).nullable().optional(),
  })
  .superRefine((config, ctx) => {
    if (config.minLength > config.maxLength) {
      ctx.addIssue({
        code: "custom",
        path: ["maxLength"],
        message: "mustBeAtLeastMinLength",
      });
    }
  });

const longAnswerConfigSchema = z
  .object({
    minLength: z.coerce.number().int().min(0).max(20000).default(0),
    maxLength: z.coerce.number().int().min(1).max(20000).default(5000),
    rows: z.coerce.number().int().min(3).max(20).default(5),
    placeholder: z.string().trim().max(300).nullable().optional(),
  })
  .superRefine((config, ctx) => {
    if (config.minLength > config.maxLength) {
      ctx.addIssue({
        code: "custom",
        path: ["maxLength"],
        message: "mustBeAtLeastMinLength",
      });
    }
  });

const choiceConfigSchema = z
  .object({
    shuffleOptions: z.boolean().default(false),
  })
  .prefault({});

const numberConfigSchema = z
  .object({
    min: z.number().finite().nullable().optional(),
    max: z.number().finite().nullable().optional(),
    integer: z.boolean().default(false),
    step: z.number().positive().finite().nullable().optional(),
  })
  .superRefine((config, ctx) => {
    if (config.min !== null && config.min !== undefined && config.max !== null && config.max !== undefined && config.min > config.max) {
      ctx.addIssue({ code: "custom", path: ["max"], message: "mustBeAtLeastMin" });
    }
  })
  .prefault({});

const dateConfigSchema = z
  .object({
    minDate: z.string().regex(ISO_DATE, "mustBeIsoDate").nullable().optional(),
    maxDate: z.string().regex(ISO_DATE, "mustBeIsoDate").nullable().optional(),
  })
  .superRefine((config, ctx) => {
    if (config.minDate && config.maxDate && config.minDate > config.maxDate) {
      ctx.addIssue({ code: "custom", path: ["maxDate"], message: "mustBeOnOrAfterMinDate" });
    }
  })
  .prefault({});

const timeConfigSchema = z
  .object({
    minTime: z.string().regex(ISO_TIME, "mustBeIsoTime").nullable().optional(),
    maxTime: z.string().regex(ISO_TIME, "mustBeIsoTime").nullable().optional(),
  })
  .superRefine((config, ctx) => {
    if (config.minTime && config.maxTime && config.minTime > config.maxTime) {
      ctx.addIssue({ code: "custom", path: ["maxTime"], message: "mustBeAtOrAfterMinTime" });
    }
  })
  .prefault({});

const fileUploadConfigSchema = z
  .object({
    maxFiles: z.coerce.number().int().min(1).max(5).default(1),
    maxSizeBytes: z.coerce.number().int().min(1).max(50 * 1024 * 1024).default(10 * 1024 * 1024),
    allowedMimeTypes: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  })
  .prefault({});

const ratingConfigSchema = z
  .object({
    max: z.coerce.number().int().min(3).max(10).default(5),
    icon: z.enum(["star", "heart"]).default("star"),
  })
  .prefault({});

const linearScaleConfigSchema = z
  .object({
    min: z.coerce.number().int().min(0).max(5).default(1),
    max: z.coerce.number().int().min(2).max(10).default(5),
    minLabel: z.string().trim().max(120).nullable().optional(),
    maxLabel: z.string().trim().max(120).nullable().optional(),
  })
  .superRefine((config, ctx) => {
    if (config.min >= config.max) {
      ctx.addIssue({ code: "custom", path: ["max"], message: "mustBeGreaterThanMin" });
    }
  })
  .prefault({});

const questionBase = {
  prompt: z.string().trim().min(1).max(2000),
  description: z.string().trim().max(1000).nullable().optional(),
  isRequired: z.boolean().default(false),
  sectionIndex: z.coerce.number().int().min(0).nullable().default(null),
};

const shortAnswerQuestionSchema = z.object({
  ...questionBase,
  questionType: z.literal("short_answer"),
  config: shortAnswerConfigSchema.prefault({}),
});

const longAnswerQuestionSchema = z.object({
  ...questionBase,
  questionType: z.literal("long_answer"),
  config: longAnswerConfigSchema.prefault({}),
});

const multipleChoiceQuestionSchema = z.object({
  ...questionBase,
  questionType: z.literal("multiple_choice"),
  options: z.array(formOptionInputSchema).min(2).max(50),
  config: choiceConfigSchema,
});

const checkboxesQuestionSchema = z.object({
  ...questionBase,
  questionType: z.literal("checkboxes"),
  options: z.array(formOptionInputSchema).min(2).max(50),
  config: choiceConfigSchema,
});

const dropdownQuestionSchema = z.object({
  ...questionBase,
  questionType: z.literal("dropdown"),
  options: z.array(formOptionInputSchema).min(1).max(50),
  config: choiceConfigSchema,
});

const numberQuestionSchema = z.object({
  ...questionBase,
  questionType: z.literal("number"),
  config: numberConfigSchema,
});

const dateQuestionSchema = z.object({
  ...questionBase,
  questionType: z.literal("date"),
  config: dateConfigSchema,
});

const timeQuestionSchema = z.object({
  ...questionBase,
  questionType: z.literal("time"),
  config: timeConfigSchema,
});

const fileUploadQuestionSchema = z.object({
  ...questionBase,
  questionType: z.literal("file_upload"),
  config: fileUploadConfigSchema,
});

const ratingQuestionSchema = z.object({
  ...questionBase,
  questionType: z.literal("rating"),
  config: ratingConfigSchema,
});

const linearScaleQuestionSchema = z.object({
  ...questionBase,
  questionType: z.literal("linear_scale"),
  config: linearScaleConfigSchema,
});

export const formQuestionInputSchema = z.discriminatedUnion("questionType", [
  shortAnswerQuestionSchema,
  longAnswerQuestionSchema,
  multipleChoiceQuestionSchema,
  checkboxesQuestionSchema,
  dropdownQuestionSchema,
  numberQuestionSchema,
  dateQuestionSchema,
  timeQuestionSchema,
  fileUploadQuestionSchema,
  ratingQuestionSchema,
  linearScaleQuestionSchema,
]);

export const formLogicInputSchema = z
  .object({
    sourceQuestionIndex: z.coerce.number().int().min(0),
    operator: formLogicOperatorSchema,
    comparison: z
      .object({
        optionIndex: z.coerce.number().int().min(0).optional(),
        text: z.string().trim().max(500).optional(),
        number: z.number().finite().optional(),
        date: z.string().regex(ISO_DATE, "mustBeIsoDate").optional(),
        time: z.string().regex(ISO_TIME, "mustBeIsoTime").optional(),
      })
      .prefault({}),
    action: formLogicActionSchema,
    targetQuestionIndex: z.coerce.number().int().min(0).nullable().default(null),
    targetSectionIndex: z.coerce.number().int().min(0).nullable().default(null),
  })
  .superRefine((rule, ctx) => {
    const hasQuestion = rule.targetQuestionIndex !== null;
    const hasSection = rule.targetSectionIndex !== null;
    if (hasQuestion === hasSection) {
      ctx.addIssue({
        code: "custom",
        path: ["targetQuestionIndex"],
        message: "exactlyOneTargetRequired",
      });
    }
    if (rule.sourceQuestionIndex === rule.targetQuestionIndex) {
      ctx.addIssue({
        code: "custom",
        path: ["targetQuestionIndex"],
        message: "sourceAndTargetMustDiffer",
      });
    }
    if (rule.action === "require" && rule.targetSectionIndex !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["targetSectionIndex"],
        message: "requireTargetsQuestionOnly",
      });
    }
    const needsComparison = !["is_answered", "is_not_answered"].includes(rule.operator);
    if (needsComparison) {
      const comparison = rule.comparison;
      const provided = Object.values(comparison).some(
        (value) => value !== undefined && value !== null && value !== "",
      );
      if (!provided) {
        ctx.addIssue({
          code: "custom",
          path: ["comparison"],
          message: "comparisonRequired",
        });
      }
    }
  });

export const formSettingsSchema = z
  .object({
    allowMultipleSubmissions: z.boolean().default(false),
    shuffleQuestions: z.boolean().default(false),
    showProgressBar: z.boolean().default(true),
  })
  .prefault({});

export const formDefinitionSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).nullable().optional(),
    submissionMode: formSubmissionModeSchema.default("identified"),
    isPublic: z.boolean().default(false),
    publicSlug: z.string().trim().regex(PUBLIC_SLUG, "mustBePublicSlug").nullable().optional(),
    acceptingResponses: z.boolean().default(true),
    confirmationMessage: z.string().trim().max(1000).nullable().optional(),
    settings: formSettingsSchema,
    sections: z.array(formSectionInputSchema).max(50).default([]),
    questions: z.array(formQuestionInputSchema).max(500).default([]),
    logic: z.array(formLogicInputSchema).max(500).default([]),
  })
  .superRefine((definition, ctx) => {
    const sectionCount = definition.sections.length;
    definition.questions.forEach((question, index) => {
      if (question.sectionIndex !== null && question.sectionIndex >= sectionCount) {
        ctx.addIssue({
          code: "custom",
          path: ["questions", index, "sectionIndex"],
          message: "sectionIndexOutOfRange",
        });
      }
    });

    definition.logic.forEach((rule, index) => {
      if (rule.sourceQuestionIndex >= definition.questions.length) {
        ctx.addIssue({
          code: "custom",
          path: ["logic", index, "sourceQuestionIndex"],
          message: "questionIndexOutOfRange",
        });
        return;
      }
      if (
        rule.targetQuestionIndex !== null &&
        rule.targetQuestionIndex >= definition.questions.length
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["logic", index, "targetQuestionIndex"],
          message: "questionIndexOutOfRange",
        });
      }
      if (
        rule.targetSectionIndex !== null &&
        rule.targetSectionIndex >= sectionCount
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["logic", index, "targetSectionIndex"],
          message: "sectionIndexOutOfRange",
        });
      }
      const source = definition.questions[rule.sourceQuestionIndex];
      const comparison = rule.comparison;
      if (
        comparison.optionIndex !== undefined &&
        source &&
        !("options" in source)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["logic", index, "comparison", "optionIndex"],
          message: "sourceQuestionHasNoOptions",
        });
      }
      if (
        comparison.optionIndex !== undefined &&
        source &&
        "options" in source &&
        comparison.optionIndex >= source.options.length
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["logic", index, "comparison", "optionIndex"],
          message: "optionIndexOutOfRange",
        });
      }
    });

    if (!definition.isPublic && definition.publicSlug) {
      ctx.addIssue({
        code: "custom",
        path: ["publicSlug"],
        message: "publicSlugRequiresPublicForm",
      });
    }
  });

export const formListQuerySchema = z.object({
  status: formStatusSchema.optional(),
});

export const formSettingsUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  submissionMode: formSubmissionModeSchema.optional(),
  isPublic: z.boolean().optional(),
  publicSlug: z.string().trim().regex(PUBLIC_SLUG, "mustBePublicSlug").nullable().optional(),
  acceptingResponses: z.boolean().optional(),
  confirmationMessage: z.string().trim().max(1000).nullable().optional(),
  settings: formSettingsSchema.optional(),
});

export const duplicateFormSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
  })
  .prefault({});

const answerValueSchema = z
  .object({
    text: z.string().max(20000).optional(),
    optionId: z.string().uuid().optional(),
    optionIds: z.array(z.string().uuid()).max(50).optional(),
    number: z.number().finite().optional(),
    date: z.string().regex(ISO_DATE, "mustBeIsoDate").optional(),
    time: z.string().regex(ISO_TIME, "mustBeIsoTime").optional(),
    fileIds: z.array(z.string().uuid()).max(5).optional(),
    rating: z.coerce.number().int().optional(),
    scaleValue: z.coerce.number().int().optional(),
  })
  .strict();

export const formAnswerInputSchema = z.object({
  questionId: z.string().uuid(),
  value: answerValueSchema,
});

export const submitFormResponseSchema = z
  .object({
    submissionToken: z.string().uuid().nullable().optional(),
    dedupeKey: z.string().nullable().optional(),
    studentId: z.string().uuid().nullable().optional(),
    submittedByUserId: z.string().trim().min(1).max(200).nullable().optional(),
    answers: z.array(formAnswerInputSchema).max(500).default([]),
  })
  .superRefine((submission, ctx) => {
    const seen = new Set<string>();
    submission.answers.forEach((answer, index) => {
      if (seen.has(answer.questionId)) {
        ctx.addIssue({
          code: "custom",
          path: ["answers", index, "questionId"],
          message: "duplicateQuestionAnswer",
        });
      }
      seen.add(answer.questionId);
    });
  });

export const formPublicSubmissionSchema = z
  .object({
    submissionToken: z.string().min(1).max(64).nullable().optional(),
    dedupeKey: z.string().min(8).max(128).nullable().optional(),
    studentId: z.string().uuid().nullable().optional(),
    submittedByUserId: z.string().trim().min(1).max(200).nullable().optional(),
    answers: z.array(formAnswerInputSchema).max(500).default([]),
  })
  .strict();

export const formPublicUploadSchema = z.object({
  questionId: z.string().uuid(),
  fileIds: z.array(z.string().uuid()).max(5),
  uploadSessionHash: z.string().min(1).max(128).nullable().optional(),
  dedupeKey: z.string().min(8).max(128).nullable().optional(),
});

export type FormPublicSubmission = z.infer<typeof formPublicSubmissionSchema>;
export type FormPublicUpload = z.infer<typeof formPublicUploadSchema>;

export const formSubmissionQuerySchema = z.object({
  formId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
});

export type FormStatus = z.infer<typeof formStatusSchema>;
export type FormSubmissionMode = z.infer<typeof formSubmissionModeSchema>;
export type FormQuestionType = z.infer<typeof formQuestionTypeSchema>;
export type FormLogicOperator = z.infer<typeof formLogicOperatorSchema>;
export type FormLogicAction = z.infer<typeof formLogicActionSchema>;
export type FormQuestionInput = z.infer<typeof formQuestionInputSchema>;
export type FormLogicInput = z.infer<typeof formLogicInputSchema>;
export type FormDefinitionInput = z.infer<typeof formDefinitionSchema>;
export type FormSettingsUpdateInput = z.infer<typeof formSettingsUpdateSchema>;
export type FormListQuery = z.infer<typeof formListQuerySchema>;
export type DuplicateFormInput = z.infer<typeof duplicateFormSchema>;
export type FormAnswerInput = z.infer<typeof formAnswerInputSchema>;
export type SubmitFormResponseInput = z.infer<typeof submitFormResponseSchema>;
export type FormSubmissionQuery = z.infer<typeof formSubmissionQuerySchema>;
export type AnswerValue = z.infer<typeof answerValueSchema>;

export function parseFormInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED");
  }
  return parsed.data;
}
