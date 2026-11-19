# Dependency Audit — 2026-11-01

**Status:** 24 moderate advisories found; zero critical/high at time of audit.  
**Policy:** No major-version automatic upgrade performed without compatibility verification (`ARCHITECTURE.md` §3.1).  

## Affected packages (from `npm audit --audit-level=moderate`)

| Package / advisory | Severity | Source / path | Remediation required |
|---|---|---|---|
| `minimatch` (`GHSA-g3hv-75wg-m249`) | Moderate | `eslint`, `typescript-eslint`, `glob`, `archiver` (via `exceljs`), `rimraf`, `readdir-glob` | Upgrade to `>=11.0.1` after compatibility check with `eslint@9.39.5` |
| `uuid` (`GHSA-w5hq-g745-h8pq`) | Moderate | `exceljs` (via `archiver`), `zip-stream` | Upgrade to `>=11.1.1` after `exceljs` compatibility check |
| `glob` / `archiver-utils` (transitive via `exceljs`) | Moderate | `exceljs` | Depends on `minimatch` + `uuid` fixes; verify spreadsheet generation unchanged |

## Compatibility notes

- `npm audit fix --force` proposes `eslint@4.0.0` — **breaking change**; rejected.
- `npm audit fix --force` proposes `exceljs@3.4.0` — potential breaking change; rejected.
- Updates deferred until `tests/unit/dependency-audit-check.test.ts` confirms functionality after update.

## Reproduction

```bash
node scripts/audit-deps.mjs
```

## Addendum — 2026-11-18 (PDF renderer)

Installing the exact pin `puppeteer-core@24.31.0` (`ADR-0032`) reported **30 advisories (8 moderate,
22 high)** across the full dependency tree, an increase from the 2026-11-01 audit. No automatic
upgrade was run: `npm audit fix --force` proposes breaking changes and is explicitly out of scope.
The new advisories must be reviewed before M2 public beta, alongside the existing `minimatch`, `uuid`,
and `glob` chain. The renderer is behind a fail-closed adapter (`PDF_RENDERER_DRIVER=none` by default),
so an unconfigured deployment exposes no PDF rendering path.

## Next review trigger

- Before M2 public beta.
- After every dependency change.
