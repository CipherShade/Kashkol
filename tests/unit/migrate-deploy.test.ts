import { describe, expect, it } from "vitest";

import {
  classifyLedgerRow,
  migrationTable,
  parseResolutionArgs,
  unresolvedMigrations,
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

describe("Prisma 7 migration ledger classification", () => {
  it("treats a finished row as applied", () => {
    expect(
      classifyLedgerRow({
        migration_name: "20261025110000_session_revision",
        finished_at: new Date("2026-11-23T00:00:00.000Z"),
        rolled_back_at: null,
      })
    ).toEqual({
      name: "20261025110000_session_revision",
      applied: true,
      rolledBack: false,
      unfinished: false,
    });
  });

  it("treats an unfinished row without a rollback as unresolved", () => {
    expect(
      classifyLedgerRow({
        migration_name: "20261025110000_session_revision",
        finished_at: null,
        rolled_back_at: null,
      })
    ).toEqual({
      name: "20261025110000_session_revision",
      applied: false,
      rolledBack: false,
      unfinished: true,
    });
  });

  it("treats a rolled-back row as resolved, not unresolved", () => {
    const raw = {
      migration_name: "20261025110000_session_revision",
      finished_at: null,
      rolled_back_at: new Date("2026-11-23T00:00:00.000Z"),
    };

    expect(classifyLedgerRow(raw)).toEqual({
      name: "20261025110000_session_revision",
      applied: false,
      rolledBack: true,
      unfinished: false,
    });
    expect(unresolvedMigrations([raw])).toEqual([]);
  });

  it("returns only unfinished rows for an operator decision", () => {
    const finished = {
      migration_name: "20261025110000_session_revision",
      finished_at: new Date("2026-11-23T00:00:00.000Z"),
      rolled_back_at: null,
    };
    const rolledBack = {
      migration_name: "20261025110000_session_revision",
      finished_at: null,
      rolled_back_at: new Date("2026-11-23T00:00:00.000Z"),
    };
    const unfinished = {
      migration_name: "20261101000000_add_column",
      finished_at: null,
      rolled_back_at: null,
    };

    expect(
      unresolvedMigrations([finished, rolledBack, unfinished]).map(
        (row: { name: string }) => row.name
      )
    ).toEqual(["20261101000000_add_column"]);
  });
});
