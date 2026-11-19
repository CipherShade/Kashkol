import type { ReportExportQuery } from "./schemas";

export type ReportExportFormat = ReportExportQuery["format"];

export const REPORT_EXPORT_CONTENT_TYPES: Record<ReportExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

/** The format is also the file extension; there are no aliases. */
export function reportExportExtension(format: ReportExportFormat): string {
  return format;
}

export function reportExportContentType(format: ReportExportFormat): string {
  return REPORT_EXPORT_CONTENT_TYPES[format];
}
