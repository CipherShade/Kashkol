import type { PdfRendererAdapter } from "./interface";

/**
 * Deterministic test double. `PDF_RENDERER_DRIVER=fake` is rejected outside
 * `APP_ENV=local` by configuration validation (ADR-0032); it returns a marked
 * buffer rather than a document so no test can mistake it for a real PDF.
 */
export class FakePdfRendererAdapter implements PdfRendererAdapter {
  readonly driver = "fake" as const;
  readonly isConfigured = true;

  async render(html: string): Promise<Buffer> {
    return Buffer.from(`%PDF-1.4\n%kashkol-fake-renderer ${html.length}\n%%EOF\n`);
  }
}
