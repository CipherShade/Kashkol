import { getServerEnv } from "@/lib/config/env";
import { listActiveWorkspaceIdsForWorker } from "@/modules/tenancy/repository";
import { processOutboxBatch } from "@/modules/messaging";
import { processReportExportBatch } from "@/modules/reports/service";
import {
  createMessagingWorkerScope,
  createNotificationWorkerScope,
} from "@/lib/worker/system-actor";
import { evaluateNotificationRules } from "@/modules/notifications/rules";
import { processWorkspaceArchiveBatch } from "@/modules/workspace-backup/service";

export const REPORT_BATCH_SIZE = 10;
export const OUTBOX_BATCH_SIZE = 25;
export const ARCHIVE_BATCH_SIZE = 5;

export type ArchiveDrainReport = {
  readonly job: "workspace_archive";
  readonly processed: number;
  readonly succeeded: number;
  readonly failedOrDeferred: number;
};

/**
 * The counts returned by one drain pass. Counts are safe to log: they contain
 * no tenant identifier, no message body, and no personal data.
 */
export type DrainReport = {
  readonly job: "report_export" | "message_outbox";
  readonly processed: number;
  readonly succeeded: number;
  readonly failedOrDeferred: number;
};

/**
 * Fold two same-type drain reports into one. The merged report carries the shared
 * job; reports of different jobs are refused rather than silently summed into one
 * job's bucket.
 *
 * Exported for unit tests only — `drainMessageOutboxes` is the only production caller.
 */
export function merge(count: DrainReport, other: DrainReport): DrainReport {
  if (count.job !== other.job) {
    throw new Error(
      `cannot merge drain reports for different jobs: ${count.job} vs ${other.job}`,
    );
  }
  return {
    job: count.job,
    processed: count.processed + other.processed,
    succeeded: count.succeeded + other.succeeded,
    failedOrDeferred: count.failedOrDeferred + other.failedOrDeferred,
  };
}

/**
 * Drain queued report exports across all workspaces. The claim itself is
 * scoped by SKIP LOCKED (`claimReportExportJobs`), so a duplicated drain is
 * safe. Failed jobs are marked failed with a reason and surfaced to the
 * teacher rather than retried — retryPolicy is deliberately visible-failure.
 */
export async function drainReportExports(): Promise<DrainReport> {
  const results = await processReportExportBatch(REPORT_BATCH_SIZE);
  const succeeded = results.filter((result) => result.status === "ready").length;
  return {
    job: "report_export",
    processed: results.length,
    succeeded,
    failedOrDeferred: results.length - succeeded,
  };
}

/**
 * Drain the message outbox for every active workspace.
 *
 * The per-workspace checkpoint runs the same scoped transaction the route
 * uses, so RLS still bounds every read and write to the workspace being
 * drained. The only cross-workspace step is the SECURITY DEFINER identifier
 * enumeration (ADR-0024) — identifiers only, never tenant data — which is
 * what makes a fan-out worker possible without widening any tenant table's
 * read policy.
 */
export async function drainMessageOutboxes(
  maxWorkspacesPerPass: number = Number.POSITIVE_INFINITY,
): Promise<DrainReport & { readonly workspaces: number }> {
  const workspaceIds = await listActiveWorkspaceIdsForWorker();
  let total: DrainReport = {
    job: "message_outbox",
    processed: 0,
    succeeded: 0,
    failedOrDeferred: 0,
  };
  let iterations = 0;

  for (const workspaceId of workspaceIds) {
    if (iterations >= maxWorkspacesPerPass) break;
    iterations += 1;
    const scope = createMessagingWorkerScope(workspaceId);
    let results;
    try {
      results = await processOutboxBatch(scope, OUTBOX_BATCH_SIZE);
    } catch {
      // A workspace whose drain fails must not abort the whole cycle: other
      // workspaces still need their messages and exports drained. The failure
      // is retried on the next pass; the caller logs the cycle outcome.
      continue;
    }
    const succeeded = results.filter((result) => result.success === true).length;
    total = merge(total, {
      job: "message_outbox",
      processed: results.length,
      succeeded,
      failedOrDeferred: results.length - succeeded,
    });
  }

  return { ...total, workspaces: iterations };
}

/**
 * Drain owner-requested workspace backups and restores. Like the message
 * outbox, the only cross-workspace step is identifier enumeration; every job
 * runs inside its own scoped transactions (ADR-0024, ADR-0039).
 */
export async function drainWorkspaceArchives(
  maxWorkspacesPerPass: number = Number.POSITIVE_INFINITY,
): Promise<ArchiveDrainReport & { readonly workspaces: number }> {
  const workspaceIds = await listActiveWorkspaceIdsForWorker();
  let processed = 0;
  let succeeded = 0;
  let iterations = 0;

  for (const workspaceId of workspaceIds) {
    if (iterations >= maxWorkspacesPerPass) break;
    iterations += 1;
    try {
      const results = await processWorkspaceArchiveBatch(workspaceId, ARCHIVE_BATCH_SIZE);
      processed += results.length;
      succeeded += results.filter((result) => result.status === "succeeded").length;
    } catch {
      // One workspace's archive failure must not stop the other drains.
      continue;
    }
  }

  return {
    job: "workspace_archive",
    processed,
    succeeded,
    failedOrDeferred: processed - succeeded,
    workspaces: iterations,
  };
}

export function workerPollIntervalMs(): number {
  const env = getServerEnv();
  return env.WORKER_POLL_INTERVAL_SECONDS * 1000;
}

/**
 * Evaluate notification rules (unrecorded sessions, homework due soon, pending grades)
 * for every active workspace on each worker cycle.
 */
export async function drainNotificationRules(
  maxWorkspacesPerPass: number = Number.POSITIVE_INFINITY,
): Promise<{ readonly processed: number; readonly created: number; readonly workspaces: number }> {
  const workspaceIds = await listActiveWorkspaceIdsForWorker();
  let created = 0;
  let iterations = 0;

  for (const workspaceId of workspaceIds) {
    if (iterations >= maxWorkspacesPerPass) break;
    iterations += 1;
    const scope = createNotificationWorkerScope(workspaceId);
    try {
      const result = await evaluateNotificationRules(scope);
      created += result.createdCount;
    } catch {
      continue;
    }
  }

  return { processed: iterations, created, workspaces: iterations };
}
