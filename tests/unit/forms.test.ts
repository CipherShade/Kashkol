import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/http/errors";
import {
  computeFormVisibility,
  logicConditionMatches,
  parseLogicComparison,
  type FormLogicRule,
  type LogicQuestion,
} from "@/modules/forms/logic";
import {
  formDefinitionSchema,
  formQuestionInputSchema,
  parseFormInput,
  submitFormResponseSchema,
} from "@/modules/forms/schemas";
import { validateAnswerValue } from "@/modules/forms/validation";
import {
  grantablePermissions,
  isAllowed,
  isGrantable,
  isSensitivePermission,
  permissionKey,
  type Permission,
  type Scope,
} from "@/modules/tenancy/types";

function question(type: string, extra: Record<string, unknown> = {}) {
  const result = formQuestionInputSchema.safeParse({
    questionType: type,
    prompt: "Question",
    ...extra,
  });
  if (!result.success) {
    throw new Error(`expected ${type} to parse: ${result.error.message}`);
  }
  return result.data;
}

describe("forms schemas", () => {
  it("applies stable defaults to a minimal form definition", () => {
    const definition = formDefinitionSchema.parse({ title: "Feedback" });
    expect(definition).toMatchObject({
      title: "Feedback",
      submissionMode: "identified",
      isPublic: false,
      acceptingResponses: true,
      sections: [],
      questions: [],
      logic: [],
      settings: {
        allowMultipleSubmissions: false,
        shuffleQuestions: false,
        showProgressBar: true,
      },
    });
    expect(definition.publicSlug).toBeUndefined();
  });

  it("parses every supported question type with usable defaults", () => {
    expect(question("short_answer")).toMatchObject({
      questionType: "short_answer",
      isRequired: false,
      sectionIndex: null,
      config: { minLength: 0, maxLength: 500 },
    });
    expect(question("long_answer")).toMatchObject({
      config: { minLength: 0, maxLength: 5000, rows: 5 },
    });
    expect(
      question("multiple_choice", { options: [{ label: "A" }, { label: "B" }] }),
    ).toMatchObject({ config: { shuffleOptions: false } });
    expect(question("checkboxes", { options: [{ label: "A" }, { label: "B" }] })).toMatchObject({
      config: { shuffleOptions: false },
    });
    expect(question("dropdown", { options: [{ label: "Only" }] })).toMatchObject({
      config: { shuffleOptions: false },
    });
    expect(question("number")).toMatchObject({ config: { integer: false } });
    expect(question("date")).toMatchObject({ config: {} });
    expect(question("time")).toMatchObject({ config: {} });
    expect(question("file_upload")).toMatchObject({
      config: { maxFiles: 1, maxSizeBytes: 10 * 1024 * 1024, allowedMimeTypes: [] },
    });
    expect(question("rating")).toMatchObject({ config: { max: 5, icon: "star" } });
    expect(question("linear_scale")).toMatchObject({ config: { min: 1, max: 5 } });
  });

  it("requires at least two options for multiple choice and checkboxes", () => {
    expect(
      formQuestionInputSchema.safeParse({
        questionType: "multiple_choice",
        prompt: "Pick",
        options: [{ label: "One" }],
      }).success,
    ).toBe(false);
    expect(
      formQuestionInputSchema.safeParse({
        questionType: "checkboxes",
        prompt: "Pick",
        options: [{ label: "One" }],
      }).success,
    ).toBe(false);
    expect(
      formQuestionInputSchema.safeParse({
        questionType: "dropdown",
        prompt: "Pick",
        options: [{ label: "One" }],
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown question type", () => {
    expect(
      formQuestionInputSchema.safeParse({ questionType: "signature", prompt: "Sign" }).success,
    ).toBe(false);
  });

  it("rejects a public slug when the form is not public", () => {
    const result = formDefinitionSchema.safeParse({
      title: "Private",
      publicSlug: "my-form",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed public slug", () => {
    const result = formDefinitionSchema.safeParse({
      title: "Public",
      isPublic: true,
      publicSlug: "Not A Slug!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a question that points at a missing section", () => {
    const result = formDefinitionSchema.safeParse({
      title: "Sections",
      questions: [{ questionType: "short_answer", prompt: "Question", sectionIndex: 2 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a logic rule whose source or target is out of range", () => {
    expect(
      formDefinitionSchema.safeParse({
        title: "Logic",
        questions: [{ questionType: "short_answer", prompt: "Question" }],
        logic: [
          {
            sourceQuestionIndex: 1,
            operator: "is_answered",
            action: "show",
            targetQuestionIndex: 0,
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      formDefinitionSchema.safeParse({
        title: "Logic",
        questions: [{ questionType: "short_answer", prompt: "Question" }],
        logic: [
          {
            sourceQuestionIndex: 0,
            operator: "is_answered",
            action: "show",
            targetQuestionIndex: 4,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires exactly one target and a comparison when the operator needs one", () => {
    const base = { sourceQuestionIndex: 0, action: "show" as const };
    expect(
      formDefinitionSchema.safeParse({
        title: "Logic",
        questions: [{ questionType: "short_answer", prompt: "Question" }],
        logic: [{ ...base, operator: "is_answered" }],
      }).success,
    ).toBe(false);
    expect(
      formDefinitionSchema.safeParse({
        title: "Logic",
        questions: [{ questionType: "short_answer", prompt: "Question" }],
        logic: [{ ...base, operator: "equals", targetQuestionIndex: 0 }],
      }).success,
    ).toBe(false);
    expect(
      formDefinitionSchema.safeParse({
        title: "Logic",
        questions: [{ questionType: "short_answer", prompt: "Question" }],
        logic: [
          {
            ...base,
            operator: "is_answered",
            targetQuestionIndex: 0,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects a comparison option index on a question without options", () => {
    const result = formDefinitionSchema.safeParse({
      title: "Logic",
      isPublic: true,
      sections: [],
      questions: [
        { questionType: "short_answer", prompt: "Source" },
        { questionType: "short_answer", prompt: "Target" },
      ],
      logic: [
        {
          sourceQuestionIndex: 0,
          operator: "equals",
          comparison: { optionIndex: 0 },
          action: "show",
          targetQuestionIndex: 1,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid conditional rule and maps defaults", () => {
    const result = formDefinitionSchema.parse({
      title: "Logic",
      questions: [
        {
          questionType: "multiple_choice",
          prompt: "Source",
          options: [{ label: "A" }, { label: "B" }],
        },
        { questionType: "short_answer", prompt: "Target" },
      ],
      logic: [
        {
          sourceQuestionIndex: 0,
          operator: "equals",
          comparison: { optionIndex: 0 },
          action: "require",
          targetQuestionIndex: 1,
        },
      ],
    });
    expect(result.logic[0]).toMatchObject({
      comparison: { optionIndex: 0 },
      targetQuestionIndex: 1,
      targetSectionIndex: null,
    });
  });

  it("rejects a `require` rule that targets a section", () => {
    const result = formDefinitionSchema.safeParse({
      title: "Logic",
      sections: [{ title: "Page" }],
      questions: [
        { questionType: "short_answer", prompt: "Source" },
        { questionType: "short_answer", prompt: "Target", sectionIndex: 0 },
      ],
      logic: [
        {
          sourceQuestionIndex: 0,
          operator: "is_answered",
          action: "require",
          targetSectionIndex: 0,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate answers in one submission", () => {
    const id = "30000000-0000-4000-8000-000000000001";
    const result = submitFormResponseSchema.safeParse({
      answers: [
        { questionId: id, value: { text: "one" } },
        { questionId: id, value: { text: "two" } },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("throws a typed validation error through parseFormInput", () => {
    expect(() => parseFormInput(formDefinitionSchema, { title: "" })).toThrow(AppError);
  });
});

describe("forms conditional logic", () => {
  const sections = [{ id: "section-a" }, { id: "section-b" }];
  const questions: LogicQuestion[] = [
    { id: "q1", sectionId: null, isRequired: false, questionType: "multiple_choice" },
    { id: "q2", sectionId: "section-a", isRequired: false, questionType: "short_answer" },
    { id: "q3", sectionId: "section-b", isRequired: true, questionType: "short_answer" },
  ];

  it("evaluates comparison operators without treating a missing value as a wildcard", () => {
    expect(logicConditionMatches("equals", { optionId: "opt-a" }, { optionId: "opt-a" })).toBe(
      true,
    );
    expect(logicConditionMatches("equals", { optionId: "opt-a" }, { optionId: "opt-b" })).toBe(
      false,
    );
    expect(logicConditionMatches("contains", { text: "lit" }, { text: "quality" })).toBe(true);
    expect(logicConditionMatches("greater_than", { number: 5 }, { number: 6 })).toBe(true);
    expect(logicConditionMatches("less_than", { number: 5 }, { number: 6 })).toBe(false);
    expect(logicConditionMatches("is_answered", {}, { text: "yes" })).toBe(true);
    expect(logicConditionMatches("is_answered", {}, { text: "   " })).toBe(false);
    expect(logicConditionMatches("is_not_answered", {}, undefined)).toBe(true);
    expect(logicConditionMatches("equals", {}, { text: "anything" })).toBe(false);
  });

  it("parses a persisted comparison defensively", () => {
    expect(parseLogicComparison(null)).toEqual({});
    expect(parseLogicComparison({ optionId: "x", ignored: 1 })).toEqual({ optionId: "x" });
  });

  it("hides a question when a hide rule matches", () => {
    const rules: FormLogicRule[] = [
      {
        sourceQuestionId: "q1",
        operator: "equals",
        comparison: { optionId: "opt-no" },
        action: "hide",
        targetQuestionId: "q2",
      },
    ];
    const visibility = computeFormVisibility(
      sections,
      questions,
      rules,
      new Map([["q1", { optionId: "opt-no" }]]),
    );
    expect(visibility.visibleQuestionIds.has("q2")).toBe(false);
    expect(visibility.visibleQuestionIds.has("q3")).toBe(true);
  });

  it("only shows a question after a show rule matches", () => {
    const rules: FormLogicRule[] = [
      {
        sourceQuestionId: "q1",
        operator: "equals",
        comparison: { optionId: "opt-yes" },
        action: "show",
        targetQuestionId: "q2",
      },
    ];
    const before = computeFormVisibility(sections, questions, rules, new Map());
    expect(before.visibleQuestionIds.has("q2")).toBe(false);

    const after = computeFormVisibility(
      sections,
      questions,
      rules,
      new Map([["q1", { optionId: "opt-yes" }]]),
    );
    expect(after.visibleQuestionIds.has("q2")).toBe(true);
  });

  it("adds a conditional requirement while the target is visible", () => {
    const rules: FormLogicRule[] = [
      {
        sourceQuestionId: "q1",
        operator: "is_answered",
        comparison: {},
        action: "require",
        targetQuestionId: "q2",
      },
    ];
    const visibility = computeFormVisibility(
      sections,
      questions,
      rules,
      new Map([["q1", { text: "answered" }]]),
    );
    expect(visibility.requiredQuestionIds.has("q2")).toBe(true);
  });

  it("hides every question in a hidden section", () => {
    const rules: FormLogicRule[] = [
      {
        sourceQuestionId: "q1",
        operator: "equals",
        comparison: { optionId: "opt-hide" },
        action: "hide",
        targetSectionId: "section-a",
      },
    ];
    const visibility = computeFormVisibility(
      sections,
      questions,
      rules,
      new Map([["q1", { optionId: "opt-hide" }]]),
    );
    expect(visibility.visibleSectionIds.has("section-a")).toBe(false);
    expect(visibility.visibleQuestionIds.has("q2")).toBe(false);
    expect(visibility.visibleQuestionIds.has("q3")).toBe(true);
  });
});

describe("form answer validation", () => {
  const optionIds = new Set(["30000000-0000-4000-8000-000000000001"]);

  function validate(
    questionType: Parameters<typeof validateAnswerValue>[0]["questionType"],
    config: unknown,
    answer: Parameters<typeof validateAnswerValue>[1],
    options: ReadonlySet<string> = optionIds,
  ) {
    return validateAnswerValue({ id: "q", questionType, config, optionIds: options }, answer);
  }

  it("validates text length", () => {
    expect(validate("short_answer", { minLength: 2, maxLength: 4 }, { text: "ab" }).ok).toBe(true);
    expect(validate("short_answer", { minLength: 2, maxLength: 4 }, { text: "a" }).ok).toBe(false);
    expect(
      validate("long_answer", { minLength: 0, maxLength: 10 }, { text: "x".repeat(11) }).ok,
    ).toBe(false);
  });

  it("validates choice options", () => {
    expect(validate("multiple_choice", {}, { optionId: [...optionIds][0] }).ok).toBe(true);
    expect(validate("multiple_choice", {}, { optionId: "foreign" })).toMatchObject({
      ok: false,
      messageKey: "errors.formOptionInvalid",
    });
    expect(validate("dropdown", {}, {}).ok).toBe(false);
  });

  it("validates checkbox answers", () => {
    expect(validate("checkboxes", {}, { optionIds: [...optionIds] }).ok).toBe(true);
    expect(validate("checkboxes", {}, { optionIds: [] }).ok).toBe(false);
    expect(
      validate("checkboxes", {}, { optionIds: [[...optionIds][0], [...optionIds][0]] }).ok,
    ).toBe(false);
    expect(validate("checkboxes", {}, { optionIds: ["foreign"] }).ok).toBe(false);
  });

  it("validates numbers including integer, bounds, and step", () => {
    expect(validate("number", { integer: true }, { number: 3 }).ok).toBe(true);
    expect(validate("number", { integer: true }, { number: 3.5 }).ok).toBe(false);
    expect(validate("number", { min: 2, max: 4 }, { number: 1 }).ok).toBe(false);
    expect(validate("number", { min: 2, max: 4 }, { number: 5 }).ok).toBe(false);
    expect(validate("number", { min: 0, step: 5 }, { number: 10 }).ok).toBe(true);
    expect(validate("number", { min: 0, step: 5 }, { number: 7 }).ok).toBe(false);
  });

  it("validates dates and times against their bounds", () => {
    expect(validate("date", { minDate: "2026-01-01" }, { date: "2025-12-31" }).ok).toBe(false);
    expect(validate("date", { maxDate: "2026-01-01" }, { date: "2026-01-02" }).ok).toBe(false);
    expect(validate("date", {}, { date: "2026-01-01" }).ok).toBe(true);
    expect(validate("date", {}, { date: "01/01/2026" }).ok).toBe(false);
    expect(validate("time", { minTime: "09:00" }, { time: "08:59" }).ok).toBe(false);
    expect(validate("time", { maxTime: "17:00" }, { time: "17:01" }).ok).toBe(false);
    expect(validate("time", {}, { time: "12:30" }).ok).toBe(true);
    expect(validate("time", {}, { time: "24:00" }).ok).toBe(false);
  });

  it("validates file-upload counts", () => {
    expect(
      validate(
        "file_upload",
        { maxFiles: 2 },
        {
          fileIds: ["40000000-0000-4000-8000-000000000001", "40000000-0000-4000-8000-000000000002"],
        },
      ).ok,
    ).toBe(true);
    expect(
      validate(
        "file_upload",
        { maxFiles: 1 },
        {
          fileIds: ["40000000-0000-4000-8000-000000000001", "40000000-0000-4000-8000-000000000002"],
        },
      ).ok,
    ).toBe(false);
    expect(validate("file_upload", { maxFiles: 1 }, { fileIds: [] }).ok).toBe(false);
  });

  it("validates rating and linear-scale ranges", () => {
    expect(validate("rating", { max: 5 }, { rating: 5 }).ok).toBe(true);
    expect(validate("rating", { max: 5 }, { rating: 6 }).ok).toBe(false);
    expect(validate("rating", { max: 5 }, { rating: 2.5 }).ok).toBe(false);
    expect(validate("linear_scale", { min: 1, max: 5 }, { scaleValue: 1 }).ok).toBe(true);
    expect(validate("linear_scale", { min: 1, max: 5 }, { scaleValue: 0 }).ok).toBe(false);
    expect(validate("linear_scale", { min: 1, max: 5 }, { scaleValue: 6 }).ok).toBe(false);
  });
});

describe("forms permissions", () => {
  const owner: Scope = {
    workspaceId: "00000000-0000-4000-8000-000000000001",
    actorUserId: "10000000-0000-4000-8000-000000000001",
    actorDisplayName: "Owner",
    role: "owner",
    permissions: new Set<Permission>(),
  };

  const assistantWithoutForms: Scope = {
    ...owner,
    role: "assistant",
    permissions: new Set<Permission>(["students:read"]),
  };

  const assistantWithForms: Scope = {
    ...owner,
    role: "assistant",
    permissions: new Set<Permission>([permissionKey("forms", "read")]),
  };

  it("makes forms read and write grantable and sensitive", () => {
    expect(isGrantable("forms", "read")).toBe(true);
    expect(isGrantable("forms", "write")).toBe(true);
    expect(isSensitivePermission("forms", "read")).toBe(true);
    expect(isSensitivePermission("forms", "write")).toBe(true);
    expect(grantablePermissions().filter((permission) => permission.resource === "forms")).toEqual([
      { resource: "forms", action: "read" },
      { resource: "forms", action: "write" },
    ]);
  });

  it("denies an assistant without the forms grant and allows it with one", () => {
    expect(isAllowed(assistantWithoutForms, "forms", "read")).toBe(false);
    expect(isAllowed(assistantWithForms, "forms", "read")).toBe(true);
    expect(isAllowed(assistantWithForms, "forms", "write")).toBe(false);
    expect(isAllowed(owner, "forms", "write")).toBe(true);
  });
});
