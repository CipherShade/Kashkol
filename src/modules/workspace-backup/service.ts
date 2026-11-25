import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import { getFileStorageAdapter } from "@/modules/files/adapters";
import type { FileStorageAdapter } from "@/modules/files/adapters/interface";
import { createNotificationTx } from "@/modules/notifications/repository";
import { listActiveWorkspaceIdsForWorker } from "@/modules/tenancy/repository";
import { assertOwner, type Scope } from "@/modules/tenancy/types";
import {
  claimArchiveJobTx,
  clearMutableRowsTx,
  completeArchiveJobTx,
  countTenantRowsTx,
  createArchiveJobTx,
  failArchiveJobTx,
  findArchiveJob,
  findOrphansTx,
  getForeignKeysTx,
  getTableColumnsTx,
  insertArchivedRowsTx,
  loadTenantRowsTx,
} from "./repository";
import {
  WORKSPACE_ARCHIVE_FORMAT,
  WORKSPACE_ARCHIVE_SCHEMA_VERSION,
  type RestoreConfirmInput,
  type RestorePreview,
} from "./schemas";
import { ARCHIVE_TABLES } from "./tables";
import {
  ARCHIVE_ISSUES,
  archiveFingerprint,
  parseArchiveBuffer,
  validateArchive,
} from "./validate";

const DOWNLOAD_TTL_SECONDS = 300;
const ARCHIVE_BATCH_SIZE = 5;
const WORKSPACE_ARCHIVE_FAILED_CODE = "WORKSPACE_ARCHIVE_FAILED";

/**
 * Stable codes stored on a failed job. The client resolves a message key; the
 * code itself never carries tenant content.
 */
export const ARCHIVE_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  [ARCHIVE_ISSUES.incompatibleSchema]: "Workspace.data.archiveIncompatible",
  [ARCHIVE_ISSUES.workspaceMismatch]: "Workspace.data.archiveWrongWorkspace",
  [ARCHIVE_ISSUES.unknownTable]: "Workspace.data.archiveInvalid",
  [ARCHIVE_ISSUES.missingTable]: "Workspace.data.archiveInvalid",
  [ARCHIVE_ISSUES.unknownColumn]: "Workspace.data.archiveInvalid",
  [ARCHIVE_ISSUES.foreignRow]: "Workspace.data.archiveInvalid",
  [ARCHIVE_ISSUES.missingFileObject]: "Workspace.data.archiveFileMissing",
  ARCHIVE_CHANGED: "Workspace.data.previewExpired",
  ARCHIVE_INTEGRITY_MISMATCH: "Workspace.data.integrityFailed",
  ARCHIVE_ORPHAN_ROWS: "Workspace.data.integrityFailed",
  WORKSPACE_ARCHIVE_FAILED: "Workspace.data.restoreFailed",
};

export function archiveFailureMessageKey(code: string | null): string {
  return (code && ARCHIVE_FAILURE_MESSAGES[code]) || "Workspace.data.restoreFailed";
}

function stagingKey(workspaceId: string, uploadId: string): string {
  return `ws/${workspaceId}/restore-staging/${uploadId}.json`;
}

function backupFilename(jobId: string): string {
  return `kashkol-workspace-${jobId}.json`;
}

async function countMissingObjects(
  storage: FileStorageAdapter,
  keys: readonly string[],
): Promise<number> {
  let missing = 0;
  for (const key of new Set(keys)) {
    if (!(await storage.exists(key))) missing += 1;
  }
  return missing;
}

/** F-P2-11 AC-1 + F22: owner requests a full machine-readable workspace export. */
export async function requestWorkspaceBackup(scope: Scope, requestId: string) {
  assertOwner(scope);
  const id = newUuidV7();
  const storageKey = `ws/${scope.workspaceId}/backups/${id}.json`;
  const job = await withScope(scope, async (tx) => {
    const created = await createArchiveJobTx(tx, {
      id,
      workspaceId: scope.workspaceId,
      kind: "backup",
      requestedBy: scope.actorUserId,
      storageKey,
      schemaVersion: WORKSPACE_ARCHIVE_SCHEMA_VERSION,
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "workspace_archive_job",
      entityId: id,
      action: "workspace.export_requested",
      diff: { kind: "backup" },
      requestId,
    });
    return created;
  });
  return { id: job.id, kind: job.kind, status: job.status, createdAt: job.createdAt };
}

/**
 * F22: an owner can poll either an export or a restore. The signed URL is
 * minted only for a successfully completed backup and expires in five minutes.
 */
export async function getWorkspaceArchiveStatus(scope: Scope, jobId: string) {
  assertOwner(scope);
  const job = await findArchiveJob(scope.workspaceId, jobId);
  if (!job) throw new AppError("NOT_FOUND");

  let downloadUrl: string | null = null;
  if (job.kind === "backup" && job.status === "succeeded") {
    downloadUrl = await getFileStorageAdapter().signDownload({
      key: job.storageKey,
      ttlSeconds: DOWNLOAD_TTL_SECONDS,
      filename: backupFilename(job.id),
      contentType: "application/json",
    });
  }

  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    failureCode: job.failureCode,
    messageKey: job.failureCode ? archiveFailureMessageKey(job.failureCode) : null,
    result: job.result ?? null,
    downloadUrl,
  };
}

/**
 * F-P2-11 AC-3: validate an uploaded archive without touching tenant data.
 * Only when the archive is applicable is the exact byte sequence staged for a
 * later typed confirmation.
 */
export async function previewWorkspaceRestore(scope: Scope, buffer: Buffer): Promise<RestorePreview> {
  assertOwner(scope);
  const archive = parseArchiveBuffer(buffer);
  const fingerprint = archiveFingerprint(buffer);
  const columns = await withScope(scope, (tx) => getTableColumnsTx(tx));
  const storage = getFileStorageAdapter();
  const missingFileObjects = await countMissingObjects(storage, archive.fileObjectKeys);
  const validation = validateArchive({
    archive,
    workspaceId: scope.workspaceId,
    columns,
    missingFileObjects,
  });

  const base: RestorePreview = {
    uploadId: null,
    applicable: validation.applicable,
    issues: validation.issues,
    schemaVersion: archive.schemaVersion,
    generatedAt: archive.generatedAt,
    workspaceId: archive.workspaceId,
    totalRows: validation.totalRows,
    tables: validation.tables,
    retainedTables: validation.retainedTables,
    unapplicable: validation.unapplicable,
    missingFileObjects,
    fingerprint,
  };
  if (!validation.applicable) return base;

  const uploadId = newUuidV7();
  await storage.put({
    key: stagingKey(scope.workspaceId, uploadId),
    body: buffer,
    contentType: "application/json",
  });
  return { ...base, uploadId };
}

/**
 * F22 edge case: a restore is queued only after an exact typed phrase AND the
 * fingerprint of the archive the owner just previewed.
 */
export async function confirmWorkspaceRestore(
  scope: Scope,
  input: RestoreConfirmInput,
  requestId: string,
) {
  assertOwner(scope);
  const key = stagingKey(scope.workspaceId, input.uploadId);
  const storage = getFileStorageAdapter();
  let buffer: Buffer;
  try {
    buffer = await storage.get(key);
  } catch {
    throw new AppError("VALIDATION_FAILED", { messageKey: "Workspace.data.previewExpired" });
  }
  if (archiveFingerprint(buffer) !== input.fingerprint) {
    throw new AppError("VALIDATION_FAILED", { messageKey: "Workspace.data.previewExpired" });
  }

  const archive = parseArchiveBuffer(buffer);
  const columns = await withScope(scope, (tx) => getTableColumnsTx(tx));
  const missingFileObjects = await countMissingObjects(storage, archive.fileObjectKeys);
  const validation = validateArchive({
    archive,
    workspaceId: scope.workspaceId,
    columns,
    missingFileObjects,
  });
  if (!validation.applicable) {
    throw new AppError("VALIDATION_FAILED", {
      messageKey: archiveFailureMessageKey(validation.issues[0] ?? null),
    });
  }

  const id = newUuidV7();
  const preview = {
    totalRows: validation.totalRows,
    tables: validation.tables,
    retainedTables: validation.retainedTables,
    missingFileObjects,
    fingerprint: input.fingerprint,
  };
  const job = await withScope(scope, async (tx) => {
    const created = await createArchiveJobTx(tx, {
      id,
      workspaceId: scope.workspaceId,
      kind: "restore",
      requestedBy: scope.actorUserId,
      storageKey: key,
      schemaVersion: archive.schemaVersion,
      preview,
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "workspace_archive_job",
      entityId: id,
      action: "workspace.restore_requested",
      diff: { totalRows: validation.totalRows },
      requestId,
    });
    return created;
  });
  return { id: job.id, kind: job.kind, status: job.status, createdAt: job.createdAt };
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export type WorkspaceArchiveResult = {
  jobId: string;
  kind: "backup" | "restore";
  status: "succeeded" | "failed";
  failureCode: string | null;
};

async function processBackup(
  workspaceId: string,
  jobId: string,
  requestId: string,
): Promise<Record<string, unknown>> {
  const storage = getFileStorageAdapter();
  const job = await findArchiveJob(workspaceId, jobId);
  if (!job) throw new AppError("NOT_FOUND");

  const tables = await withScope({ workspaceId }, (tx) => loadTenantRowsTx(tx, workspaceId));
  const fileRows = tables.file ?? [];
  const fileObjectKeys = fileRows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const value = (row as Record<string, unknown>).storage_key;
    return typeof value === "string" ? [value] : [];
  });
  const envelope = {
    format: WORKSPACE_ARCHIVE_FORMAT,
    schemaVersion: WORKSPACE_ARCHIVE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    workspaceId,
    tables,
    fileObjectKeys,
  };
  const body = Buffer.from(JSON.stringify(envelope), "utf8");
  await storage.put({
    key: job.storageKey,
    body,
    contentType: "application/json",
  });

  await withScope({ workspaceId }, async (tx) => {
    await completeArchiveJobTx(tx, workspaceId, jobId, {
      result: {
        bytes: body.byteLength,
        tables: Object.keys(tables).length,
        fileObjects: fileObjectKeys.length,
      },
    });
    await writeAuditEvent(tx, {
      workspaceId,
      actorUserId: job.requestedBy,
      actorDisplayName: "Worker",
      actorType: "system",
      entityType: "workspace_archive_job",
      entityId: jobId,
      action: "workspace.exported",
      diff: { bytes: body.byteLength, tables: Object.keys(tables).length },
      requestId,
    });
    await createNotificationTx(tx, workspaceId, {
      recipientUserId: job.requestedBy,
      type: "backup_ready",
      messageKey: "Notifications.messages.backupReady",
      entityType: "workspace_archive_job",
      entityId: jobId,
    });
  });
  return { bytes: body.byteLength };
}

async function processRestore(
  workspaceId: string,
  jobId: string,
  requestId: string,
): Promise<Record<string, unknown>> {
  const storage = getFileStorageAdapter();
  const job = await findArchiveJob(workspaceId, jobId);
  if (!job) throw new AppError("NOT_FOUND");

  const buffer = await storage.get(job.storageKey);
  const previewFingerprint = (job.preview as unknown as { fingerprint?: unknown } | null)
    ?.fingerprint;
  if (typeof previewFingerprint !== "string" || archiveFingerprint(buffer) !== previewFingerprint) {
    throw new AppError("CONFLICT", { messageKey: "Workspace.data.previewExpired" });
  }

  const archive = parseArchiveBuffer(buffer);
  const columns = await withScope({ workspaceId }, (tx) => getTableColumnsTx(tx));
  const missingFileObjects = await countMissingObjects(storage, archive.fileObjectKeys);
  const validation = validateArchive({ archive, workspaceId, columns, missingFileObjects });
  if (!validation.applicable) {
    throw new AppError("VALIDATION_FAILED", {
      messageKey: archiveFailureMessageKey(validation.issues[0] ?? null),
    });
  }

  const result = await withScope({ workspaceId }, async (tx) => {
    const edges = await getForeignKeysTx(tx);
    await clearMutableRowsTx(tx, workspaceId, edges);
    const applied = await insertArchivedRowsTx(tx, archive.tables, edges);
    const counts = await countTenantRowsTx(tx, workspaceId);
    const orphans = await findOrphansTx(tx, workspaceId, edges);
    if (orphans.length > 0) {
      throw new AppError("CONFLICT", {
        messageKey: "Workspace.data.integrityFailed",
        fields: { tables: orphans },
      });
    }
    const mismatches = ARCHIVE_TABLES.filter(
      (table) => (counts[table] ?? 0) !== (archive.tables[table]?.length ?? 0),
    );
    if (mismatches.length > 0) {
      throw new AppError("CONFLICT", {
        messageKey: "Workspace.data.integrityFailed",
        fields: { tables: mismatches },
      });
    }

    await completeArchiveJobTx(tx, workspaceId, jobId, { result: { applied, counts } });
    await writeAuditEvent(tx, {
      workspaceId,
      actorUserId: job.requestedBy,
      actorDisplayName: "Worker",
      actorType: "system",
      entityType: "workspace_archive_job",
      entityId: jobId,
      action: "workspace.restored",
      diff: { tables: ARCHIVE_TABLES.length, retained: validation.retainedTables.length },
      requestId,
    });
    return { applied, counts };
  });
  return result;
}

/**
 * Drain one workspace's archive jobs. Claiming is committed before any storage
 * I/O so no network call ever runs inside a tenant transaction (ADR-0008).
 */
export async function processWorkspaceArchiveBatch(
  workspaceId: string,
  limit: number = ARCHIVE_BATCH_SIZE,
): Promise<WorkspaceArchiveResult[]> {
  const claimed = await withScope({ workspaceId }, (tx) =>
    claimArchiveJobTx(tx, workspaceId, limit),
  );
  const results: WorkspaceArchiveResult[] = [];

  for (const jobId of claimed) {
    const job = await findArchiveJob(workspaceId, jobId);
    if (!job) continue;
    const requestId = newRequestId();
    try {
      await (job.kind === "backup"
        ? processBackup(workspaceId, jobId, requestId)
        : processRestore(workspaceId, jobId, requestId));
      results.push({ jobId, kind: job.kind, status: "succeeded", failureCode: null });
    } catch (error) {
      const code = error instanceof AppError ? error.code : WORKSPACE_ARCHIVE_FAILED_CODE;
      await withScope({ workspaceId }, (tx) =>
        failArchiveJobTx(tx, workspaceId, jobId, code),
      );
      results.push({ jobId, kind: job.kind, status: "failed", failureCode: code });
    }
  }
  return results;
}

/** Fan out across active workspaces using identifiers only (ADR-0024). */
export async function processAllWorkspaceArchiveJobs(): Promise<WorkspaceArchiveResult[]> {
  const workspaceIds = await listActiveWorkspaceIdsForWorker();
  const results: WorkspaceArchiveResult[] = [];
  for (const workspaceId of workspaceIds) {
    const batch = await processWorkspaceArchiveBatch(workspaceId, ARCHIVE_BATCH_SIZE);
    results.push(...batch);
  }
  return results;
}
