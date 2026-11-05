import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { disconnectDb } from "@/lib/db/client";
import {
  createForm,
  getForm,
  listForms,
  updateFormDraft,
  publishForm,
  archiveForm,
  duplicateForm,
  submitFormResponse,
  getFormSubmission,
} from "@/modules/forms/service";
import {
  formDefinitionSchema,
  parseFormInput,
  type FormDefinitionInput,
  type SubmitFormResponseInput,
} from "@/modules/forms/schemas";
import { NILE, NILE_ASSISTANT, DELTA, DELTA_OWNER, ownerScope } from "./helpers";

function definition(input: Record<string, unknown>): FormDefinitionInput {
  return parseFormInput(formDefinitionSchema, input);
}

describe("forms HTTP API contract (service-layer verification)", () => {
  afterAll(async () => {
    await disconnectDb();
  });

  it("creates and lists a form through the service contract", async () => {
    const created = await createForm(
      ownerScope(),
      definition({
        title: "API test form",
        description: "For the HTTP layer",
        sections: [{ title: "Page" }],
        questions: [{ questionType: "short_answer", prompt: "Name", sectionIndex: 0 }],
      }),
    );
    expect(created.status).toBe("draft");
    expect(created.title).toBe("API test form");

    const detail = await getForm(ownerScope(), created.id);
    expect(detail.id).toBe(created.id);
    expect(detail.questions).toHaveLength(1);

    const list = await listForms(ownerScope(), {});
    expect(list.some((row) => row.id === created.id)).toBe(true);
  });

  it("updates a draft, publishes, archives, and duplicates", async () => {
    const form = await createForm(
      ownerScope(),
      definition({
        title: "Lifecycle",
        questions: [{ questionType: "short_answer", prompt: "Q" }],
      }),
    );

    const updated = await updateFormDraft(
      ownerScope(),
      form.id,
      definition({
        title: "Lifecycle updated",
        sections: [{ title: "Page" }],
        questions: [{ questionType: "short_answer", prompt: "Updated Q", sectionIndex: 0 }],
      }),
    );
    expect(updated.title).toBe("Lifecycle updated");

    const published = await publishForm(ownerScope(), form.id);
    expect(published.status).toBe("published");

    const archived = await archiveForm(ownerScope(), form.id);
    expect(archived.status).toBe("archived");

    const copy = await duplicateForm(ownerScope(), form.id, { title: "Copy" });
    expect(copy.status).toBe("draft");
    expect(copy.title).toBe("Copy");
  });

  it("rejects unauthorized read without forms:read", async () => {
    const scope = {
      workspaceId: NILE,
      actorUserId: NILE_ASSISTANT,
      actorDisplayName: "Omar",
      role: "assistant" as const,
      permissions: new Set<string>([]),
    };
    await expect(getForm(scope as import("@/modules/tenancy/types").Scope, randomUUID())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("isolates submissions across workspaces", async () => {
    const form = await createForm(
      ownerScope(),
      definition({
        title: "Isolation",
        submissionMode: "anonymous",
        sections: [{ title: "Page" }],
        questions: [{ questionType: "short_answer", prompt: "Q", sectionIndex: 0 }],
      }),
    );
    expect(form.id).toBeDefined();

    await publishForm(ownerScope(), form.id);
    const submission = await submitFormResponse(
      ownerScope(),
      form.id,
      {
        answers: [
          {
            questionId: (await getForm(ownerScope(), form.id)).questions[0].id,
            value: { text: "Yes" },
          },
        ],
      } as unknown as SubmitFormResponseInput,
    );
    expect(submission.id).toBeDefined();

    const deltaScope = {
      workspaceId: DELTA,
      actorUserId: DELTA_OWNER,
      actorDisplayName: "Delta",
      role: "owner" as const,
      permissions: new Set<string>(),
    };
    await expect(getFormSubmission(deltaScope as import("@/modules/tenancy/types").Scope, submission.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
