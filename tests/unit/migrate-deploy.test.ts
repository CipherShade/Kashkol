import { describe, expect, it } from "vitest";

import {
  migrationTable,
  parseResolutionArgs,
} from "../../scripts/migrate-deploy.mjs";

describe("migrate-deploy resolution arguments", () => {
  it("parses explicit applied and rolled-back decisions", () => {
    expect(
      parseResolutionArgs([
        "--applied",
        "20261025110000_session_revision",
        "--rolled-back",
        "20261101000000_add_column",
      ])
    ).toEqual({
      applied: ["20261025110000_session_revision"],
      rolledBack: ["20261101000000_add_column"],
    });
  });

  it("accepts no arguments", () => {
    expect(parseResolutionArgs([])).toEqual({ applied: [], rolledBack: [] });
  });

  it("rejects unknown flags instead of ignoring them", () => {
    expect(() => parseResolutionArgs(["--force"])).toThrow("Unknown argument");
  });

  it("rejects missing and unsafe migration names", () => {
    expect(() => parseResolutionArgs(["--applied"])).toThrow("Invalid migration name");
    expect(() => parseResolutionArgs(["--applied", "bad;DROP TABLE x"])).toThrow(
      "Invalid migration name"
    );
  });

  it("derives the main table from the migration folder name", () => {
    expect(migrationTable("20261025110000_session_revision")).toBe(
      "session_revision"
    );
  });
});
