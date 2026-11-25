import { createHash } from "node:crypto";
import { AppError } from "@/lib/http/errors";
import { TENANT_TABLES } from "@/lib/db/tenant-tables";
import {
  MAX_ARCHIVE_BYTES,
  WORKSPACE_ARCHIVE_SCHEMA_VERSION,
  workspaceArchiveSchema,
  type RestorePreviewTable,
  type WorkspaceArchive,
} from "./schemas";
import { ARCHIVE_TABLES, RETAINED_TABLES } from "./tables";

export const ARCHIVE_ISSUES = {
  incompatibleSchema: "ARCHIVE_SCHEMA_INCOMPATIBLE",
  workspaceMismatch: "ARCHIVE_WORKSPACE_MISMATCH",
  unknownTable: "ARCHIVE_UNKNOWN_TABLE",
  missingTable: "ARCHIVE_MISSING_TABLE",
  unknownColumn: "ARCHIVE_UNKNOWN_COLUMN",
  foreignRow: "ARCHIVE_FOREIGN_ROW",
  missingFileObject: "ARCHIVE_FILE_OBJECT_MISSING",
} as const;

export type ArchiveIssue = (typeof ARCHIVE_ISSUES)[keyof typeof ARCHIVE_ISSUES];

/** Parse an uploaded archive with a hard byte cap and no content in the error. */
export function parseArchiveBuffer(buffer: Buffer): WorkspaceArchive {
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw new AppError("VALIDATION_FAILED", { messageKey: "Workspace.data.archiveTooLarge" });
  }
  let json: unknown;
  try {
    json = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new AppError("VALIDATION_FAILED", { messageKey: "Workspace.data.archiveInvalid" });
  }
  const parsed = workspaceArchiveSchema.safeParse(json);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", { messageKey: "Workspace.data.archiveInvalid" });
  }
  return parsed.data;
}

/** A stable fingerprint of the exact bytes the teacher previewed. */
export function archiveFingerprint(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export type ArchiveValidationInput = {
  archive: WorkspaceArchive;
  workspaceId: string;
  columns: Record<string, string[]>;
  missingFileObjects: number;
};

export type ArchiveValidationResult = {
  applicable: boolean;
  issues: ArchiveIssue[];
  tables: RestorePreviewTable[];
  retainedTables: string[];
  unapplicable: { table: string; rows: number; reason: ArchiveIssue }[];
  totalRows: number;
};

/**
 * Pre-flight validation. It reports only stable codes, entity counts and table
 * names — never a student name, phone, note body or file key.
 */
export function validateArchive(input: ArchiveValidationInput): ArchiveValidationResult {
  const { archive, workspaceId, columns, missingFileObjects } = input;
  const issues = new Set<ArchiveIssue>();
  const unapplicable: ArchiveValidationResult["unapplicable"] = [];
  const tables: RestorePreviewTable[] = [];
  let totalRows = 0;

  if (archive.schemaVersion !== WORKSPACE_ARCHIVE_SCHEMA_VERSION) {
    issues.add(ARCHIVE_ISSUES.incompatibleSchema);
  }
  if (archive.workspaceId !== workspaceId) {
    issues.add(ARCHIVE_ISSUES.workspaceMismatch);
  }
  if (missingFileObjects > 0) {
    issues.add(ARCHIVE_ISSUES.missingFileObject);
  }

  const knownTables = new Set<string>(TENANT_TABLES);
  for (const [table, rows] of Object.entries(archive.tables)) {
    const count = rows.length;
    totalRows += count;
    if (!knownTables.has(table)) {
      issues.add(ARCHIVE_ISSUES.unknownTable);
      unapplicable.push({ table, rows: count, reason: ARCHIVE_ISSUES.unknownTable });
      continue;
    }

    const allowed = new Set(columns[table] ?? []);
    if (allowed.size === 0) {
      issues.add(ARCHIVE_ISSUES.missingTable);
      unapplicable.push({ table, rows: count, reason: ARCHIVE_ISSUES.missingTable });
      continue;
    }

    let unknownColumn = false;
    let foreignRow = false;
    for (const row of rows) {
      if (Object.keys(row).some((key) => !allowed.has(key))) unknownColumn = true;
      if (row.workspace_id !== workspaceId) foreignRow = true;
    }
    if (unknownColumn || foreignRow) {
      const reason = foreignRow ? ARCHIVE_ISSUES.foreignRow : ARCHIVE_ISSUES.unknownColumn;
      issues.add(reason);
      unapplicable.push({ table, rows: count, reason });
      continue;
    }

    if (RETAINED_TABLES.has(table)) {
      tables.push({ table, rows: count, action: "retain" });
    } else if (ARCHIVE_TABLES.includes(table)) {
      tables.push({ table, rows: count, action: "apply" });
    } else {
      issues.add(ARCHIVE_ISSUES.unknownTable);
      unapplicable.push({ table, rows: count, reason: ARCHIVE_ISSUES.unknownTable });
    }
  }

  for (const table of TENANT_TABLES) {
    if (!(table in archive.tables)) {
      issues.add(ARCHIVE_ISSUES.missingTable);
      unapplicable.push({ table, rows: 0, reason: ARCHIVE_ISSUES.missingTable });
    }
  }

  tables.sort((a, b) => a.table.localeCompare(b.table));
  return {
    applicable: issues.size === 0,
    issues: [...issues].sort(),
    tables,
    retainedTables: tables
      .filter((entry) => entry.action === "retain")
      .map((entry) => entry.table),
    unapplicable,
    totalRows,
  };
}
