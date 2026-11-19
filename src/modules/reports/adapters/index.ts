import { AppError } from "@/lib/http/errors";
import { getServerEnv } from "@/lib/config/env";
import { ChromiumPdfRendererAdapter } from "./chromium";
import { FakePdfRendererAdapter } from "./fake";
import type { PdfRendererAdapter } from "./interface";

export type { PdfRendererAdapter, ReportCell, ReportTable } from "./interface";
export { generateReportXlsx } from "./spreadsheet";
export { renderReportPdfHtml } from "./pdf-html";

/** Fail closed: never emit a file that only looks like a PDF (NF-1). */
export class UnconfiguredPdfRendererAdapter implements PdfRendererAdapter {
  readonly driver = "none" as const;
  readonly isConfigured = false;

  async render(): Promise<Buffer> {
    throw new AppError("CONFLICT", { messageKey: "errors.pdfRendererNotConfigured" });
  }
}

let overrideAdapterForTests: PdfRendererAdapter | null = null;

export function setPdfRendererAdapterForTests(adapter: PdfRendererAdapter | null): void {
  overrideAdapterForTests = adapter;
}

export function getPdfRendererAdapter(): PdfRendererAdapter {
  if (overrideAdapterForTests) return overrideAdapterForTests;
  const env = getServerEnv();
  if (env.PDF_RENDERER_DRIVER === "fake") return new FakePdfRendererAdapter();
  if (env.PDF_RENDERER_DRIVER === "chromium" && env.PDF_CHROMIUM_EXECUTABLE_PATH) {
    return new ChromiumPdfRendererAdapter(
      env.PDF_CHROMIUM_EXECUTABLE_PATH,
      env.PDF_RENDER_TIMEOUT_MS,
    );
  }
  return new UnconfiguredPdfRendererAdapter();
}
