import process from "node:process";
import { drainMessageOutboxes, drainReportExports, workerPollIntervalMs } from "./drain";

/** Never log job ids, guardian data, or message bodies — counts only. */
function summarize(count: { processed: number; succeeded: number; failedOrDeferred: number }): string {
  return `processed=${count.processed} succeeded=${count.succeeded} failed_deferred=${count.failedOrDeferred}`;
}

export interface RunOptions {
  /** Poll interval (ms). Defaults to WORKER_POLL_INTERVAL_SECONDS (30s). */
  intervalMs?: number;
  /** Cap message-outbox workspaces drained per pass; `Infinity` drains every active workspace each cycle. */
  maxOutboxWorkspacesPerPass?: number;
  /** Stop after N cycles. Used by tests; omit in production (loops until SIGTERM/SIGINT). */
  maxCycles?: number;
}

let shuttingDown = false;

/** Tests reset the loop's shutdown flag so a loop does not begin another cycle after completion. */
export function resetWorkerStoppingForTests(): void {
  shuttingDown = false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drain one pass of each queue. Every workspace drain runs inside its own scoped
 * transaction (RLS), so a failure here never aborts the other drains; the next
 * pass retries. Returns one summary per queue, plus the number of workspaces
 * touched by the outbox fan-out.
 */
async function drainAll(
  maxOutboxWorkspacesPerPass: number,
): Promise<{
  report: Awaited<ReturnType<typeof drainReportExports>>;
  outbox: Awaited<ReturnType<typeof drainMessageOutboxes>>;
}> {
  const result = await drainMessageOutboxes(
    maxOutboxWorkspacesPerPass,
  ).catch((error: unknown) => {
    console.error(`[worker] message outbox cycle failed: ${error instanceof Error ? error.name : "unknown"}`);
    return { job: "message_outbox" as const, processed: 0, succeeded: 0, failedOrDeferred: 0, workspaces: 0 };
  });

  let report: Awaited<ReturnType<typeof drainReportExports>> = {
    job: "report_export",
    processed: 0,
    succeeded: 0,
    failedOrDeferred: 0,
  };

  try {
    report = await drainReportExports();
  } catch (error) {
    console.error(`[worker] report exports cycle failed: ${error instanceof Error ? error.name : "unknown"}`);
  }

  return { report, outbox: result };
}

/**
 * Run the production worker loop until SIGTERM/SIGINT (or until `maxCycles`
 * elapses — used by tests). Polling always sleeps `intervalMs` between passes;
 * one cycle's failure does not abort the loop.
 */
export async function runWorker(options: RunOptions = {}): Promise<void> {
  const intervalMs = options.intervalMs ?? workerPollIntervalMs();
  const maxOutboxWorkspacesPerPass = options.maxOutboxWorkspacesPerPass ?? Number.POSITIVE_INFINITY;

  const onSignal = () => {
    shuttingDown = true;
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);

  let cycles = 0;
  while (!shuttingDown) {
    const started = Date.now();
    const { report, outbox } = await drainAll(maxOutboxWorkspacesPerPass);
    cycles += 1;
    // `warn` only because this project's ESLint rule restricts console output to
    // warn/error (no structured logger SDK chosen yet — OI-3). Railway captures
    // both stdout and stderr regardless of level label.
    console.warn(
      `[worker] cycle ok report=${summarize(report)} outbox=${summarize(outbox)} workspaces=${outbox.workspaces} elapsed_ms=${Date.now() - started}`,
    );
    if (shuttingDown) break;
    if (options.maxCycles !== undefined && cycles >= options.maxCycles) break;
    // An idle pass still sleeps intervalMs: the poll cadence is intentional
    // (ADR-0008 — the worker is a low-frequency poller). Work visibility and
    // drain latency are governed by intervalMs and the batch sizes, not by
    // skipping the sleep.
    await sleep(intervalMs);
  }

  process.removeListener("SIGTERM", onSignal);
  process.removeListener("SIGINT", onSignal);
  console.warn(`[worker] shutdown complete after ${cycles} cycle(s)`);
}
