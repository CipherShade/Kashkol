import { AppError } from "@/lib/http/errors";
import type { PdfRendererAdapter } from "./interface";

const MAX_ATTEMPTS = 2;

/**
 * Renders HTML with a caller-supplied Chromium executable. No browser binary
 * is downloaded by this package; neither the executable path nor browser
 * diagnostics are ever included in a returned error (ADR-0032).
 */
export class ChromiumPdfRendererAdapter implements PdfRendererAdapter {
  readonly driver = "chromium" as const;
  readonly isConfigured = true;

  constructor(
    private readonly executablePath: string,
    private readonly timeoutMs: number,
  ) {}

  async render(html: string): Promise<Buffer> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let browser: import("puppeteer-core").Browser | undefined;
      try {
        const puppeteer = await import("puppeteer-core");
        browser = await puppeteer.default.launch({
          executablePath: this.executablePath,
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
          timeout: this.timeoutMs,
          protocolTimeout: this.timeoutMs,
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "load", timeout: this.timeoutMs });
        const bytes = await page.pdf({
          format: "A4",
          printBackground: true,
          timeout: this.timeoutMs,
        });
        return Buffer.from(bytes);
      } catch {
        if (attempt === MAX_ATTEMPTS) {
          throw new AppError("CONFLICT", { messageKey: "errors.pdfRendererFailed" });
        }
      } finally {
        if (browser) await browser.close().catch(() => undefined);
      }
    }
    throw new AppError("CONFLICT", { messageKey: "errors.pdfRendererFailed" });
  }
}
