import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadReport, getReportTimezone } = vi.hoisted(() => ({
  loadReport: vi.fn(),
  getReportTimezone: vi.fn(),
}));

vi.mock("@/modules/reports/repository", () => ({
  loadReport,
  getReportTimezone,
}));

import { AppError } from "@/lib/http/errors";
import { exportReport, getReport } from "@/modules/reports/service";
import { reportExportSchema, reportQuerySchema } from "@/modules/reports/schemas";
import type { Scope } from "@/modules/tenancy/types";

const owner: Scope = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  actorUserId: "10000000-0000-4000-8000-000000000001",
  actorDisplayName: "Owner",
  role: "owner",
  permissions: new Set(),
};

const assistantWithoutPayments: Scope = {
  ...owner,
  actorUserId: "10000000-0000-4000-8000-000000000002",
  role: "assistant",
  permissions: new Set(["attendance:read"]),
};

beforeEach(() => {
  vi.clearAllMocks();
  getReportTimezone.mockResolvedValue("Africa/Cairo");
});

describe("report filters and CSV security", () => {
  it("validates date ranges and bounds paginated report sizes", () => {
    expect(reportQuerySchema.safeParse({
      type: "attendance",
      from: "2026-10-20",
      to: "2026-10-01",
    }).success).toBe(false);
    expect(reportQuerySchema.safeParse({
      type: "attendance",
      page: 50,
      pageSize: 100,
    }).success).toBe(true);
    expect(reportQuerySchema.safeParse({
      type: "attendance",
      page: 51,
      pageSize: 100,
    }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ type: "balances" }).success).toBe(false);
    expect(reportQuerySchema.safeParse({
      type: "balances",
      to: "2026-10-29",
      from: "2026-10-01",
    }).success).toBe(false);
  });

  it("passes the selected date, group, and student filters to the report query", async () => {
    loadReport.mockResolvedValue({
      timezone: "Africa/Cairo",
      total: 1,
      items: [{ date: new Date("2026-10-20T14:00:00.000Z"), group: "Physics", student: "A", attendance: "present", sessionStatus: "completed" }],
    });
    const query = reportQuerySchema.parse({
      type: "attendance",
      from: "2026-10-20",
      to: "2026-10-29",
      groupId: "00000000-0000-4000-8000-000000000010",
      studentId: "00000000-0000-4000-8000-000000000020",
      page: 2,
      pageSize: 25,
    });
    const result = await getReport(owner, query);
    expect(loadReport).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        type: "attendance",
        from: "2026-10-20",
        to: "2026-10-29",
        groupId: "00000000-0000-4000-8000-000000000010",
        studentId: "00000000-0000-4000-8000-000000000020",
        page: 2,
        pageSize: 25,
      }),
      expect.objectContaining({ from: expect.any(Date), toExclusive: expect.any(Date) }),
    );
    expect(result.items[0]?.date).toBe("2026-10-20");
  });

  it("exports the same active filters and protects formula-like CSV cells", async () => {
    loadReport.mockResolvedValue({
      timezone: "Africa/Cairo",
      total: 1,
      items: [{
        student: "=HYPERLINK(\"https://example.invalid\")",
        group: "Physics",
        enrolledOn: new Date("2026-10-20T00:00:00.000Z"),
        leftOn: null,
      }],
    });
    const query = reportExportSchema.parse({
      type: "enrollment",
      from: "2026-10-01",
      to: "2026-10-29",
      groupId: "00000000-0000-4000-8000-000000000010",
      studentId: "00000000-0000-4000-8000-000000000020",
      limit: 500,
      locale: "en",
    });
    const csv = await exportReport(owner, query);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(loadReport).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        type: "enrollment",
        from: "2026-10-01",
        to: "2026-10-29",
        groupId: query.groupId,
        studentId: query.studentId,
      }),
      expect.any(Object),
      500,
    );
  });

  it("rejects oversized exports rather than silently truncating them", async () => {
    loadReport.mockResolvedValue({ timezone: "Africa/Cairo", total: 6, items: [] });
    const query = reportExportSchema.parse({ type: "enrollment", limit: 5 });
    await expect(exportReport(owner, query)).rejects.toBeInstanceOf(AppError);
  });

  it("denies payments reports without a payment grant before querying tenant data", async () => {
    const query = reportQuerySchema.parse({ type: "payments" });
    await expect(getReport(assistantWithoutPayments, query)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(getReportTimezone).not.toHaveBeenCalled();
    expect(loadReport).not.toHaveBeenCalled();
  });

  it("reports filtered student balances as an as-of snapshot using integer EGP amounts", async () => {
    loadReport.mockResolvedValue({
      timezone: "Africa/Cairo",
      total: 1,
      items: [{
        asOf: "2026-10-29",
        student: "A",
        group: "Physics",
        expectedMinor: 10_000,
        receivedMinor: 2_500,
        adjustmentsMinor: -500,
        balanceMinor: 7_000,
      }],
    });
    const query = reportQuerySchema.parse({
      type: "balances",
      to: "2026-10-29",
      groupId: "00000000-0000-4000-8000-000000000010",
      studentId: "00000000-0000-4000-8000-000000000020",
    });

    const result = await getReport(owner, query);

    expect(loadReport).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        type: "balances",
        to: "2026-10-29",
        groupId: query.groupId,
        studentId: query.studentId,
      }),
      expect.objectContaining({ toExclusive: expect.any(Date) }),
    );
    expect(result.items[0]).toMatchObject({
      expectedEgp: "100.00",
      receivedEgp: "25.00",
      adjustmentsEgp: "-5.00",
      balanceEgp: "70.00",
    });
  });

  it("exports balance snapshots with the selected as-of, group, and student filters", async () => {
    loadReport.mockResolvedValue({
      timezone: "Africa/Cairo",
      total: 1,
      items: [{
        asOf: "2026-10-29",
        student: "+=IMPORT",
        group: "Physics",
        expectedMinor: 10_000,
        receivedMinor: 2_500,
        adjustmentsMinor: 0,
        balanceMinor: 7_500,
      }],
    });
    const query = reportExportSchema.parse({
      type: "balances",
      to: "2026-10-29",
      groupId: "00000000-0000-4000-8000-000000000010",
      studentId: "00000000-0000-4000-8000-000000000020",
      limit: 500,
      locale: "en",
    });

    const csv = await exportReport(owner, query);

    expect(csv).toContain('"Balance as of"');
    expect(csv).toContain("'+=IMPORT");
    expect(loadReport).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        type: "balances",
        to: "2026-10-29",
        groupId: query.groupId,
        studentId: query.studentId,
      }),
      expect.any(Object),
      500,
    );
  });
});
