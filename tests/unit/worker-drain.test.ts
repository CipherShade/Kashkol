import { beforeEach, describe, expect, it, vi } from "vitest";

const { processReportExportBatch, processOutboxBatch, listActiveWorkspaceIdsForWorker } =
  vi.hoisted(() => ({
    processReportExportBatch: vi.fn(),
    processOutboxBatch: vi.fn(),
    listActiveWorkspaceIdsForWorker: vi.fn(),
  }));

vi.mock("@/modules/reports/service", () => ({ processReportExportBatch }));
vi.mock("@/modules/messaging", () => ({ processOutboxBatch }));
vi.mock("@/modules/tenancy/repository", () => ({ listActiveWorkspaceIdsForWorker }));

import {
  OUTBOX_BATCH_SIZE,
  REPORT_BATCH_SIZE,
  drainMessageOutboxes,
  drainReportExports,
  merge,
} from "@/worker/drain";
import { createMessagingWorkerScope } from "@/lib/worker/system-actor";

const WORKSPACE_A = "00000000-0000-4000-8000-0000000000aa";
const WORKSPACE_B = "00000000-0000-4000-8000-0000000000bb";

beforeEach(() => {
  processReportExportBatch.mockReset();
  processOutboxBatch.mockReset();
  listActiveWorkspaceIdsForWorker.mockReset();
});

describe("merge", () => {
  it("preserves job type report_export when merging two report_export reports", () => {
    expect(
      merge(
        { job: "report_export", processed: 2, succeeded: 1, failedOrDeferred: 1 },
        { job: "report_export", processed: 3, succeeded: 2, failedOrDeferred: 1 },
      ),
    ).toEqual({ job: "report_export", processed: 5, succeeded: 3, failedOrDeferred: 2 });
  });

  it("preserves job type message_outbox when merging two message_outbox reports", () => {
    expect(
      merge(
        { job: "message_outbox", processed: 4, succeeded: 3, failedOrDeferred: 1 },
        { job: "message_outbox", processed: 2, succeeded: 1, failedOrDeferred: 1 },
      ),
    ).toEqual({ job: "message_outbox", processed: 6, succeeded: 4, failedOrDeferred: 2 });
  });

  it("rejects merging reports of different job types", () => {
    expect(() =>
      merge(
        { job: "report_export", processed: 1, succeeded: 1, failedOrDeferred: 0 },
        { job: "message_outbox", processed: 1, succeeded: 1, failedOrDeferred: 0 },
      ),
    ).toThrow("cannot merge drain reports for different jobs: report_export vs message_outbox");
  });
});

describe("drainReportExports", () => {
  it("reports zero counts when the queue is empty", async () => {
    processReportExportBatch.mockResolvedValue([]);

    const report = await drainReportExports();

    expect(report).toEqual({
      job: "report_export",
      processed: 0,
      succeeded: 0,
      failedOrDeferred: 0,
    });
    expect(processReportExportBatch).toHaveBeenCalledWith(REPORT_BATCH_SIZE);
  });

  it("counts ready jobs as succeeded and failed jobs as failedOrDeferred", async () => {
    processReportExportBatch.mockResolvedValue([
      { id: "job-1", status: "ready" },
      { id: "job-2", status: "ready" },
      { id: "job-3", status: "failed" },
    ]);

    const report = await drainReportExports();

    expect(report.processed).toBe(3);
    expect(report.succeeded).toBe(2);
    expect(report.failedOrDeferred).toBe(1);
  });

  it("propagates a batch failure so the caller can log and continue", async () => {
    processReportExportBatch.mockRejectedValue(new Error("storage boom"));

    await expect(drainReportExports()).rejects.toThrow("storage boom");
  });
});

describe("drainMessageOutboxes", () => {
  it("merges counts across enumerated workspaces and uses a system scope", async () => {
    listActiveWorkspaceIdsForWorker.mockResolvedValue([WORKSPACE_A, WORKSPACE_B]);
    processOutboxBatch.mockImplementation(async (scope: { workspaceId: string }) =>
      scope.workspaceId === WORKSPACE_A
        ? [{ id: "m-1", success: true }]
        : [
            { id: "m-2", success: false },
            { id: "m-3", success: true },
          ],
    );

    const report = await drainMessageOutboxes();

    expect(report.workspaces).toBe(2);
    expect(report.processed).toBe(3);
    expect(report.succeeded).toBe(2);
    expect(report.failedOrDeferred).toBe(1);
    expect(processOutboxBatch).toHaveBeenCalledTimes(2);
    expect(processOutboxBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_A,
        actorUserId: "system:messaging-worker",
        role: "owner",
      }),
      OUTBOX_BATCH_SIZE,
    );
    expect(processOutboxBatch).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_B }),
      OUTBOX_BATCH_SIZE,
    );
  });

  it("honours maxWorkspacesPerPass and stops before touching later workspaces", async () => {
    listActiveWorkspaceIdsForWorker.mockResolvedValue([
      "00000000-0000-4000-8000-00000000000a",
      "00000000-0000-4000-8000-00000000000b",
      "00000000-0000-4000-8000-00000000000c",
      "00000000-0000-4000-8000-00000000000d",
    ]);
    processOutboxBatch.mockResolvedValue([]);

    const report = await drainMessageOutboxes(2);

    expect(report.workspaces).toBe(2);
    expect(processOutboxBatch).toHaveBeenCalledTimes(2);
  });

  it("keeps draining other workspaces when one workspace fails", async () => {
    listActiveWorkspaceIdsForWorker.mockResolvedValue([WORKSPACE_A, WORKSPACE_B]);
    processOutboxBatch
      .mockRejectedValueOnce(new Error("tenant boom"))
      .mockResolvedValueOnce([{ id: "m-4", success: true }]);

    const report = await drainMessageOutboxes();

    expect(processOutboxBatch).toHaveBeenCalledTimes(2);
    expect(report.workspaces).toBe(2);
    expect(report.processed).toBe(1);
    expect(report.succeeded).toBe(1);
    expect(report.failedOrDeferred).toBe(0);
  });

  it("returns zero counts with no active workspaces", async () => {
    listActiveWorkspaceIdsForWorker.mockResolvedValue([]);

    const report = await drainMessageOutboxes();

    expect(report).toEqual({
      job: "message_outbox",
      processed: 0,
      succeeded: 0,
      failedOrDeferred: 0,
      workspaces: 0,
    });
    expect(processOutboxBatch).not.toHaveBeenCalled();
  });
});

describe("createMessagingWorkerScope", () => {
  it("never carries a real user id", () => {
    const scope = createMessagingWorkerScope(WORKSPACE_A);

    expect(scope.actorUserId).toBe("system:messaging-worker");
    expect(scope.actorDisplayName).toBe("Messaging worker");
    expect(scope.permissions.size).toBe(0);
  });
});
