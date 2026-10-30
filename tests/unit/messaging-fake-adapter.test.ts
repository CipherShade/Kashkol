import { describe, it, expect } from "vitest";
import { FakeMessageAdapter } from "@/modules/messaging/adapters/fake";

describe("fake adapter", () => {
  it("never sends external messages and records calls", async () => {
    const adapter = new FakeMessageAdapter();
    const result = await adapter.send({ to: "+201234567890", body: "test" });
    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBeDefined();
    expect(adapter.getSent().length).toBe(1);
  });
});
