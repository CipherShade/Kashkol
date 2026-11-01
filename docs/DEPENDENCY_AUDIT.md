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

## Next review trigger

- Before M2 public beta.
- After every dependency change.
