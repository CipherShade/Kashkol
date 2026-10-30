# ADR-0016: Spreadsheet processing with exceljs

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Engineering
- **Scope:** M1–M3
- **Serves:** `F-P1-03` (student import), `F-P2-10` (export), `NF-13` (no silent data loss)

## Context

Kashkol requires importing students from spreadsheets (`.csv` and `.xlsx`) with column auto-detection,
row-level validation, encoding preservation (UTF-8, BOM, and Arabic text), and previewing changes before commit (`F-P1-03`).
It also requires exporting reports and roster data (`.csv` and `.xlsx`) with strict spreadsheet formula injection prevention (`=`, `+`, `-`, `@`, `\t`, `\r`).

Spreadsheet libraries vary significantly in maintenance, security track records, and TypeScript support.
`xlsx` (SheetJS Community Edition) on npm has known CVEs, unpatched security issues, and has ceased regular npm distribution.
A modern, well-maintained, pure-JavaScript library is required that works reliably in Node.js server environments and supports streaming and buffer-based XLSX reading/writing.

## Decision

Adopt **`exceljs` `4.4.0`** as the pinned spreadsheet processing library, encapsulated behind adapter interfaces in `src/modules/students/adapters/spreadsheet.ts`.

1. **Adapter Boundary:**
   - No route or UI component imports `exceljs` directly.
   - All spreadsheet parsing and generating goes through `SpreadsheetAdapter`.
2. **Security & Sanitization:**
   - Formula Injection Protection: In exports, every cell whose text begins with `=`, `+`, `-`, `@`, `\t`, or `\r` is escaped by prefixing `'` to prevent DDE / command execution in spreadsheet software.
   - Max Row Limit: Imports strictly enforce the 5,000-row limit (`F-P1-03` AC-5) and reject oversized files immediately.
3. **Encoding & Arabic Fidelity:**
   - Handles UTF-8 with and without BOM. Arabic character forms and diacritics are preserved byte-exact without encoding corruption.
4. **Validation Preview:**
   - The adapter parses both CSV and XLSX into structured row previews so the server can report row-level errors, duplicate warnings, and group mappings before any mutation commits.

## Consequences

### Positive

- `exceljs` is actively maintained and supports XLSX reading, writing, cell formatting, and stream processing without external binary dependencies.
- CSV and XLSX share a single unified reader/writer interface.
- Complete protection against formula injection attacks in exported files.

### Negative

- `exceljs` has a moderate package footprint (~97 transitive packages).

## Alternatives Considered

- **`xlsx` (SheetJS):** Rejected due to unfixed vulnerabilities in public npm releases, license ambiguities, and commercial distribution shifts.
- **Custom CSV-only parser:** Rejected because `.xlsx` is a required format for Egyptian teachers exporting from school systems.

## Revisit When

- A high-performance Rust/Wasm-based XLSX parser becomes the standard across the Node.js ecosystem with superior memory characteristics.
