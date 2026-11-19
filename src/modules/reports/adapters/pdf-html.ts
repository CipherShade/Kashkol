import type { ReportTable } from "./interface";

const TITLES: Record<"ar" | "en", Record<string, string>> = {
  en: {
    attendance: "Attendance report",
    enrollment: "Enrollment report",
    academics: "Academic results report",
    homework: "Homework completion report",
    payments: "Payment ledger report",
    sessionRevenue: "Session revenue report",
  },
  ar: {
    attendance: "تقرير الحضور",
    enrollment: "تقرير التسجيل",
    academics: "تقرير النتائج الأكاديمية",
    homework: "تقرير إنجاز الواجبات",
    payments: "تقرير سجل المدفوعات",
    sessionRevenue: "تقرير إيرادات الحصص",
  },
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Builds a self-contained HTML document from already-authorized report rows.
 * It loads no external resources, so the renderer never makes a network call.
 */
export function renderReportPdfHtml(
  table: ReportTable,
  input: { locale: "ar" | "en"; type: string; from?: string; to?: string },
): string {
  const lang = input.locale === "ar" ? "ar" : "en";
  const dir = lang === "ar" ? "rtl" : "ltr";
  const title = escapeHtml(TITLES[lang][input.type] ?? input.type);
  const range = input.from || input.to ? `${input.from ?? "…"} — ${input.to ?? "…"}` : "";
  const head = table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body = table.rows
    .map(
      (row) =>
        `<tr>${table.columns
          .map((key) => `<td>${escapeHtml(row[key] === null || row[key] === undefined ? "—" : row[key])}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: "Noto Naskh Arabic", "Noto Sans Arabic", Arial, sans-serif; margin: 18mm; color: #111827; }
  h1 { font-size: 16pt; margin-block-end: 4mm; }
  p { font-size: 9pt; color: #4b5563; margin-block-end: 6mm; }
  table { border-collapse: collapse; width: 100%; font-size: 8pt; }
  th, td { border: 1px solid #d1d5db; padding: 1.5mm; text-align: start; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #f3f4f6; }
</style>
</head>
<body>
<h1>${title}</h1>
${range ? `<p>${escapeHtml(range)}</p>` : ""}
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body>
</html>`;
}
