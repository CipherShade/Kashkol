import { describe, expect, it } from "vitest";
import { assertSafeStorageKey } from "@/modules/files/adapters/key";
import { FakePdfRendererAdapter } from "@/modules/reports/adapters/fake";
import { renderReportPdfHtml } from "@/modules/reports/adapters/pdf-html";
import { reportExportContentType, reportExportExtension } from "@/modules/reports/formats";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const exportId = "33333333-3333-4333-8333-333333333333";

describe("report export formats", () => {
  it("maps each format to its extension and download content type", () => {
    expect(reportExportExtension("csv")).toBe("csv");
    expect(reportExportExtension("xlsx")).toBe("xlsx");
    expect(reportExportExtension("pdf")).toBe("pdf");
    expect(reportExportContentType("csv")).toBe("text/csv; charset=utf-8");
    expect(reportExportContentType("xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(reportExportContentType("pdf")).toBe("application/pdf");
  });

  it("allows only csv, xlsx, and pdf report storage keys", () => {
    for (const extension of ["csv", "xlsx", "pdf"]) {
      expect(() =>
        assertSafeStorageKey(`ws/${workspaceId}/reports/${exportId}.${extension}`),
      ).not.toThrow();
    }
    expect(() => assertSafeStorageKey(`ws/${workspaceId}/reports/${exportId}.html`)).toThrow();
    expect(() =>
      assertSafeStorageKey(`ws/${workspaceId}/reports/${exportId}.pdf/../../secret.png`),
    ).toThrow();
  });

  it("builds a self-contained RTL document with escaped values", () => {
    const html = renderReportPdfHtml(
      {
        columns: ["student"],
        headers: ["الطالب"],
        rows: [{ student: "<b>أحمد</b>" }],
      },
      { locale: "ar", type: "attendance", from: "2026-01-01", to: "2026-01-31" },
    );
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain("&lt;b&gt;أحمد&lt;/b&gt;");
    expect(html).not.toContain("<b>أحمد</b>");
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  });

  it("uses LTR for English and labels the fake renderer as a test double", async () => {
    const html = renderReportPdfHtml(
      { columns: ["student"], headers: ["Student"], rows: [] },
      { locale: "en", type: "enrollment" },
    );
    expect(html).toContain('<html lang="en" dir="ltr">');

    const fake = new FakePdfRendererAdapter();
    expect(fake.driver).toBe("fake");
    expect(fake.isConfigured).toBe(true);
    expect((await fake.render(html)).toString()).toContain("kashkol-fake-renderer");
  });
});
