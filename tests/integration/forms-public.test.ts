import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import {
  createForm,
  getForm,
  publishForm,
  submitFormResponsePublic,
} from "@/modules/forms/service";
import {
  createUploadSessionToken,
  hashUploadSessionToken,
} from "@/modules/forms/public-upload";
import {
  formDefinitionSchema,
  type FormDefinitionInput,
} from "@/modules/forms/schemas";
import { NILE, NILE_OWNER, ownerScope } from "./helpers";

type TrackedForm = { workspaceId: string; id: string };
type TrackedFile = { workspaceId: string; id: string };

const forms: TrackedForm[] = [];
const files: TrackedFile[] = [];

function definition(input: Record<string, unknown> = {}): FormDefinitionInput {
  return formDefinitionSchema.parse({ title: "Public upload form", ...input });
}

async function createPublishedPublicForm(input: Record<string, unknown>) {
  const created = await createForm(
    ownerScope(),
    definition({ submissionMode: "anonymous", ...input, isPublic: true }),
  );
  forms.push({ workspaceId: NILE, id: created.id });
  await publishForm(ownerScope(), created.id);
  const detail = await getForm(ownerScope(), created.id);
  return { formId: created.id, workspaceId: NILE, detail };
}

/**
 * Simulates the public upload route's write, as the application role, through
 * the same scoped transaction the route uses. This exercises the FORCE RLS
 * policy, the tenant foreign keys, the `(workspace_id, file_id)` uniqueness,
 * and the INSERT grant on `form_upload` added by the Phase 2 migration.
 */
async function recordPublicUpload(input: {
  workspaceId: string;
  formId: string;
  questionId: string;
  uploadSessionHash: string;
  mime?: string;
  sizeBytes?: number;
  scanStatus?: "pending" | "clean" | "blocked";
}): Promise<string> {
  const fileId = randomUUID();
  await withScope({ workspaceId: input.workspaceId }, async (tx) => {
    await tx.file.create({
      data: {
        id: fileId,
        workspaceId: input.workspaceId,
        scope: "form_upload",
        title: "Respondent attachment",
        storageKey: `ws/${input.workspaceId}/${fileId}.pdf`,
        sizeBytes: input.sizeBytes ?? 1024,
        mime: input.mime ?? "application/pdf",
        scanStatus: input.scanStatus ?? "clean",
        uploadedBy: "system",
      },
    });
    await tx.formUpload.create({
      data: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        formId: input.formId,
        questionId: input.questionId,
        fileId,
        uploadSessionHash: input.uploadSessionHash,
      },
    });
  });
  files.push({ workspaceId: input.workspaceId, id: fileId });
  return fileId;
}

afterEach(async () => {
  for (const form of forms) {
    const { workspaceId, id } = form;
    await withScope({ workspaceId }, async (tx) => {
      await tx.formAnswerFile.deleteMany({
        where: { workspaceId, answer: { submission: { formId: id } } },
      });
      await tx.formAnswer.deleteMany({
        where: { workspaceId, submission: { formId: id } },
      });
      await tx.formSubmission.deleteMany({ where: { workspaceId, formId: id } });
      await tx.formUpload.deleteMany({ where: { workspaceId, formId: id } });
      await tx.formQuestionLogic.deleteMany({ where: { workspaceId, formId: id } });
      await tx.formQuestionOption.deleteMany({
        where: { workspaceId, question: { formId: id } },
      });
      await tx.formQuestion.deleteMany({ where: { workspaceId, formId: id } });
      await tx.formSection.deleteMany({ where: { workspaceId, formId: id } });
      await tx.form.deleteMany({ where: { workspaceId, id } });
    });
  }
  forms.length = 0;

  for (const file of files.splice(0)) {
    await withScope({ workspaceId: file.workspaceId }, (tx) =>
      tx.file.deleteMany({ where: { workspaceId: file.workspaceId, id: file.id } }),
    );
  }
});

afterAll(async () => {
  await disconnectDb();
});

describe("public form upload provenance", () => {
  it("accepts a submission whose file was uploaded for that question in the same session", async () => {
    const { formId, workspaceId, detail } = await createPublishedPublicForm({
      questions: [{ questionType: "file_upload", prompt: "Report" }],
    });
    const question = detail.questions[0];
    const token = createUploadSessionToken();
    const fileId = await recordPublicUpload({
      workspaceId,
      formId,
      questionId: question.id,
      uploadSessionHash: hashUploadSessionToken(token),
    });

    const submission = await submitFormResponsePublic(formId, {
      uploadSessionToken: token,
      answers: [{ questionId: question.id, value: { fileIds: [fileId] } }],
    });

    expect(submission.id).toBeDefined();
    const attachments = await withScope({ workspaceId }, (tx) =>
      tx.formAnswerFile.findMany({
        where: { workspaceId, fileId, answer: { submissionId: submission.id } },
      }),
    );
    expect(attachments).toHaveLength(1);
  });

  it("rejects a file claimed with the wrong upload session token", async () => {
    const { formId, workspaceId, detail } = await createPublishedPublicForm({
      questions: [{ questionType: "file_upload", prompt: "Report" }],
    });
    const question = detail.questions[0];
    const fileId = await recordPublicUpload({
      workspaceId,
      formId,
      questionId: question.id,
      uploadSessionHash: hashUploadSessionToken(createUploadSessionToken()),
    });

    await expect(
      submitFormResponsePublic(formId, {
        uploadSessionToken: createUploadSessionToken(),
        answers: [{ questionId: question.id, value: { fileIds: [fileId] } }],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "errors.formFileInvalid",
    });
  });

  it("rejects a file bound to a different question", async () => {
    const { formId, workspaceId, detail } = await createPublishedPublicForm({
      questions: [
        { questionType: "file_upload", prompt: "First" },
        { questionType: "file_upload", prompt: "Second" },
      ],
    });
    const [first, second] = detail.questions;
    const token = createUploadSessionToken();
    const fileId = await recordPublicUpload({
      workspaceId,
      formId,
      questionId: second.id,
      uploadSessionHash: hashUploadSessionToken(token),
    });

    await expect(
      submitFormResponsePublic(formId, {
        uploadSessionToken: token,
        answers: [{ questionId: first.id, value: { fileIds: [fileId] } }],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "errors.formFileInvalid",
    });
  });

  it("rejects a file with no public upload provenance", async () => {
    const { formId, workspaceId, detail } = await createPublishedPublicForm({
      questions: [{ questionType: "file_upload", prompt: "Report" }],
    });
    const question = detail.questions[0];
    const fileId = randomUUID();
    await withScope({ workspaceId }, (tx) =>
      tx.file.create({
        data: {
          id: fileId,
          workspaceId,
          scope: "teacher_only",
          title: "Teacher file",
          storageKey: `ws/${workspaceId}/${fileId}.pdf`,
          sizeBytes: 1024,
          mime: "application/pdf",
          scanStatus: "clean",
          uploadedBy: NILE_OWNER,
        },
      }),
    );
    files.push({ workspaceId, id: fileId });

    await expect(
      submitFormResponsePublic(formId, {
        uploadSessionToken: createUploadSessionToken(),
        answers: [{ questionId: question.id, value: { fileIds: [fileId] } }],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "errors.formFileInvalid",
    });
  });

  it("rejects a client-supplied actor id on the public path", async () => {
    const { formId } = await createPublishedPublicForm({
      questions: [{ questionType: "short_answer", prompt: "Name" }],
    });

    await expect(
      submitFormResponsePublic(formId, {
        submittedByUserId: NILE_OWNER,
        answers: [],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("does not expose an unpublished form to the public path", async () => {
    const created = await createForm(
      ownerScope(),
      definition({ questions: [{ questionType: "short_answer", prompt: "Name" }] }),
    );
    forms.push({ workspaceId: NILE, id: created.id });

    await expect(
      submitFormResponsePublic(created.id, { answers: [] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an oversized file even when its provenance row exists", async () => {
    const { formId, workspaceId, detail } = await createPublishedPublicForm({
      questions: [
        {
          questionType: "file_upload",
          prompt: "Report",
          config: { maxSizeBytes: 100 },
        },
      ],
    });
    const question = detail.questions[0];
    const token = createUploadSessionToken();
    const fileId = await recordPublicUpload({
      workspaceId,
      formId,
      questionId: question.id,
      uploadSessionHash: hashUploadSessionToken(token),
      sizeBytes: 101,
    });

    await expect(
      submitFormResponsePublic(formId, {
        uploadSessionToken: token,
        answers: [{ questionId: question.id, value: { fileIds: [fileId] } }],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "errors.formFileInvalid",
    });
  });
});

describe("public form identity binding", () => {
  it("rejects a client-supplied studentId on an identified public form", async () => {
    const { formId } = await createPublishedPublicForm({
      submissionMode: "identified",
      questions: [{ questionType: "short_answer", prompt: "Name" }],
    });

    await expect(
      submitFormResponsePublic(formId, {
        studentId: randomUUID(),
        answers: [],
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      messageKey: "errors.formSubmissionIdentityMismatch",
    });
  });

  it("accepts an anonymous public submission with no studentId", async () => {
    const { formId } = await createPublishedPublicForm({
      questions: [{ questionType: "short_answer", prompt: "Name" }],
    });

    const submission = await submitFormResponsePublic(formId, { answers: [] });

    expect(submission.id).toBeDefined();
  });
});
