import ExcelJS from "exceljs";
import { sanitizeSpreadsheetFormula } from "@/modules/students/schemas";
import type { ReportTable } from "./interface";

/**
 * Report XLSX generation stays behind the adapter boundary with the pinned
 * `exceljs` 4.4.0 (ADR-0016/ADR-0032). No caller imports exceljs directly.
 */
export async function generateReportXlsx(
  table: ReportTable,
  locale: "ar" | "en",
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(locale === "ar" ? "تقرير" : "Report", {
    views: [{ rightToLeft: locale === "ar" }],
  });

  worksheet.addRow(table.headers.map((header) => sanitizeSpreadsheetFormula(header)));
  for (const row of table.rows) {
    worksheet.addRow(
      table.columns.map((key) => {
        const value = row[key];
        if (typeof value === "number") return value;
        return sanitizeSpreadsheetFormula(value === null ? "" : String(value));
      }),
    );
  }

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { horizontal: locale === "ar" ? "right" : "left" };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
