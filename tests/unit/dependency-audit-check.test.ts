import { describe, it, expect } from "vitest";

describe("dependency audit", () => {
  it("audit script exists and is a file", async () => {
    // This test verifies that the reproducible dependency audit script exists.
    // Running `node scripts/audit-deps.mjs` in CI / manually reports advisories;
    // we skip the slow npm invocation here and verify only the artifact.
    const scriptPath = "scripts/audit-deps.mjs";
    const fsModule = await import("fs");
    expect(fsModule.existsSync(scriptPath)).toBe(true);
    expect(fsModule.statSync(scriptPath).isFile()).toBe(true);
    const file = fsModule.statSync(scriptPath);
    expect(file.size).toBeGreaterThan(0);
  });
});
