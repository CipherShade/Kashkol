import { describe, expect, it } from "vitest";
import {
  CHOICE_TYPES,
  defaultOptionCount,
  emptyQuestion,
  toDefinitionPayload,
  toFormState,
  validateFormState,
  type ApiFormDetail,
  type FormDefinitionState,
} from "@/modules/forms/editor-state";

const PUBLIC_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

function apiForm(overrides: Partial<ApiFormDetail> = {}): ApiFormDetail {
  return {
    id: "form-1",
    title: "Registration",
    description: null,
    status: "draft",
    submissionMode: "identified",
    isPublic: false,
    publicSlug: null,
    acceptingResponses: true,
    confirmationMessage: null,
    settingsJson: {
      allowMultipleSubmissions: false,
      shuffleQuestions: false,
      showProgressBar: true,
    },
    sections: [
      {
        id: "section-1",
        title: "Student details",
        description: null,
        orderIndex: 1,
        pageBreakBefore: false,
      },
      {
        id: "section-2",
        title: "Guardian details",
        description: "Optional",
        orderIndex: 2,
        pageBreakBefore: true,
      },
    ],
    questions: [
      {
        id: "question-1",
        sectionId: "section-1",
        orderIndex: 1,
        questionType: "short_answer",
        prompt: "Name",
        description: null,
        isRequired: true,
        configJson: { minLength: 1, maxLength: 120 },
        options: [],
      },
      {
        id: "question-2",
        sectionId: "section-2",
        orderIndex: 2,
        questionType: "multiple_choice",
        prompt: "Preferred contact",
        description: "Choose one",
        isRequired: false,
        configJson: { shuffleOptions: false },
        options: [
          { id: "option-1", label: "Phone", orderIndex: 1 },
          { id: "option-2", label: "Email", orderIndex: 2 },
        ],
      },
    ],
    logicRules: [
      {
        id: "rule-1",
        sourceQuestionId: "question-1",
        operator: "is_answered",
        comparisonJson: {},
        action: "show",
        targetQuestionId: "question-2",
        targetSectionId: null,
      },
      {
        id: "rule-2",
        sourceQuestionId: "question-2",
        operator: "equals",
        comparisonJson: { optionIndex: 0 },
        action: "show",
        targetSectionId: "section-1",
        targetQuestionId: null,
      },
    ],
    updatedAt: "2026-11-05T10:00:00.000Z",
    _count: { questions: 2, submissions: 0 },
    ...overrides,
  };
}

describe("toFormState", () => {
  it("maps section and question ids to indices and preserves the API order", () => {
    const state = toFormState(apiForm(), { sectionDefaultTitle: "Section" });

    expect(state.sections.map((section) => section.title)).toEqual([
      "Student details",
      "Guardian details",
    ]);
    expect(state.questions[0].sectionIndex).toBe(0);
    expect(state.questions[1].sectionIndex).toBe(1);
    expect(state.questions[1].options.map((option) => option.label)).toEqual([
      "Phone",
      "Email",
    ]);
    expect(state.logic[0].sourceQuestionIndex).toBe(0);
    expect(state.logic[0].targetQuestionIndex).toBe(1);
    expect(state.logic[1].targetSectionIndex).toBe(0);
    expect(state.logic[1].targetQuestionIndex).toBeNull();
    expect(state.submissionCount).toBe(0);
  });

  it("drops logic rules whose source or target no longer exists", () => {
    const state = toFormState(
      apiForm({
        logicRules: [
          {
            id: "rule-orphan",
            sourceQuestionId: "question-removed",
            operator: "is_answered",
            comparisonJson: {},
            action: "show",
            targetQuestionId: "question-2",
            targetSectionId: null,
          },
          {
            id: "rule-valid",
            sourceQuestionId: "question-1",
            operator: "is_answered",
            comparisonJson: {},
            action: "show",
            targetQuestionId: "question-2",
            targetSectionId: null,
          },
          {
            id: "rule-missing-target",
            sourceQuestionId: "question-1",
            operator: "is_answered",
            comparisonJson: {},
            action: "show",
            targetQuestionId: "question-removed",
            targetSectionId: null,
          },
        ],
      }),
      { sectionDefaultTitle: "Section" },
    );

    expect(state.logic).toHaveLength(1);
    expect(state.logic[0].key).toBe("rule-valid");
  });

  it("adds a default section when the form has none", () => {
    const state = toFormState(
      apiForm({ sections: [], questions: [], logicRules: [] }),
      { sectionDefaultTitle: "Section" },
    );

    expect(state.sections).toHaveLength(1);
    expect(state.sections[0].title).toBe("Section");
  });

  it("defaults missing settings without losing an explicit false progress bar", () => {
    const state = toFormState(
      apiForm({ settingsJson: { showProgressBar: false } }),
      { sectionDefaultTitle: "Section" },
    );

    expect(state.settings).toEqual({
      allowMultipleSubmissions: false,
      shuffleQuestions: false,
      showProgressBar: false,
    });
    expect(state.acceptingResponses).toBe(true);
  });
});

describe("question helpers", () => {
  it("creates the minimum number of options for each choice type", () => {
    expect(defaultOptionCount("dropdown")).toBe(1);
    expect(defaultOptionCount("multiple_choice")).toBe(2);
    expect(defaultOptionCount("checkboxes")).toBe(2);
    expect(defaultOptionCount("short_answer")).toBe(2);

    for (const type of CHOICE_TYPES) {
      const question = emptyQuestion(type, 0, "Question", "Option");
      expect(question.options).toHaveLength(defaultOptionCount(type));
      expect(question.questionType).toBe(type);
    }
  });

  it("does not add options to non-choice questions", () => {
    const question = emptyQuestion("number", null, "Age", "Option");
    expect(question.options).toEqual([]);
    expect(question.sectionIndex).toBeNull();
  });
});

describe("validateFormState", () => {
  function validState(): FormDefinitionState {
    return toFormState(apiForm(), { sectionDefaultTitle: "Section" });
  }

  it("accepts a valid definition", () => {
    expect(validateFormState(validState(), PUBLIC_SLUG)).toBeNull();
  });

  it("rejects a choice question with too few options", () => {
    const state = validState();
    state.questions[1].options = [{ label: "Only one" }];
    expect(validateFormState(state, PUBLIC_SLUG)).toBe(
      "editor.validation.optionsRequired",
    );
  });

  it("rejects a logic rule that targets a section with the require action", () => {
    const state = validState();
    state.logic[1].action = "require";
    expect(validateFormState(state, PUBLIC_SLUG)).toBe(
      "editor.validation.logicRequireSection",
    );
  });

  it("rejects a logic rule without a comparison value", () => {
    const state = validState();
    state.logic[1].comparison = {};
    expect(validateFormState(state, PUBLIC_SLUG)).toBe(
      "editor.validation.logicComparisonRequired",
    );
  });

  it("rejects an invalid public slug only when the form is public", () => {
    const state = validState();
    state.isPublic = false;
    state.publicSlug = "Not A Slug";
    expect(validateFormState(state, PUBLIC_SLUG)).toBeNull();

    state.isPublic = true;
    expect(validateFormState(state, PUBLIC_SLUG)).toBe(
      "editor.validation.slugInvalid",
    );
  });
});

describe("toDefinitionPayload", () => {
  function state(): FormDefinitionState {
    return toFormState(apiForm(), { sectionDefaultTitle: "Section" });
  }

  it("sends trimmed text, mapped indices and options only for choice types", () => {
    const current = state();
    current.title = "  Registration  ";
    current.publicSlug = "  registration  ";
    current.isPublic = true;

    const payload = toDefinitionPayload(current);

    expect(payload.title).toBe("Registration");
    expect(payload.publicSlug).toBe("registration");
    expect(payload.sections[0]).toEqual({
      title: "Student details",
      description: null,
      pageBreakBefore: false,
    });
    expect(payload.questions[0]).not.toHaveProperty("options");
    expect(payload.questions[1].options).toEqual([
      { label: "Phone" },
      { label: "Email" },
    ]);
    expect(payload.logic[0]).toEqual({
      sourceQuestionIndex: 0,
      operator: "is_answered",
      comparison: {},
      action: "show",
      targetQuestionIndex: 1,
      targetSectionIndex: null,
    });
  });

  it("drops the public slug when the form is not public", () => {
    const current = state();
    current.isPublic = false;
    current.publicSlug = "registration";
    expect(toDefinitionPayload(current).publicSlug).toBeNull();
  });

  it("changes when an editable field changes, which is what marks the draft dirty", () => {
    const current = state();
    const baseline = JSON.stringify(toDefinitionPayload(current));

    current.questions[0].prompt = "Full name";

    expect(JSON.stringify(toDefinitionPayload(current))).not.toBe(baseline);
  });

  it("matches the saved baseline after trimming-only edits are normalised", () => {
    const current = state();
    const baseline = JSON.stringify(toDefinitionPayload(current));

    current.title = `  ${current.title}  `;
    current.description = "   ";

    expect(JSON.stringify(toDefinitionPayload(current))).toBe(baseline);
  });
});
