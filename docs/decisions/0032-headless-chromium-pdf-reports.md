# ADR-0032: PDF report export through a headless-Chromium adapter

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** Engineering
- **Scope:** M2
- **Serves:** `F-P2-10` (report exports), `NF-1` (no fabricated capability), `NF-11` (vendor failure is
  visible), `NF-13` (no silent data loss), `I-8` (swappable providers)

## Context

Asynchronous report exports currently produce CSV only. ADR-0016 pins `exceljs` `4.4.0` and requires
`.xlsx` for reports; the broader product requirement also asks for `.pdf`. Teachers work in Arabic and
English, so a PDF must render right-to-left Arabic text from the same filtered rows as the on-screen
report.

Kashkol runs in a container on Railway (ADR-0011). A browser binary cannot be assumed to exist, and a
renderer must not reach the network while producing a file. Tests must stay deterministic and must not
launch a real browser. When no renderer is configured, the system must say so plainly instead of
producing a file that merely looks like a PDF (`NF-1`).

## Decision

Adopt **`puppeteer-core` `24.31.0`** as an exact pin, used only behind
`src/modules/reports/adapters/`:

1. **One interface.** `PdfRendererAdapter` exposes `render(html): Promise<Buffer>`, `driver`, and
   `isConfigured`. Neither the reports service nor any route or UI component imports
   `puppeteer-core` directly.
2. **Three drivers.** `PDF_RENDERER_DRIVER=none` (default) returns a fail-closed adapter that throws
   a translated `CONFLICT` error with `errors.pdfRendererNotConfigured`. `chromium` launches the
   executable named by `PDF_CHROMIUM_EXECUTABLE_PATH`; `fake` is a deterministic test double that is
   rejected outside `APP_ENV=local` by configuration validation.
3. **Bounded and sanitised.** Each render attempt has an explicit timeout
   (`PDF_RENDER_TIMEOUT_MS`, default 30 s) and at most two attempts. Failures are reported as a
   single sanitised `AppError` with `errors.pdfRendererFailed`; browser stderr, executable paths,
   HTML, and report data never enter a log or an error response.
4. **Local HTML only.** The renderer receives an HTML string built from already-authorised report
   rows with every value HTML-escaped. It loads no external styles, fonts, or scripts. Arabic glyphs
   require an Arabic-capable font in the deployment image; this is a documented deployment
   requirement, not something the application fakes.
5. **No schema change.** The requested `format` is stored in the existing `ReportExport.query` JSONB
   column. Filename extension, storage-key extension, and signed-download content type are derived
   from it. The storage-key validator permits `reports/<uuid>.(csv|xlsx|pdf)`.
6. **XLSX stays with ADR-0016.** Report `.xlsx` generation uses the pinned `exceljs` `4.4.0` behind
   the reports adapter boundary, with formula-injection sanitisation and an RTL sheet view for Arabic.

## Consequences

### Positive

- CSV and XLSX need no browser; a deployment that cannot host Chromium still serves both truthfully.
- An unconfigured PDF driver fails at render time with a clear message rather than emitting a
  counterfeit PDF.
- The driver is swapped in one factory binding, so tests use the deterministic fake and production
  uses a real browser.

### Negative

- A PDF-capable deployment must provide a Chromium/Chrome executable and an Arabic-capable font in
  the container image, plus the CPU and memory for a short-lived browser process.
- `puppeteer-core` adds transitive packages; the pinned install reports known advisories in the
  dependency tree and must be reviewed independently of this decision.
- Browser rendering is slower than CSV/XLSX generation and is capped by the 5,000-row export limit.

## Alternatives Considered

- **Full `puppeteer`:** Rejected because it downloads a large browser binary during install and the
  Railway image must control its own executable and font set.
- **`pdfkit` or hand-built PDF bytes:** Rejected because correct Arabic shaping and RTL table layout
  require a text engine that these approaches do not provide.
- **Client-side `jspdf`:** Rejected because it moves report data into the browser bundle, cannot be
  verified by the worker, and would make the export depend on the teacher's device.

## Revisit When

A maintained server-side renderer with native Arabic shaping, a small container footprint, and no
separate browser process meets the rendering and budget requirements; or the export requirement
drops PDF.
