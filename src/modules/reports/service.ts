import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { writeAuditEvent } from "@/modules/audit/service";
import {
  generateReportXlsx,
  getPdfRendererAdapter,
  renderReportPdfHtml,
  type ReportCell,
  type ReportTable,
} from "./adapters";
import { reportExportContentType, reportExportExtension, type ReportExportFormat } from "./formats";
import { getFileStorageAdapter } from "@/modules/files/adapters";
import { assertOwner, authorize, type Scope } from "@/modules/tenancy/types";
import { sanitizeSpreadsheetFormula } from "@/modules/students/schemas";
import { minorUnitsToEgp } from "@/modules/payments/schemas";
import {
  canUserReadReport,
  claimReportExportJobs,
  completeReportExport,
  createReportExportJob,
  failReportExport,
  findReportExport,
  findReportExportForWorker,
  getReportTimezone,
  loadReport,
  removeReportExportQueueEntry,
} from "./repository";
import type { ReportExportQuery, ReportQuery } from "./schemas";
import { reportExportSchema } from "./schemas";

const REPORT_PERMISSION = {
  attendance: ["attendance", "read"],
  enrollment: ["students", "read"],
  academics: ["grades", "read"],
  homework: ["homework", "read"],
  // Money reports are gated by assertOwner above. This resource is only the
  // generic report-read check and is not a money permission (ADR-0043).
  payments: ["sessions", "read"],
  sessionRevenue: ["sessions", "read"],
} as const;

const HEADERS = {
  en: {
    date: "Date",
    group: "Group",
    student: "Student",
    attendance: "Attendance",
    sessionStatus: "Session status",
    enrolledOn: "Enrolled on",
    leftOn: "Left on",
    assessment: "Assessment",
    score: "Score",
    maximum: "Maximum score",
    status: "Status",
    dueDate: "Due date",
    homework: "Homework",
    updatedAt: "Updated at",
    amountEgp: "Collected (EGP)",
    method: "Method",
    priceEgp: "Session price (EGP)",
    collectedEgp: "Collected (EGP)",
  },
  ar: {
    date: "التاريخ",
    group: "المجموعة",
    student: "الطالب",
    attendance: "الحضور",
    sessionStatus: "حالة الحصة",
    enrolledOn: "تاريخ التسجيل",
    leftOn: "تاريخ المغادرة",
    assessment: "التقييم",
    score: "الدرجة",
    maximum: "الدرجة النهائية",
    status: "الحالة",
    dueDate: "تاريخ الاستحقاق",
    homework: "الواجب",
    updatedAt: "تاريخ التحديث",
    method: "الطريقة",
    amountEgp: "المحصّل (جنيه)",
    priceEgp: "سعر الجلسة (جنيه)",
    collectedEgp: "المحصّل (جنيه)",
  },
} as const;

type ReportName = keyof typeof HEADERS.en;

function localMidnightUtc(date: string, timezone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const targetLocalAsUtc = Date.UTC(year, month - 1, day);
  let guess = targetLocalAsUtc;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map(({ type, value }) => [type, value]),
    );
    const observedLocalAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += targetLocalAsUtc - observedLocalAsUtc;
  }
  return new Date(guess);
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function localDate(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function reportBounds(query: ReportQuery | ReportExportQuery, timezone: string) {
  const dateFrom = query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined;
  const dateTo = query.to ? new Date(`${query.to}T00:00:00.000Z`) : undefined;
  return {
    from: query.from ? localMidnightUtc(query.from, timezone) : undefined,
    toExclusive: query.to
      ? localMidnightUtc(addDays(query.to, 1), timezone)
      : undefined,
    dateFrom,
    dateTo,
  };
}

function authorizeReport(scope: Scope, type: ReportQuery["type"]) {
  if (type === "payments" || type === "sessionRevenue") assertOwner(scope);
  const [resource, action] = REPORT_PERMISSION[type];
  authorize(scope, resource, action);
}

function serializeRows(
  rows: Array<Record<string, string | number | Date | null>>,
  timezone: string,
  type: ReportQuery["type"],
): Array<Record<string, ReportCell>> {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value instanceof Date
          ? type === "attendance" && key === "date"
            ? localDate(value, timezone)
            : type === "enrollment" && (key === "enrolledOn" || key === "leftOn")
              ? localDate(value, timezone)
              : key === "date" || key === "dueDate"
                ? dateOnly(value)
                : value.toISOString()
          : value,
      ]),
    ),
  );
}

export async function getReport(scope: Scope, query: ReportQuery) {
  authorizeReport(scope, query.type);
  const timezone = await getReportTimezone(scope);
  const data = await loadReport(scope, query, reportBounds(query, timezone));
  const items = data.items.map((row) => serializeMoneyRow(row, query.type));
  return {
    type: query.type,
    items: serializeRows(items, timezone, query.type),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: data.total,
      pageCount: Math.ceil(data.total / query.pageSize),
    },
    timezone,
  };
}

function serializeMoneyRow(
  row: Record<string, string | number | Date | null>,
  type: ReportQuery["type"],
) {
  if (type === "payments") {
    return { ...row, amountEgp: minorUnitsToEgp(Number(row.amountMinor)) };
  }
  if (type === "sessionRevenue") {
    return {
      ...row,
      priceEgp: row.priceMinor === null ? null : minorUnitsToEgp(Number(row.priceMinor)),
      collectedEgp: minorUnitsToEgp(Number(row.collectedMinor)),
    };
  }
  return row;
}

export async function exportReport(scope: Scope, query: ReportExportQuery): Promise<Buffer> {
  authorize(scope, "exports", "write");
  authorizeReport(scope, query.type);
  return generateReportContent(scope, query);
}

/** Loads and serializes the filtered rows once, independently of output format. */
async function buildReportTable(
  scope: Pick<Scope, "workspaceId">,
  query: ReportExportQuery,
): Promise<ReportTable> {
  const timezone = await getReportTimezone(scope);
  const reportQuery: ReportQuery = {
    ...query,
    page: 1,
    pageSize: Math.min(query.limit, 100),
  };
  const data = await loadReport(
    scope,
    reportQuery,
    reportBounds(query, timezone),
    query.limit,
  );
  if (data.total > query.limit) {
    throw new AppError("VALIDATION_FAILED", {
      messageKey: "reports.errors.exportLimitExceeded",
    });
  }
  const items = data.items.map((row) => serializeMoneyRow(row, query.type));
  const rows = serializeRows(items, timezone, query.type);
  const columns = {
    attendance: ["date", "group", "student", "attendance", "sessionStatus"],
    enrollment: ["student", "group", "enrolledOn", "leftOn"],
    academics: ["date", "group", "student", "assessment", "score", "maximum", "status"],
    homework: ["dueDate", "group", "student", "homework", "status", "updatedAt"],
    payments: ["date", "group", "amountEgp", "method"],
    sessionRevenue: ["date", "group", "priceEgp", "collectedEgp"],
  } as const;
  const headers: readonly string[] = columns[query.type];
  return {
    columns: headers,
    headers: headers.map((key) => HEADERS[query.locale][key as ReportName] ?? key),
    rows,
  };
}

function generateReportCsv(table: ReportTable): string {
  const csvCell = (value: unknown) => {
    const safe = sanitizeSpreadsheetFormula(value === null || value === undefined ? "" : String(value));
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const body = [
    table.headers.map(csvCell).join(","),
    ...table.rows.map((row) => table.columns.map((key) => csvCell(row[key])).join(",")),
  ].join("\r\n");
  return `\uFEFF${body}`;
}

async function generateReportContent(
  scope: Pick<Scope, "workspaceId">,
  query: ReportExportQuery,
): Promise<Buffer> {
  const table = await buildReportTable(scope, query);
  if (query.format === "xlsx") return generateReportXlsx(table, query.locale);
  if (query.format === "pdf") {
    return getPdfRendererAdapter().render(renderReportPdfHtml(table, query));
  }
  return Buffer.from(generateReportCsv(table), "utf8");
}

/** Legacy jobs stored before `format` existed are CSV. Never trust another field. */
function formatFromStoredQuery(query: unknown): ReportExportFormat {
  if (query && typeof query === "object" && !Array.isArray(query)) {
    return reportExportSchema.shape.format.parse(
      (query as Record<string, unknown>).format ?? "csv",
    );
  }
  return "csv";
}

export async function requestReportExport(
  scope: Scope,
  query: ReportExportQuery,
  requestId: string,
) {
  authorize(scope, "exports", "write");
  authorizeReport(scope, query.type);
  const id = newUuidV7();
  const filename = `kashkol-${query.type}-${id}.${reportExportExtension(query.format)}`;
  const job = await createReportExportJob(scope, { id, query, filename }, async (tx, jobId) => {
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "report_export",
      entityId: jobId,
      action: "report.export_requested",
      diff: { type: query.type, format: query.format },
      requestId,
    });
  });
  return { id: job.id, status: job.status, createdAt: job.createdAt };
}

export async function getReportExportStatus(scope: Scope, exportId: string) {
  authorize(scope, "exports", "read");
  const job = await findReportExport(scope, exportId);
  if (!job) throw new AppError("NOT_FOUND");
  const type = reportExportSchema.shape.type.parse(job.type);
  authorizeReport(scope, type);

  let downloadUrl: string | null = null;
  if (job.status === "ready") {
    if (!job.storageKey) throw new AppError("CONFLICT");
    downloadUrl = await getFileStorageAdapter().signDownload({
      key: job.storageKey,
      ttlSeconds: 300,
      filename: job.filename,
      contentType: reportExportContentType(formatFromStoredQuery(job.query)),
    });
  }
  return {
    id: job.id,
    status: job.status,
    failureCode: job.failureCode,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    downloadUrl,
  };
}

export async function processReportExportBatch(limit = 5) {
  const claimed = await claimReportExportJobs(limit);
  const results: Array<{ id: string; status: "ready" | "failed" }> = [];
  for (const { job_id: jobId, workspace_id: workspaceId } of claimed) {
    let storageKey: string | null = null;
    try {
      const job = await findReportExportForWorker(workspaceId, jobId);
      if (!job) {
        await removeReportExportQueueEntry(jobId, workspaceId);
        results.push({ id: jobId, status: "failed" });
        continue;
      }

      const parsed = reportExportSchema.safeParse(job.query);
      if (!parsed.success || parsed.data.type !== job.type) {
        throw new AppError("VALIDATION_FAILED");
      }
      const [resource] = REPORT_PERMISSION[parsed.data.type];
      if (!(await canUserReadReport(workspaceId, job.requestedBy, resource))) {
        throw new AppError("FORBIDDEN");
      }

      const content = await generateReportContent({ workspaceId }, parsed.data);
      storageKey = `ws/${workspaceId}/reports/${newUuidV7()}.${reportExportExtension(parsed.data.format)}`;
      await getFileStorageAdapter().put({
        key: storageKey,
        body: content,
        contentType: reportExportContentType(parsed.data.format),
      });

      const auditRequestId = newRequestId();
      const completed = await completeReportExport(
        workspaceId,
        jobId,
        storageKey,
        (tx) =>
          writeAuditEvent(tx, {
            workspaceId,
            actorUserId: null,
            actorDisplayName: "Report export worker",
            actorType: "system",
            entityType: "report_export",
            entityId: jobId,
            action: "report.export_created",
            diff: { type: parsed.data.type, format: parsed.data.format },
            requestId: auditRequestId,
          }),
      );
      if (!completed.count) {
        await getFileStorageAdapter().delete(storageKey);
        storageKey = null;
        throw new AppError("CONFLICT");
      }
      await removeReportExportQueueEntry(jobId, workspaceId);
      results.push({ id: jobId, status: "ready" });
    } catch (error) {
      if (storageKey) await getFileStorageAdapter().delete(storageKey);
      const failureCode =
        error instanceof AppError && error.code === "FORBIDDEN"
          ? "PERMISSION_REVOKED"
          : "EXPORT_FAILED";
      const failed = await failReportExport(
        workspaceId,
        jobId,
        failureCode,
        (tx) =>
          writeAuditEvent(tx, {
            workspaceId,
            actorUserId: null,
            actorDisplayName: "Report export worker",
            actorType: "system",
            entityType: "report_export",
            entityId: jobId,
            action: "report.export_failed",
            diff: { failureCode },
            requestId: newRequestId(),
          }),
      );
      if (failed.count) {
        await removeReportExportQueueEntry(jobId, workspaceId);
        results.push({ id: jobId, status: "failed" });
      } else {
        throw error;
      }
    }
  }
  return results;
}
