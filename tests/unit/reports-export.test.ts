import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "@/modules/tenancy/types";
import { permissionKey } from "@/modules/tenancy/types";

const repository = vi.hoisted(() => ({
  claimReportExportJobs: vi.fn(),
  findReportExportForWorker: vi.fn(),
  canUserReadReport: vi.fn(),
  completeReportExport: vi.fn(),
  failReportExport: vi.fn(),
  removeReportExportQueueEntry: vi.fn(),
  createReportExportJob: vi.fn(),
  findReportExport: vi.fn(),
  getReportTimezone: vi.fn(),
  loadReport: vi.fn(),
}));

const storage = vi.hoisted(() => ({
  put: vi.fn(),
  delete: vi.fn(),
  signDownload: vi.fn(),
}));

const audit = vi.hoisted(() => ({ writeAuditEvent: vi.fn() }));

vi.mock("@/modules/reports/repository", () => repository);
vi.mock("@/modules/files/adapters", () => ({ getFileStorageAdapter: () => storage }));
vi.mock("@/modules/audit/service", () => audit);

import { setPdfRendererAdapterForTests } from "@/modules/reports/adapters";
import {
  getReportExportStatus,
  processReportExportBatch,
  requestReportExport,
} from "@/modules/reports/service";

const ownerScope: Scope = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  actorUserId: "22222222-2222-4222-8222-222222222222",
  actorDisplayName: "Owner",
  role: "owner",
  permissions: new Set([permissionKey("exports", "write")]),
};

const workerJob = {
  id: "33333333-3333-4333-8333-333333333333",
  type: "attendance",
  query: { type: "attendance", limit: 5000, locale: "en", format: "csv" },
  status: "processing",
  requestedBy: ownerScope.actorUserId,
  filename: "kashkol-attendance.csv",
};

describe("report export lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.getReportTimezone.mockResolvedValue("Africa/Cairo");
    repository.loadReport.mockResolvedValue({ items: [], total: 0 });
    repository.removeReportExportQueueEntry.mockResolvedValue(undefined);
    storage.put.mockResolvedValue(undefined);
    storage.delete.mockResolvedValue(undefined);
    audit.writeAuditEvent.mockResolvedValue(undefined);
    setPdfRendererAdapterForTests(null);
  });

  afterEach(() => {
    setPdfRendererAdapterForTests(null);
  });

  it("creates a queued job and writes the request audit event in the same callback", async () => {
    repository.createReportExportJob.mockImplementation(
      async (_scope, input, onCreated: (tx: unknown, id: string) => Promise<void>) => {
        await onCreated({}, input.id);
        return { id: input.id, status: "queued", createdAt: new Date("2026-01-01") };
      },
    );

    const result = await requestReportExport(
      ownerScope,
      { type: "attendance", limit: 5000, locale: "en", format: "csv" },
      "request-1",
    );

    expect(result.status).toBe("queued");
    expect(repository.createReportExportJob).toHaveBeenCalledOnce();
    expect(audit.writeAuditEvent).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        action: "report.export_requested",
        entityType: "report_export",
        requestId: "request-1",
      }),
    );
  });

  it("runs a claimed job, stores the CSV, marks it ready, and removes the queue entry", async () => {
    repository.claimReportExportJobs.mockResolvedValue([
      { job_id: workerJob.id, workspace_id: ownerScope.workspaceId },
    ]);
    repository.findReportExportForWorker.mockResolvedValue(workerJob);
    repository.canUserReadReport.mockResolvedValue(true);
    repository.completeReportExport.mockImplementation(
      async (_ws, _id, _key, onCompleted: (tx: unknown) => Promise<void>) => {
        await onCompleted({});
        return { count: 1 };
      },
    );

    const results = await processReportExportBatch(5);

    expect(results).toEqual([{ id: workerJob.id, status: "ready" }]);
    expect(storage.put).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "text/csv; charset=utf-8" }),
    );
    expect(repository.completeReportExport).toHaveBeenCalledOnce();
    expect(repository.removeReportExportQueueEntry).toHaveBeenCalledWith(
      workerJob.id,
      ownerScope.workspaceId,
    );
  });

  it("marks the job failed with PERMISSION_REVOKED when the requester lost read access", async () => {
    repository.claimReportExportJobs.mockResolvedValue([
      { job_id: workerJob.id, workspace_id: ownerScope.workspaceId },
    ]);
    repository.findReportExportForWorker.mockResolvedValue(workerJob);
    repository.canUserReadReport.mockResolvedValue(false);
    repository.failReportExport.mockImplementation(
      async (_ws, _id, _code, onFailed: (tx: unknown) => Promise<void>) => {
        await onFailed({});
        return { count: 1 };
      },
    );

    const results = await processReportExportBatch(5);

    expect(results).toEqual([{ id: workerJob.id, status: "failed" }]);
    expect(repository.failReportExport).toHaveBeenCalledWith(
      ownerScope.workspaceId,
      workerJob.id,
      "PERMISSION_REVOKED",
      expect.any(Function),
    );
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("returns a signed download URL only for a ready export", async () => {
    repository.findReportExport.mockResolvedValue({
      id: workerJob.id,
      type: "attendance",
      query: workerJob.query,
      status: "ready",
      filename: workerJob.filename,
      storageKey: `ws/${ownerScope.workspaceId}/reports/export.csv`,
      failureCode: null,
      createdAt: new Date("2026-01-01"),
      completedAt: new Date("2026-01-01"),
    });
    storage.signDownload.mockResolvedValue("https://files.example.test/signed");

    const ready = await getReportExportStatus(ownerScope, workerJob.id);
    expect(ready.downloadUrl).toBe("https://files.example.test/signed");
    expect(storage.signDownload).toHaveBeenCalledWith(
      expect.objectContaining({ ttlSeconds: 300, contentType: "text/csv; charset=utf-8" }),
    );

    repository.findReportExport.mockResolvedValue({
      id: workerJob.id,
      type: "attendance",
      query: workerJob.query,
      status: "queued",
      filename: workerJob.filename,
      storageKey: null,
      failureCode: null,
      createdAt: new Date("2026-01-01"),
      completedAt: null,
    });
    const queued = await getReportExportStatus(ownerScope, workerJob.id);
    expect(queued.downloadUrl).toBeNull();
  });

  it("names the requested format's filename extension and records the format in the audit diff", async () => {
    repository.createReportExportJob.mockImplementation(
      async (_scope, input, onCreated: (tx: unknown, id: string) => Promise<void>) => {
        await onCreated({}, input.id);
        return { id: input.id, status: "queued", createdAt: new Date("2026-01-01") };
      },
    );

    await requestReportExport(
      ownerScope,
      { type: "homework", limit: 5000, locale: "ar", format: "xlsx" },
      "request-2",
    );

    expect(repository.createReportExportJob).toHaveBeenCalledWith(
      ownerScope,
      expect.objectContaining({ filename: expect.stringMatching(/\.xlsx$/) }),
      expect.any(Function),
    );
    expect(audit.writeAuditEvent).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ diff: { type: "homework", format: "xlsx" } }),
    );
  });

  it("generates a real XLSX buffer with the spreadsheet content type", async () => {
    repository.claimReportExportJobs.mockResolvedValue([
      { job_id: workerJob.id, workspace_id: ownerScope.workspaceId },
    ]);
    repository.findReportExportForWorker.mockResolvedValue({
      ...workerJob,
      query: { ...workerJob.query, format: "xlsx" },
    });
    repository.canUserReadReport.mockResolvedValue(true);
    repository.completeReportExport.mockImplementation(
      async (_ws, _id, _key, onCompleted: (tx: unknown) => Promise<void>) => {
        await onCompleted({});
        return { count: 1 };
      },
    );

    const results = await processReportExportBatch(5);

    expect(results).toEqual([{ id: workerJob.id, status: "ready" }]);
    expect(storage.put).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/\.xlsx$/),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: expect.any(Buffer),
      }),
    );
    expect((storage.put.mock.calls[0][0] as { body: Buffer }).body.subarray(0, 2).toString()).toBe(
      "PK",
    );
  });

  it("renders a PDF through the injected adapter with escaped HTML", async () => {
    const renderer = {
      driver: "fake" as const,
      isConfigured: true,
      render: vi.fn(async (_html: string) => Buffer.from("%PDF-1.4 fake")),
    };
    setPdfRendererAdapterForTests(renderer);
    repository.loadReport.mockResolvedValue({
      items: [{ student: "<script>alert(1)</script>", group: "Group A" }],
      total: 1,
    });
    repository.claimReportExportJobs.mockResolvedValue([
      { job_id: workerJob.id, workspace_id: ownerScope.workspaceId },
    ]);
    repository.findReportExportForWorker.mockResolvedValue({
      ...workerJob,
      query: { ...workerJob.query, format: "pdf" },
    });
    repository.canUserReadReport.mockResolvedValue(true);
    repository.completeReportExport.mockImplementation(
      async (_ws, _id, _key, onCompleted: (tx: unknown) => Promise<void>) => {
        await onCompleted({});
        return { count: 1 };
      },
    );

    const results = await processReportExportBatch(5);

    expect(results).toEqual([{ id: workerJob.id, status: "ready" }]);
    expect(renderer.render).toHaveBeenCalledOnce();
    const html = renderer.render.mock.calls[0][0] as string;
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(storage.put).toHaveBeenCalledWith(
      expect.objectContaining({ key: expect.stringMatching(/\.pdf$/), contentType: "application/pdf" }),
    );
  });

  it("fails a PDF job closed when no renderer is configured", async () => {
    repository.claimReportExportJobs.mockResolvedValue([
      { job_id: workerJob.id, workspace_id: ownerScope.workspaceId },
    ]);
    repository.findReportExportForWorker.mockResolvedValue({
      ...workerJob,
      query: { ...workerJob.query, format: "pdf" },
    });
    repository.canUserReadReport.mockResolvedValue(true);
    repository.failReportExport.mockImplementation(
      async (_ws, _id, _code, onFailed: (tx: unknown) => Promise<void>) => {
        await onFailed({});
        return { count: 1 };
      },
    );

    const results = await processReportExportBatch(5);

    expect(results).toEqual([{ id: workerJob.id, status: "failed" }]);
    expect(storage.put).not.toHaveBeenCalled();
    expect(repository.failReportExport).toHaveBeenCalledWith(
      ownerScope.workspaceId,
      workerJob.id,
      "EXPORT_FAILED",
      expect.any(Function),
    );
  });
});
