import { describe, expect, it } from "vitest";
import { readErrorMessageKey } from "@/modules/forms/api-errors";

describe("readErrorMessageKey", () => {
  it("returns the stable message key from the error envelope", async () => {
    const response = Response.json(
      {
        error: {
          code: "CONFLICT",
          messageKey: "errors.formModifiedByAnotherUser",
          requestId: "req-1",
        },
      },
      { status: 409 },
    );

    await expect(readErrorMessageKey(response)).resolves.toBe(
      "errors.formModifiedByAnotherUser",
    );
  });

  it("returns null when the body is not JSON", async () => {
    const response = new Response("not json", { status: 500 });
    await expect(readErrorMessageKey(response)).resolves.toBeNull();
  });

  it("returns null when the envelope has no message key", async () => {
    const response = Response.json({}, { status: 500 });
    await expect(readErrorMessageKey(response)).resolves.toBeNull();
  });
});
