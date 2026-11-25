import { describe, expect, it } from "vitest";
import { TENANT_TABLES } from "@/lib/db/tenant-tables";
import {
  RESTORE_CONFIRMATION_PHRASE,
  WORKSPACE_ARCHIVE_FORMAT,
  WORKSPACE_ARCHIVE_SCHEMA_VERSION,
  restoreConfirmSchema,
} from "@/modules/workspace-backup/schemas";
import { ARCHIVE_TABLES, RETAINED_TABLES } from "@/modules/workspace-backup/tables";
import { assertSafeStorageKey } from "@/modules/files/adapters/key";
import {
  parentGuards,
  retainedParentGuards,
  topologicalOrder,
} from "@/modules/workspace-backup/topology";
import {
  ARCHIVE_ISSUES,
  archiveFingerprint,
  parseArchiveBuffer,
  validateArchive,
} from "@/modules/workspace-backup/validate";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";

function archive() {
  const tables: Record<string, Record<string, unknown>[]> = Object.fromEntries(
    TENANT_TABLES.map((table) => [table, []]),
  );
  return {
    format: WORKSPACE_ARCHIVE_FORMAT,
    schemaVersion: WORKSPACE_ARCHIVE_SCHEMA_VERSION,
    generatedAt: "2026-11-25T10:00:00.000Z",
    workspaceId: WORKSPACE,
    tables,
    fileObjectKeys: [] as string[],
  };
}

function columns() {
  return Object.fromEntries(TENANT_TABLES.map((table) => [table, ["workspace_id", "id"]]));
}

describe("F-P2-11 topology (ADR-0039)", () => {
  it("orders parents before children and ignores self references", () => {
    const order = topologicalOrder(
      ["student", "group", "enrollment"],
      [
        {
          child: "enrollment",
          parent: "student",
          childColumns: ["student_id"],
          parentColumns: ["id"],
        },
        {
          child: "enrollment",
          parent: "group",
          childColumns: ["group_id"],
          parentColumns: ["id"],
        },
        { child: "student", parent: "student", childColumns: ["id"], parentColumns: ["id"] },
      ],
    );
    expect(order.indexOf("student")).toBeLessThan(order.indexOf("enrollment"));
    expect(order.indexOf("group")).toBeLessThan(order.indexOf("enrollment"));
  });

  it("refuses an FK cycle instead of silently choosing an order", () => {
    expect(() =>
      topologicalOrder(
        ["a", "b"],
        [
          { child: "a", parent: "b", childColumns: ["b_id"], parentColumns: ["id"] },
          { child: "b", parent: "a", childColumns: ["a_id"], parentColumns: ["id"] },
        ],
      ),
    ).toThrow("WORKSPACE_ARCHIVE_FK_CYCLE");
  });

  it("finds retained children that pin a mutable parent", () => {
    const guards = retainedParentGuards(
      "student",
      [
        {
          child: "payment",
          parent: "student",
          childColumns: ["workspace_id", "student_id"],
          parentColumns: ["workspace_id", "id"],
        },
        {
          child: "enrollment",
          parent: "student",
          childColumns: ["student_id"],
          parentColumns: ["id"],
        },
      ],
      RETAINED_TABLES,
    );
    expect(guards).toHaveLength(1);
    expect(guards[0]?.child).toBe("payment");
  });

  it("guards every tenant child when deleting a parent, including locked tables", () => {
    const edges = [
      {
        child: "teaching_session",
        parent: "group",
        childColumns: ["workspace_id", "group_id"],
        parentColumns: ["workspace_id", "id"],
      },
      { child: "payment", parent: "group", childColumns: ["group_id"], parentColumns: ["id"] },
      { child: "outside", parent: "group", childColumns: ["group_id"], parentColumns: ["id"] },
    ];
    const guards = parentGuards("group", edges, new Set(["teaching_session", "payment"]));
    expect(guards.map((edge) => edge.child)).toEqual(["teaching_session", "payment"]);
  });

  it("accepts generated backup and restore storage keys", () => {
    assertSafeStorageKey(`ws/${WORKSPACE}/backups/${WORKSPACE}.json`);
    assertSafeStorageKey(`ws/${WORKSPACE}/restore-staging/${WORKSPACE}.json`);
    expect(() =>
      assertSafeStorageKey(`ws/${WORKSPACE}/restore-staging/${WORKSPACE}.txt`),
    ).toThrow();
  });

  it("excludes append-only evidence from the applied table set", () => {
    expect(ARCHIVE_TABLES).not.toContain("audit_event");
    expect(ARCHIVE_TABLES).not.toContain("payment");
    expect(RETAINED_TABLES.has("audit_event")).toBe(true);
  });
});

describe("F-P2-11 archive parsing and fingerprint", () => {
  it("rejects invalid JSON and a file larger than the cap", () => {
    expect(() => parseArchiveBuffer(Buffer.from("{not json"))).toThrowError();
    const oversized = Buffer.alloc(50 * 1024 * 1024 + 1, "a");
    expect(() => parseArchiveBuffer(oversized)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
  });

  it("rejects an envelope with the wrong format", () => {
    const value = { ...archive(), format: "something-else" };
    expect(() => parseArchiveBuffer(Buffer.from(JSON.stringify(value)))).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
  });

  it("fingerprints exact bytes, so a changed preview cannot be confirmed", () => {
    const buffer = Buffer.from(JSON.stringify(archive()));
    expect(archiveFingerprint(buffer)).toBe(archiveFingerprint(Buffer.from(buffer)));
    expect(archiveFingerprint(buffer)).not.toBe(
      archiveFingerprint(Buffer.from(JSON.stringify({ ...archive(), generatedAt: "later" }))),
    );
  });

  it("requires the exact typed phrase and a 64-character fingerprint", () => {
    const fingerprint = "a".repeat(64);
    expect(
      restoreConfirmSchema.safeParse({
        uploadId: WORKSPACE,
        confirmation: RESTORE_CONFIRMATION_PHRASE,
        fingerprint,
      }).success,
    ).toBe(true);
    expect(
      restoreConfirmSchema.safeParse({
        uploadId: WORKSPACE,
        confirmation: "restore",
        fingerprint,
      }).success,
    ).toBe(false);
  });
});

describe("F-P2-11 pre-flight report", () => {
  it("accepts a well-formed archive and marks retained tables", () => {
    const value = archive();
    value.tables.audit_event = [{ workspace_id: WORKSPACE, id: "audit-1" }];
    const result = validateArchive({
      archive: value,
      workspaceId: WORKSPACE,
      columns: columns(),
      missingFileObjects: 0,
    });
    expect(result.applicable).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.retainedTables).toContain("audit_event");
    expect(result.tables.find((entry) => entry.table === "student")?.action).toBe("apply");
  });

  it("rejects an incompatible schema version and a foreign workspace", () => {
    const value = {
      ...archive(),
      schemaVersion: "1999-01-01.1",
      workspaceId: "00000000-0000-4000-8000-000000000002",
    };
    const result = validateArchive({
      archive: value,
      workspaceId: WORKSPACE,
      columns: columns(),
      missingFileObjects: 0,
    });
    expect(result.applicable).toBe(false);
    expect(result.issues).toContain(ARCHIVE_ISSUES.incompatibleSchema);
    expect(result.issues).toContain(ARCHIVE_ISSUES.workspaceMismatch);
  });

  it("reports unknown tables, foreign rows and missing objects without content", () => {
    const value = archive() as ReturnType<typeof archive> & {
      tables: Record<string, unknown[]>;
    };
    value.tables.secret_table = [];
    value.tables.student = [{ workspace_id: "00000000-0000-4000-8000-000000000002" }];
    const result = validateArchive({
      archive: value,
      workspaceId: WORKSPACE,
      columns: columns(),
      missingFileObjects: 1,
    });
    expect(result.applicable).toBe(false);
    expect(result.issues).toContain(ARCHIVE_ISSUES.unknownTable);
    expect(result.issues).toContain(ARCHIVE_ISSUES.foreignRow);
    expect(result.issues).toContain(ARCHIVE_ISSUES.missingFileObject);
    expect(JSON.stringify(result)).not.toContain("00000000-0000-4000-8000-000000000002");
  });
});
