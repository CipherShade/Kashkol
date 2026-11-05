import { describe, expect, it, afterAll } from "vitest";
import { disconnectDb } from "@/lib/db/client";
import { createForm, getForm, updateFormDraft } from "@/modules/forms/service";
import { ownerScope } from "./helpers";

describe("forms concurrency guard", () => {
  afterAll(async () => { await disconnectDb(); });

  it("rejects stale edit when updatedAt changed by another user", async () => {
    const form = await createForm(ownerScope(), {
      title: "Concurrent",
      sections: [{ title: "Page" }],
      questions: [{ questionType: "short_answer", prompt: "Q", sectionIndex: 0 }],
      logic: [],
    } as unknown as import("@/modules/forms/schemas").FormDefinitionInput);

    const first = await getForm(ownerScope(), form.id);
    expect(first.updatedAt).toBeDefined();

    // Editor A saves successfully using original timestamp
    const savedA = await updateFormDraft(
      ownerScope(), form.id,
      { title: "A saved", sections: [{ title: "Page" }], questions: [{ questionType: "short_answer", prompt: "Q", sectionIndex: 0 }], logic: [] } as unknown as import("@/modules/forms/schemas").FormDefinitionInput,
      undefined,
      first.updatedAt,
    );
    expect(savedA.id).toBe(form.id);

    // Editor B tries to save using the same original timestamp (stale)
    await expect(
      updateFormDraft(
        ownerScope(), form.id,
        { title: "B attempted", sections: [{ title: "Page" }], questions: [{ questionType: "short_answer", prompt: "Q", sectionIndex: 0 }], logic: [] } as unknown as import("@/modules/forms/schemas").FormDefinitionInput,
        undefined,
        first.updatedAt,
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // A's saved title must remain intact
    const afterB = await getForm(ownerScope(), form.id);
    expect(afterB.title).toBe("A saved");
  });
});
