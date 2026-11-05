import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import { AppError } from "@/lib/http/errors";
import { formAuditActions } from "@/modules/forms/audit";
import {
  formDefinitionSchema,
  parseFormInput,
  type FormDefinitionInput,
} from "@/modules/forms/schemas";
import {
  archiveForm,
  createForm,
  duplicateForm,
  getForm,
  getFormSubmission,
  listForms,
  listFormSubmissions,
  publishForm,
  submitFormResponse,
  updateFormDraft,
  updateFormSettings,
} from "@/modules/forms/service";
import type { Permission, Scope } from "@/modules/tenancy/types";
import { permissionKey } from "@/modules/tenancy/types";
import {
  DELTA,
  DELTA_OWNER,
  NILE,
  NILE_ASSISTANT,
  NILE_OWNER,
  createStudent,
  deleteStudent,
  ownerScope,
} from "./helpers";

type TrackedForm = { workspaceId: string; id: string };
type TrackedFile = { workspaceId: string; id: string };

const forms: TrackedForm[] = [];
const files: TrackedFile[] = [];
const students: Array<{ workspaceId: string; id: string }> = [];

function deltaOwnerScope(): Scope {
  return {
    workspaceId: DELTA,
    actorUserId: DELTA_OWNER,
    actorDisplayName: "Delta owner",
    role: "owner",
    permissions: new Set<Permission>(),
  };
}

function assistantScope(permissions: Permission[]): Scope {
  return {
    workspaceId: NILE,
    actorUserId: NILE_ASSISTANT,
    actorDisplayName: "Omar",
    role: "assistant",
    permissions: new Set<Permission>(permissions),
  };
}

function definition(input: Record<string, unknown> = {}): FormDefinitionInput {
  return formDefinitionSchema.parse({ title: "Test form", ...input });
}

function trackForm(scope: Scope, id: string): void {
  forms.push({ workspaceId: scope.workspaceId, id });
}

async function createFile(
  workspaceId: string,
  overrides: {
    mime?: string;
    sizeBytes?: number;
    scanStatus?: "pending" | "clean" | "blocked";
    archivedAt?: Date | null;
  } = {},
): Promise<string> {
  const id = randomUUID();
  const storageKey = `ws/${workspaceId}/${randomUUID()}.bin`;
  const uploadedBy = workspaceId === DELTA ? DELTA_OWNER : NILE_OWNER;
  await withScope({ workspaceId }, (tx) =>
    tx.file.create({
      data: {
        id,
        workspaceId,
        scope: "teacher_only",
        title: "Form upload",
        storageKey,
        sizeBytes: overrides.sizeBytes ?? 8,
        mime: overrides.mime ?? "application/pdf",
        scanStatus: overrides.scanStatus ?? "clean",
        uploadedBy,
        archivedAt: overrides.archivedAt ?? null,
      },
    }),
  );
  files.push({ workspaceId, id });
  return id;
}

async function createPublishedForm(
  scope: Scope,
  input: Record<string, unknown>,
): Promise<{ formId: string; detail: Awaited<ReturnType<typeof getForm>> }> {
  const created = await createForm(scope, definition(input));
  trackForm(scope, created.id);
  await publishForm(scope, created.id);
  const detail = await getForm(scope, created.id);
  return { formId: created.id, detail };
}

afterEach(async () => {
  for (const workspaceId of [NILE, DELTA]) {
    const ids = forms.filter((item) => item.workspaceId === workspaceId).map((item) => item.id);
    if (ids.length > 0) {
      await withScope({ workspaceId }, async (tx) => {
        await tx.formAnswerFile.deleteMany({
          where: {
            workspaceId,
            answer: { submission: { formId: { in: ids } } },
          },
        });
        await tx.formAnswer.deleteMany({
          where: { workspaceId, submission: { formId: { in: ids } } },
        });
        await tx.formSubmission.deleteMany({ where: { workspaceId, formId: { in: ids } } });
        await tx.formQuestionLogic.deleteMany({ where: { workspaceId, formId: { in: ids } } });
        await tx.formQuestionOption.deleteMany({
          where: { workspaceId, question: { formId: { in: ids } } },
        });
        await tx.formQuestion.deleteMany({ where: { workspaceId, formId: { in: ids } } });
        await tx.formSection.deleteMany({ where: { workspaceId, formId: { in: ids } } });
        await tx.form.deleteMany({ where: { workspaceId, id: { in: ids } } });
      });
    }
  }
  forms.length = 0;

  for (const file of files.splice(0)) {
    await withScope({ workspaceId: file.workspaceId }, (tx) =>
      tx.file.deleteMany({ where: { workspaceId: file.workspaceId, id: file.id } }),
    );
  }

  for (const student of students.splice(0)) {
    await deleteStudent(student.workspaceId, student.id);
  }
});

afterAll(async () => {
  await disconnectDb();
});

describe("forms service", () => {
  it("creates and reads a form with every supported question type", async () => {
    const created = await createForm(
      ownerScope(),
      definition({
        title: "Start of term survey",
        description: "Tell us what you need",
        sections: [{ title: "About you", pageBreakBefore: true }],
        questions: [
          { questionType: "short_answer", prompt: "Name", sectionIndex: 0 },
          { questionType: "long_answer", prompt: "Goals", sectionIndex: 0 },
          {
            questionType: "multiple_choice",
            prompt: "Preferred time",
            sectionIndex: 0,
            options: [{ label: "Morning" }, { label: "Evening" }],
          },
          {
            questionType: "checkboxes",
            prompt: "Subjects",
            sectionIndex: 0,
            options: [{ label: "Math" }, { label: "Science" }],
          },
          {
            questionType: "dropdown",
            prompt: "Grade",
            sectionIndex: 0,
            options: [{ label: "Grade 10" }],
          },
          { questionType: "number", prompt: "Age", sectionIndex: 0 },
          { questionType: "date", prompt: "Start date", sectionIndex: 0 },
          { questionType: "time", prompt: "Arrival", sectionIndex: 0 },
          { questionType: "file_upload", prompt: "Report", sectionIndex: 0 },
          { questionType: "rating", prompt: "Confidence", sectionIndex: 0 },
          { questionType: "linear_scale", prompt: "Difficulty", sectionIndex: 0 },
        ],
      }),
    );
    trackForm(ownerScope(), created.id);
    expect(created.status).toBe("draft");

    const detail = await getForm(ownerScope(), created.id);
    expect(detail.questions.map((question) => question.questionType)).toEqual([
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
    expect(detail.sections).toHaveLength(1);
    expect(detail.sections[0]).toMatchObject({ title: "About you", pageBreakBefore: true });
    expect(detail.questions[2].options.map((option) => option.label)).toEqual([
      "Morning",
      "Evening",
    ]);
    expect(detail.questions[9].configJson).toMatchObject({ max: 5, icon: "star" });
    expect(detail.questions[10].configJson).toMatchObject({ min: 1, max: 5 });
    expect(detail.questions[8].configJson).toMatchObject({ maxFiles: 1 });

    const updated = await updateFormDraft(
      ownerScope(),
      created.id,
      definition({
        title: "Updated survey",
        sections: [{ title: "Page one" }],
        questions: [{ questionType: "short_answer", prompt: "Only question", sectionIndex: 0 }],
      }),
    );
    expect(updated.title).toBe("Updated survey");

    const afterUpdate = await getForm(ownerScope(), created.id);
    expect(afterUpdate.questions).toHaveLength(1);
    expect(afterUpdate.questions[0].prompt).toBe("Only question");
    expect(afterUpdate.sections).toHaveLength(1);
    expect(afterUpdate.title).toBe("Updated survey");
  });

  it("filters the form list by status", async () => {
    const draft = await createForm(ownerScope(), definition({ title: "Draft only" }));
    trackForm(ownerScope(), draft.id);
    const published = await createPublishedForm(ownerScope(), {
      title: "Published form",
      questions: [{ questionType: "short_answer", prompt: "Question" }],
    });

    const publishedRows = await listForms(ownerScope(), { status: "published" });
    expect(publishedRows.some((row) => row.id === published.formId)).toBe(true);
    expect(publishedRows.some((row) => row.id === draft.id)).toBe(false);

    const draftRows = await listForms(ownerScope(), { status: "draft" });
    expect(draftRows.some((row) => row.id === draft.id)).toBe(true);
    expect(draftRows.some((row) => row.id === published.formId)).toBe(false);
  });

  it("enforces the draft, published, and archived lifecycle", async () => {
    const empty = await createForm(ownerScope(), definition({ title: "Empty" }));
    trackForm(ownerScope(), empty.id);
    await expect(publishForm(ownerScope(), empty.id)).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "errors.formHasNoQuestions",
    });

    const form = await createForm(
      ownerScope(),
      definition({
        title: "Lifecycle",
        questions: [{ questionType: "short_answer", prompt: "Question", isRequired: true }],
      }),
    );
    trackForm(ownerScope(), form.id);

    const published = await publishForm(ownerScope(), form.id);
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();

    await expect(publishForm(ownerScope(), form.id)).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "errors.formNotEditable",
    });
    await expect(
      updateFormDraft(
        ownerScope(),
        form.id,
        definition({
          title: "Changed",
          questions: [{ questionType: "short_answer", prompt: "Q" }],
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", messageKey: "errors.formNotEditable" });

    const archived = await archiveForm(ownerScope(), form.id);
    expect(archived.status).toBe("archived");
    expect(archived.acceptingResponses).toBe(false);

    await expect(archiveForm(ownerScope(), form.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      updateFormSettings(ownerScope(), form.id, { title: "After archive" }),
    ).rejects.toMatchObject({ code: "CONFLICT", messageKey: "errors.formNotEditable" });
    await expect(submitFormResponse(ownerScope(), form.id, { answers: [] })).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "errors.formNotAcceptingResponses",
    });
  });

  it("manages public settings and a globally unique slug", async () => {
    const created = await createForm(
      ownerScope(),
      definition({
        title: "Public form",
        isPublic: true,
        questions: [{ questionType: "short_answer", prompt: "Question" }],
      }),
    );
    trackForm(ownerScope(), created.id);
    expect(created.publicSlug).toMatch(/^[a-z0-9]{18}$/);

    const slug = `survey-${randomUUID().slice(0, 8)}`;
    const updated = await updateFormSettings(ownerScope(), created.id, { publicSlug: slug });
    expect(updated.publicSlug).toBe(slug);

    const other = await createForm(ownerScope(), definition({ title: "Other public form" }));
    trackForm(ownerScope(), other.id);
    await expect(
      updateFormSettings(ownerScope(), other.id, { isPublic: true, publicSlug: slug }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const privateAgain = await updateFormSettings(ownerScope(), created.id, { isPublic: false });
    expect(privateAgain.isPublic).toBe(false);
    expect(privateAgain.publicSlug).toBeNull();
  });

  it("duplicates a published form as a draft without copying submissions", async () => {
    const { formId, detail } = await createPublishedForm(ownerScope(), {
      title: "Original form",
      sections: [{ title: "Page" }],
      questions: [
        {
          questionType: "multiple_choice",
          prompt: "Choose",
          sectionIndex: 0,
          options: [{ label: "Yes" }, { label: "No" }],
        },
        { questionType: "short_answer", prompt: "Explain", sectionIndex: 0 },
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

    await submitFormResponse(ownerScope(), formId, {
      submittedByUserId: NILE_OWNER,
      answers: [
        {
          questionId: detail.questions[0].id,
          value: { optionId: detail.questions[0].options[0].id },
        },
        { questionId: detail.questions[1].id, value: { text: "Because" } },
      ],
    });

    const duplicate = await duplicateForm(ownerScope(), formId);
    trackForm(ownerScope(), duplicate.id);
    expect(duplicate.status).toBe("draft");
    expect(duplicate.title).toBe("Original form (copy)");

    const copy = await getForm(ownerScope(), duplicate.id);
    expect(copy.isPublic).toBe(false);
    expect(copy.publicSlug).toBeNull();
    expect(copy._count.submissions).toBe(0);
    expect(copy.questions).toHaveLength(2);
    expect(copy.sections).toHaveLength(1);
    expect(copy.logicRules).toHaveLength(1);

    const copyQuestionIds = new Set(copy.questions.map((question) => question.id));
    for (const question of detail.questions) {
      expect(copyQuestionIds.has(question.id)).toBe(false);
    }
    const copyOptionId = copy.questions[0].options[0].id;
    expect(detail.questions[0].options[0].id).not.toBe(copyOptionId);
    expect(copy.logicRules[0].comparisonJson).toMatchObject({ optionId: copyOptionId });
  });

  it("keeps forms isolated between workspaces", async () => {
    const { formId, detail } = await createPublishedForm(ownerScope(), {
      title: "Nile form",
      questions: [{ questionType: "short_answer", prompt: "Question" }],
    });

    await expect(getForm(deltaOwnerScope(), formId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const deltaRows = await listForms(deltaOwnerScope(), {});
    expect(deltaRows.some((row) => row.id === formId)).toBe(false);

    await expect(
      submitFormResponse(deltaOwnerScope(), formId, {
        submittedByUserId: DELTA_OWNER,
        answers: [{ questionId: detail.questions[0].id, value: { text: "Cross tenant" } }],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("translates a public-slug collision across tenants into a conflict", async () => {
    const slug = `shared-${randomUUID().slice(0, 8)}`;
    const nile = await createForm(
      ownerScope(),
      definition({ title: "Nile public", isPublic: true, publicSlug: slug }),
    );
    trackForm(ownerScope(), nile.id);

    await expect(
      createForm(
        deltaOwnerScope(),
        definition({ title: "Delta public", isPublic: true, publicSlug: slug }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", messageKey: "errors.conflict" });
  });

  it("enforces forms read and write permissions for assistants", async () => {
    const created = await createForm(ownerScope(), definition({ title: "Permissions" }));
    trackForm(ownerScope(), created.id);

    const withoutForms = assistantScope([]);
    await expect(listForms(withoutForms, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getForm(withoutForms, created.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createForm(withoutForms, definition({ title: "Denied" }))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const readOnly = assistantScope([permissionKey("forms", "read")]);
    await expect(getForm(readOnly, created.id)).resolves.toMatchObject({ id: created.id });
    await expect(createForm(readOnly, definition({ title: "Denied" }))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const readWrite = assistantScope([
      permissionKey("forms", "read"),
      permissionKey("forms", "write"),
    ]);
    const assistantForm = await createForm(readWrite, definition({ title: "Assistant form" }));
    trackForm(readWrite, assistantForm.id);
    expect(assistantForm.title).toBe("Assistant form");
  });

  it("stores an identified submission and writes an audit event", async () => {
    const { formId, detail } = await createPublishedForm(ownerScope(), {
      title: "Identified form",
      questions: [
        {
          questionType: "multiple_choice",
          prompt: "Attendance",
          isRequired: true,
          options: [{ label: "Yes" }, { label: "No" }],
        },
        { questionType: "short_answer", prompt: "Comment", isRequired: true },
      ],
    });
    const studentId = await createStudent(NILE, "Mona", "Student");
    students.push({ workspaceId: NILE, id: studentId });

    const submission = await submitFormResponse(ownerScope(), formId, {
      studentId,
      answers: [
        {
          questionId: detail.questions[0].id,
          value: { optionId: detail.questions[0].options[0].id },
        },
        { questionId: detail.questions[1].id, value: { text: "Ready" } },
      ],
    });
    expect(submission.answerCount).toBe(2);

    const rows = await listFormSubmissions(ownerScope(), { formId });
    expect(rows.map((row) => row.id)).toContain(submission.id);
    const row = rows.find((item) => item.id === submission.id);
    expect(row).toMatchObject({ submissionMode: "identified", studentId });
    expect(row?.student?.firstName).toBe("Mona");
    expect(row?._count.answers).toBe(2);

    const stored = await getFormSubmission(ownerScope(), submission.id);
    expect(stored?.answers).toHaveLength(2);
    expect(stored?.answers[0].valueJson).toMatchObject({
      optionId: detail.questions[0].options[0].id,
    });
    expect(stored?.answers[0].files).toEqual([]);

    const audit = await withScope({ workspaceId: NILE }, (tx) =>
      tx.auditEvent.findFirst({
        where: {
          workspaceId: NILE,
          entityType: "form_submission",
          entityId: submission.id,
          action: formAuditActions.submissionReceived,
        },
        select: { id: true },
      }),
    );
    expect(audit).not.toBeNull();

    await expect(getFormSubmission(deltaOwnerScope(), submission.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await listFormSubmissions(deltaOwnerScope(), { formId })).toEqual([]);
  });

  it("stores an anonymous submission without an identity", async () => {
    const { formId, detail } = await createPublishedForm(ownerScope(), {
      title: "Anonymous form",
      submissionMode: "anonymous",
      questions: [{ questionType: "short_answer", prompt: "Feedback" }],
    });

    const submission = await submitFormResponse(ownerScope(), formId, {
      answers: [{ questionId: detail.questions[0].id, value: { text: "Great" } }],
    });
    const stored = await getFormSubmission(ownerScope(), submission.id);
    expect(stored).toMatchObject({ studentId: null, submittedByUserId: null });
    expect(stored?.submissionMode).toBe("anonymous");

    const studentId = await createStudent(NILE, "Anonymous", "Student");
    students.push({ workspaceId: NILE, id: studentId });
    await expect(
      submitFormResponse(ownerScope(), formId, {
        studentId,
        answers: [{ questionId: detail.questions[0].id, value: { text: "Identified" } }],
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "errors.formSubmissionIdentityMismatch",
    });

    const identified = await createPublishedForm(ownerScope(), {
      title: "Identified form",
      questions: [{ questionType: "short_answer", prompt: "Feedback" }],
    });
    await expect(
      submitFormResponse(ownerScope(), identified.formId, { answers: [] }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "errors.formSubmissionIdentityMismatch",
    });
  });

  it("enforces required questions only while they are visible", async () => {
    const { formId, detail } = await createPublishedForm(ownerScope(), {
      title: "Conditional form",
      questions: [
        {
          questionType: "multiple_choice",
          prompt: "Do you have a comment?",
          isRequired: true,
          options: [{ label: "Yes" }, { label: "No" }],
        },
        { questionType: "short_answer", prompt: "Name", isRequired: true },
        { questionType: "short_answer", prompt: "Comment", isRequired: false },
      ],
      logic: [
        {
          sourceQuestionIndex: 0,
          operator: "equals",
          comparison: { optionIndex: 0 },
          action: "show",
          targetQuestionIndex: 2,
        },
        {
          sourceQuestionIndex: 0,
          operator: "equals",
          comparison: { optionIndex: 0 },
          action: "require",
          targetQuestionIndex: 2,
        },
      ],
    });

    const yes = detail.questions[0].options[0].id;
    const no = detail.questions[0].options[1].id;

    await expect(
      submitFormResponse(ownerScope(), formId, {
        submittedByUserId: NILE_OWNER,
        answers: [{ questionId: detail.questions[0].id, value: { optionId: yes } }],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "errors.formAnswerRequired",
    });

    await expect(
      submitFormResponse(ownerScope(), formId, {
        submittedByUserId: NILE_OWNER,
        answers: [
          { questionId: detail.questions[0].id, value: { optionId: yes } },
          { questionId: detail.questions[1].id, value: { text: "Mona" } },
        ],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "errors.formAnswerRequired",
    });

    const hidden = await submitFormResponse(ownerScope(), formId, {
      submittedByUserId: NILE_OWNER,
      answers: [
        { questionId: detail.questions[0].id, value: { optionId: no } },
        { questionId: detail.questions[1].id, value: { text: "Mona" } },
        { questionId: detail.questions[2].id, value: { text: "Hidden answer" } },
      ],
    });
    expect(hidden.answerCount).toBe(2);
    expect(hidden.ignoredHiddenAnswerCount).toBe(1);

    const stored = await getFormSubmission(ownerScope(), hidden.id);
    expect(stored?.answers.some((answer) => answer.questionId === detail.questions[2].id)).toBe(
      false,
    );

    const answered = await submitFormResponse(ownerScope(), formId, {
      submittedByUserId: NILE_OWNER,
      answers: [
        { questionId: detail.questions[0].id, value: { optionId: yes } },
        { questionId: detail.questions[1].id, value: { text: "Mona" } },
        { questionId: detail.questions[2].id, value: { text: "Visible answer" } },
      ],
    });
    expect(answered.answerCount).toBe(3);
    expect(answered.ignoredHiddenAnswerCount).toBe(0);
  });

  it("rejects unknown questions and duplicate answers", async () => {
    const { formId, detail } = await createPublishedForm(ownerScope(), {
      title: "Validation form",
      questions: [{ questionType: "short_answer", prompt: "Question" }],
    });

    await expect(
      submitFormResponse(ownerScope(), formId, {
        submittedByUserId: NILE_OWNER,
        answers: [{ questionId: randomUUID(), value: { text: "Unknown" } }],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "errors.formUnknownQuestion",
    });

    await expect(
      submitFormResponse(ownerScope(), formId, {
        submittedByUserId: NILE_OWNER,
        answers: [
          { questionId: detail.questions[0].id, value: { text: "One" } },
          { questionId: detail.questions[0].id, value: { text: "Two" } },
        ],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "errors.formDuplicateAnswer",
    });
  });

  it("accepts only clean files owned by the workspace in file-upload answers", async () => {
    const { formId, detail } = await createPublishedForm(ownerScope(), {
      title: "File form",
      questions: [
        {
          questionType: "file_upload",
          prompt: "Upload a PDF",
          config: { maxFiles: 1, maxSizeBytes: 100, allowedMimeTypes: ["application/pdf"] },
        },
      ],
    });
    const questionId = detail.questions[0].id;

    const clean = await createFile(NILE);
    const accepted = await submitFormResponse(ownerScope(), formId, {
      submittedByUserId: NILE_OWNER,
      answers: [{ questionId, value: { fileIds: [clean] } }],
    });
    const stored = await getFormSubmission(ownerScope(), accepted.id);
    expect(stored?.answers[0].files).toEqual([{ fileId: clean }]);
    expect(stored?.answers[0].valueJson).not.toHaveProperty("fileIds");

    const blocked = await createFile(NILE, { scanStatus: "blocked" });
    await expect(
      submitFormResponse(ownerScope(), formId, {
        submittedByUserId: NILE_OWNER,
        answers: [{ questionId, value: { fileIds: [blocked] } }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", messageKey: "errors.formFileInvalid" });

    const archived = await createFile(NILE, { archivedAt: new Date() });
    await expect(
      submitFormResponse(ownerScope(), formId, {
        submittedByUserId: NILE_OWNER,
        answers: [{ questionId, value: { fileIds: [archived] } }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", messageKey: "errors.formFileInvalid" });

    const wrongType = await createFile(NILE, { mime: "image/png" });
    await expect(
      submitFormResponse(ownerScope(), formId, {
        submittedByUserId: NILE_OWNER,
        answers: [{ questionId, value: { fileIds: [wrongType] } }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", messageKey: "errors.formFileInvalid" });

    const tooLarge = await createFile(NILE, { sizeBytes: 200 });
    await expect(
      submitFormResponse(ownerScope(), formId, {
        submittedByUserId: NILE_OWNER,
        answers: [{ questionId, value: { fileIds: [tooLarge] } }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", messageKey: "errors.formFileInvalid" });

    const foreign = await createFile(DELTA);
    await expect(
      submitFormResponse(ownerScope(), formId, {
        submittedByUserId: NILE_OWNER,
        answers: [{ questionId, value: { fileIds: [foreign] } }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", messageKey: "errors.formFileInvalid" });
  });

  it("writes an audit event for every form mutation", async () => {
    const created = await createForm(ownerScope(), definition({ title: "Audited" }));
    trackForm(ownerScope(), created.id);
    await updateFormDraft(
      ownerScope(),
      created.id,
      definition({ title: "Audited", questions: [{ questionType: "short_answer", prompt: "Q" }] }),
    );
    await publishForm(ownerScope(), created.id);
    const copy = await duplicateForm(ownerScope(), created.id);
    trackForm(ownerScope(), copy.id);
    await archiveForm(ownerScope(), created.id);

    const actions = await withScope({ workspaceId: NILE }, (tx) =>
      tx.auditEvent.findMany({
        where: { workspaceId: NILE, entityType: "form", entityId: created.id },
        select: { action: true },
      }),
    );
    expect(actions.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        formAuditActions.formCreated,
        formAuditActions.formDraftUpdated,
        formAuditActions.formPublished,
        formAuditActions.formArchived,
      ]),
    );

    const duplicateAudit = await withScope({ workspaceId: NILE }, (tx) =>
      tx.auditEvent.findFirst({
        where: {
          workspaceId: NILE,
          entityType: "form",
          entityId: copy.id,
          action: formAuditActions.formDuplicated,
        },
        select: { id: true },
      }),
    );
    expect(duplicateAudit).not.toBeNull();
  });
});

describe("forms schema", () => {
  it("rejects a `require` rule that targets a section at the service boundary", () => {
    expect(() =>
      parseFormInput(formDefinitionSchema, {
        title: "Test form",
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
      }),
    ).toThrow(AppError);
  });
});
