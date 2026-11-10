import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { drainMessageOutboxes, drainReportExports, workerPollIntervalMs } = vi.hoisted(() => ({
  drainMessageOutboxes: vi.fn(),
  drainReportExports: vi.fn(),
  workerPollIntervalMs: vi.fn(),
}));

vi.mock("@/worker/drain", () => ({
  drainMessageOutboxes,
  drainReportExports,
  workerPollIntervalMs,
  REPORT_BATCH_SIZE: 10,
  OUTBOX_BATCH_SIZE: 25,
}));

import { resetWorkerStoppingForTests, runWorker } from "@/worker/runner";

beforeEach(() => {
  drainMessageOutboxes.mockReset();
  drainReportExports.mockReset();
  workerPollIntervalMs.mockReset();
  resetWorkerStoppingForTests();
});

afterEach(() => {
  resetWorkerStoppingForTests();
  vi.restoreAllMocks();
});

function okDrain() {
  drainMessageOutboxes.mockResolvedValue({
    job: "message_outbox",
    processed: 1,
    succeeded: 1,
    failedOrDeferred: 0,
    workspaces: 1,
  });
  drainReportExports.mockResolvedValue({
    job: "report_export",
    processed: 1,
    succeeded: 1,
    failedOrDeferred: 0,
  });
}

describe("runWorker", () => {
  it("runs the requested number of cycles and logs a redacted summary", async () => {
    okDrain();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await runWorker({ maxCycles: 2, intervalMs: 1 });

    expect(drainMessageOutboxes).toHaveBeenCalledTimes(2);
    expect(drainReportExports).toHaveBeenCalledTimes(2);

    const cycleLines = warn.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.includes("[worker] cycle ok"));
    expect(cycleLines).toHaveLength(2);
    expect(cycleLines[0]).toContain("report=processed=1");
    expect(cycleLines[0]).not.toContain("job:");
  });

  it("continues the loop when the report drain fails but the outbox does not", async () => {
    okDrain();
    drainReportExports.mockReset().mockRejectedValue(new Error("storage boom"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    await runWorker({ maxCycles: 2, intervalMs: 1 });

    expect(drainReportExports).toHaveBeenCalledTimes(2);
    expect(drainMessageOutboxes).toHaveBeenCalledTimes(2);
  });

  it("continues the loop when the outbox drain fails but the report does not", async () => {
    okDrain();
    drainMessageOutboxes.mockRejectedValue(new Error("db boom"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    await runWorker({ maxCycles: 2, intervalMs: 1 });

    expect(drainReportExports).toHaveBeenCalledTimes(2);
    expect(drainMessageOutboxes).toHaveBeenCalledTimes(2);
  });

  it("exits after one cycle once a SIGTERM arrives mid-run", async () => {
    okDrain();
    let emitted = false;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    drainMessageOutboxes.mockImplementation(async () => {
      if (!emitted) {
        emitted = true;
        process.emit("SIGTERM");
      }
      return {
        job: "message_outbox",
        processed: 0,
        succeeded: 0,
        failedOrDeferred: 0,
        workspaces: 0,
      };
    });

    await runWorker({ intervalMs: 1 });

    expect(drainMessageOutboxes).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.flat().join(" ").includes("shutdown complete")).toBe(true);
  });
});
