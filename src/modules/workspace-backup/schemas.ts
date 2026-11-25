import { z } from "zod";

/** F-P2-11 / ADR-0039: the exact, versioned JSON envelope exchanged with a teacher. */
export const WORKSPACE_ARCHIVE_FORMAT = "kashkol-workspace-backup" as const;
export const WORKSPACE_ARCHIVE_SCHEMA_VERSION = "2026-11-24.1" as const;
export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
export const RESTORE_CONFIRMATION_PHRASE = "RESTORE" as const;

export const workspaceArchiveSchema = z
  .object({
    format: z.literal(WORKSPACE_ARCHIVE_FORMAT),
    schemaVersion: z.string().min(1).max(64),
    generatedAt: z.string().datetime(),
    workspaceId: z.string().uuid(),
    tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
    fileObjectKeys: z.array(z.string().min(1)).max(100_000),
  })
  .strict();

export type WorkspaceArchive = z.infer<typeof workspaceArchiveSchema>;

export const restoreConfirmSchema = z
  .object({
    uploadId: z.string().uuid(),
    confirmation: z.literal(RESTORE_CONFIRMATION_PHRASE),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type RestoreConfirmInput = z.infer<typeof restoreConfirmSchema>;

export type RestorePreviewTable = {
  table: string;
  rows: number;
  action: "apply" | "retain";
};

export type RestorePreview = {
  uploadId: string | null;
  applicable: boolean;
  issues: string[];
  schemaVersion: string;
  generatedAt: string;
  workspaceId: string;
  totalRows: number;
  tables: RestorePreviewTable[];
  retainedTables: string[];
  unapplicable: { table: string; rows: number; reason: string }[];
  missingFileObjects: number;
  fingerprint: string;
};
