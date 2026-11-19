/** A cell value that has already been serialized for output. */
export type ReportCell = string | number | null;

/** The format-independent result of loading and serializing a report. */
export interface ReportTable {
  columns: readonly string[];
  headers: string[];
  rows: Array<Record<string, ReportCell>>;
}

/**
 * Renders report HTML to PDF bytes. Implementations never fetch network
 * resources and never expose renderer output or errors verbatim (ADR-0032).
 */
export interface PdfRendererAdapter {
  readonly driver: "none" | "chromium" | "fake";
  readonly isConfigured: boolean;
  render(html: string): Promise<Buffer>;
}
