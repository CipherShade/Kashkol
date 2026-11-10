import { getServerEnv } from "@/lib/config/env";
import { listActiveWorkspaceIdsForWorker } from "@/modules/tenancy/repository";
import { processOutboxBatch } from "@/modules/messaging";
import { processReportExportBatch } from "@/modules/reports/service";
import { createMessagingWorkerScope } from "@/lib/worker/system-actor";

export const REPORT_BATCH_SIZE = 10;
export const OUTBOX_BATCH_SIZE = 25;

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

function merge(count: DrainReport, other: DrainReport): DrainReport {
  return {
    job: "message_outbox",
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

export function workerPollIntervalMs(): number {
  const env = getServerEnv();
  return env.WORKER_POLL_INTERVAL_SECONDS * 1000;
}
