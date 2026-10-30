import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isUuidV7, newUuidV7 } from "@/lib/id";

describe("uuid v7", () => {
  it("generates a version-7, RFC 4122 variant identifier", () => {
    const id = newUuidV7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(isUuidV7(id)).toBe(true);
  });

  it("does not accept a random v4 identifier", () => {
    expect(isUuidV7(randomUUID())).toBe(false);
  });

  it("is time ordered for the same and later timestamps", () => {
    const early = newUuidV7(1_700_000_000_000);
    const late = newUuidV7(1_700_000_001_000);
    expect(early < late).toBe(true);
  });

  it("rejects a negative timestamp", () => {
    expect(() => newUuidV7(-1)).toThrow();
  });
});
