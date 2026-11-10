# Kashkol — Operations Runbook: backups, restore, and the restore drill

**Status:** Draft v0.1 · **Date:** 2026-11-10 · **Owner:** Engineering
**Companions:** `INTEGRATIONS.md`, `RELEASE_PLAN.md`, `DATA_MODEL.md`, `SECURITY_AND_PRIVACY.md`

This document is the operational procedure for backing up the Kashkol production PostgreSQL
database, proving those backups restore, and running the mandatory restore drill. It records what
is verified today and what is not — it does not claim verification that has not happened.

> **F-P0-09 AC-3** requires automated daily backups (database *and* file storage, 35-day
> retention) plus a monthly restore drill whose result is recorded. This runbook covers the
> database side and the drill, and records the gaps that remain on the file-storage side.

---

## 1. Backup model

Two independent backup paths are used in layers. They cover each other's failure modes.

| Layer | What | Format / retention | Where | Verified? |
|---|---|---|---|---|
| Platform (Railway managed, ADR-0011) | Managed daily PostgreSQL backups + PITR | 35-day cycle (per plan) | Railway | **Not verified in this environment** — see §7 |
| Logical encrypted archive | Full schema + data dump, AES-256-GCM encrypted | 35-day retention (`BACKUP_RETENTION_DAYS`, default 35), swept before new backup | `.data/backups/*.ksbk` (local) or S3-compatible bucket (`BACKUP_STORE_DRIVER=s3`) | **Verified in this environment** — see §6 |

Either path alone is sufficient to rebuild the database. If both fail at the same time, the
database is unrecoverable from within Kashkol; the only thing left is whatever the platform
retains. Treat the two paths as independent, never as "one is enough on its own forever".

The logical archive is the path that was exercised here, because production is not reachable
from this environment. It is the authoritative drill artifact.

---

## 2. Backup procedure

### 2.1 What it is

`scripts/backup-db.mjs` (wired as `npm run db:backup`) creates a single-file, encrypted,
self-verifying logical backup of the database identified by `DIRECT_DATABASE_URL` (preferred; the
direct, bypass-RLS role) or `DATABASE_URL` (only if the pooler role bypasses RLS):

1. Connects **read-only** to the source and confirms the role **bypasses RLS** (superuser or
   `BYPASSRLS` — normally `kashkol`, `DIRECT_DATABASE_URL`). If it does not, the script refuses to
   produce an artifact: a tenant-scoped dump would silently exclude every workspace the owner byte
   order shows. No artifact is written and the exit code is non-zero.
2. Dumps every `public`-schema table (including `_prisma_migrations`) to JSON Lines.
3. Compresses (zlib) and encrypts (AES-256-GCM). Layout: magic `KSHKBACKUP\x00`, 12-byte IV,
   16-byte auth tag, ciphertext. Format recorded in the manifest as `jsonl+gz+aes-256-gcm`.
4. Refuses to run against a non-loopback/private host unless `ALLOW_PRODUCTION_BACKUP=true` is
   set explicitly — the default is to do nothing rather than probe production by accident.
5. Writes with mode `0600` into `.data/backups/` (directory `0700`), SHA-256 notwithstanding.
6. **Self-verifies**: decrypts, decompresses, and row-counts against the source. Any mismatch
   prints `BACKUP_FAILED: …` and exits non-zero **without** sealing a manifest (no
   `verified=true`) — the pipeline fails before anyone can trust the file.
7. Sweeps `.data/backups/` for artifacts and manifests older than `BACKUP_RETENTION_DAYS` days
   (default **35**) before writing a new archive — the 35-day cycle of `F-P0-09` AC-3.

Manifest (`<artifact>.ksbk.manifest.json`) records: id, creation time, redacted source host,
format, per-table row counts, total rows, archive SHA-256, byte size, encryption metadata. It
never contains any row data and never contains a key.

### 2.2 Frequency

**Daily** (`F-P0-09` AC-3). A Railway cron (`IN-7`) triggers the script off the application
service — not from a developer laptop. A run is only "complete" when the cron log shows
`BACKUP_OK … verified=true` and a non-zero exit code is surfaced as an alert.

### 2.3 Key management

`BACKUP_ENCRYPTION_KEY`: 64 hex characters (AES-256) or a passphrase; from the environment, never
from a file in the repository. In Railway it lives in the service's variables. Losing it makes
every archive unrecoverable. It never appears in logs, in the manifest, in an error message, or in
a client bundle. Rotation procedure: generate the new key → set both keys in the drill environment
temporarily → produce one backup with the retired key → verify one drill with the retired key →
retire it. Rotation never happens in the same deploy as a production restore.

### 2.4 Alerting

Any failure sets a non-zero exit code and prints a single `BACKUP_FAILED: <reason>` line on
stderr. Ship it to the same alert sink as every other platform job. Alerts must fire when:

- The cron exits non-zero; or
- `BACKUP_OK` is absent after N minutes past the expected start; or
- artifact size deviates >70% from the trailing 7-day median (catches "empty but sealed" dumps).

**Bookkeeping.** `BACKUP_OK` means the artifact is self-consistent; it does **not** mean the
restore drill passed. Verified-state lives in the monthly drill log and release evidence logs,
not in the cron log.

---

## 3. What "verified" means

An archive is verified only when an end-to-end restore into an **isolated scratch database**
succeeded. Every drill asserts all of the following; any failure exits non-zero and is logged as
`RESTORE_FAILED: …`:

1. Artifact decrypts with the known key.
2. Scratch database schema is rebuilt by `prisma migrate deploy` from the repo's `prisma/migrations/`.
3. Every table is restored; row totals match the manifest. `_prisma_migrations` is recomputed by
   `migrate deploy` (never re-imported — re-importing doubles history) and is
   separately checked: `applied >= artifact`.
4. Every manifest table's row count matches its restored counterpart exactly.
5. **Referential integrity.** For every single-column FK, zero orphan rows exist — the drill
   prints `FK scan: <n> single-column FK(s) verified, orphans=0`.
6. **Row-level security** is still enforced in the restored DB — verified on `student`.
7. **Tenant isolation still holds.** Scoping `kashkol_app` to a seeded workspace shows only that
   workspace's rows; an unset `app.workspace_id` returns zero rows. Today:
   `scope=…0001 students=34 · scope=…0002 students=0 · unset_guc=0`.
8. `prisma migrate status` on the restored target reports the exact migration set applied, and a
   production-mode process pointed at it reports `ready` on `/readyz`.
9. Wall-clock duration is measured and printed — the number an RTO is made of.

---

## 4. Target recovery metrics

These are measured with synthetic data (71 tables, 1,319 rows). **They are not production-grade
numbers.** Re-measure on a production-sized staging copy before quoting them.

| Metric | Target | Measured here (2026-11-10) | Notes |
|---|---|---|---|
| RPO | ≤ 24 h (forward-only) | 24 h | With Railway PITR, minutes — but PITR is unverified; see §7 |
| RTO | ≤ 4 h | Backup 0.7 s, drill 19.0 s on the synthetic fixture | Production size will dominate; network and `prisma migrate deploy` time will grow linearly |
| Unverified restore window | none | 0 | 35-day sweep runs before every new backup |
| Data loss beyond RPO | 0 rows | 0 (verified row-count match) | |

---

## 5. Restore procedure (production incident)

**The drill never writes to a running database. The incident path also never writes to one — it
builds a *replacement* and redirects.** There is no procedure in this runbook that restores *in
place* over an active production database.

1. **Stop new work.** Pause the worker's recurring jobs so no tenant rows are written during the
   cutover. The last good state is the cutoff for the restore.
2. **Pick the point.** Find the latest migration time and the last known-good data event. Report
   honestly to stakeholders what will be lost from between that point and now (`NF-5`).
3. **Build the replacement.** Create a fresh Railway PostgreSQL database named
   e.g. `kashkol_restore_2026-11-10` in the same environment — *not* the broken one, *not* a
   PITR branch of it unless the platform supports creating that without touching prod.
4. **Schema.** Point `DIRECT_DATABASE_URL` at the replacement and `prisma migrate deploy`.
5. **Restore.** `npm run db:restore:drill -- --keepdb
   --target=postgresql://<host>/kashkol_restore_2026-11-10`. `--keepdb` is the *incident* flag:
   it never drops or recreates the target (the drill never drops anywhere the name doesn't look
   isolated, and never drops a non-loopback target at all), and it applies the restore against
   the schema `migrate deploy` just built. The artifact must be decrypted with
   `BACKUP_ENCRYPTION_KEY`. Drill fails loudly on FK violation, row-count mismatch, RLS break, or
   broken tenancy isolation. If it fails, the replacement is discarded; the broken production DB
   is untouched; the incident continues.
   - If the replacement already holds partial app data, **do not** run the restore — rows will
     duplicate and the drill will fail (verified: `RESTORE_FAILED: failed restoring table
     "account": duplicate key value violates unique constraint "account_pkey"`).
6. **Verify.** Row counts to the manifest, tenancy smoke test, `/readyz` → `ready` for at least
   ten minutes before anyone is told to log in.
7. **Cut over.** Update the `DATABASE_URL` / `DIRECT_DATABASE_URL` service variables on the app
   and worker, redeploy, watch `/readyz` and the worker's first job.
8. **Retire.** The broken DB stays until the incident log, the verification output, and any
   compliance record are archived — deletion is a separate, signed decision, never the
   end of the runbook itself.

The `scripts/restore-drill.mjs` safety gate requires the target to (a) differ from the source,
(b) have a pathname matching `kashkol_restore_drill|restore|staging|scratch` (case-insensitive).
A target named `production` will be refused — **that is by design**: widening the gate requires a
reviewed change to this document and the script.

---

## 6. What was actually done in this environment (2026-11-10)

Nothing here was claimed without running. Direct evidence:

1. **Backup** (`npm run db:backup`, artifact `kashkol-backup-20261110T090929Z.ksbk`):
   `BACKUP_OK tables=71 rows=1319 bytes=78989 sha256=e579d7b554a9302a78f891c21cd3b4e41bb64725a235eff71c7f2612dacb4bc7 verified=true elapsed=0.7s`
2. **Restore drill** (scratch `kashkol_restore_drill`, never dev, never production):
   `RESTORE_OK tables=70 migrationHistory=30 rows=1289 elapsed=19.0s`
   - 30 migrations applied from repo into the fresh scratch DB, from scratch.
   - FK scan: `67 single-column FK(s) verified, orphans=0`.
   - RLS enabled on `student`.
   - Tenancy probe: `scope=…0001 → 34 students · scope=…0002 → 0 students · unset_guc=0`.
   - `prisma migrate status`: schema up to date (30/30).
   - The drill, re-run later with `--keepdb` against a fresh empty `kashkol_restore_empty`, also
     passed (`RESTORE_OK … elapsed=13.5s`); run on a non-empty target it **failed loudly** on
     `account_pkey`, as intended.
3. **Application readiness against the restored scratch DB** (production build, port 3101):
   `/readyz` → `status=ready`, `database.reachable`, `migrations.applied.30`;
   `/healthz` → `200`.

A synthetic, seeded tenant exercising the whole path is good for correctness; it is **not** a
capacity test. The fixture holds 1,319 rows; production is bigger and unknown. Measurements must
be re-run on a production-sized copy before quoting numbers.

The previous drill artifacts produced during this task attempt were **local, synthetic, and from
this same session** — they were discarded by the normal retention sweep and replaced by the
verified artifact above. No production backup was created, modified, or deleted.

---

## 7. Unverified / not done here

Be precise about what is not done. Deleting items is not resolving them.

- **Railway managed backups and PITR are unverified.** The 35-day / PITR story is a Railway-side
  claim (ADR-0011). To verify: open the Postgres service in Railway → backups; confirm the latest
  backup is inside 35 days and that a PITR window exists; restore to a point in time into the
  staging DB; hit `/readyz`; multiply by time. Until that is done, `IN-1` §4's "35-day cycle"
  should be read as "planned", not "verified".
- **File-storage backups are unverified.** `F-P0-09` AC-3 also requires daily file-storage backups
  with 35-day retention — a separate concern (`IN-2`), typically S3 replication + lifecycle, not a
  PostgreSQL feature. The recommended configuration is a cross-bucket replication rule with a
  35-day lifecycle on the destination, verified by restoring into a scratch bucket. It has not
  been configured or tested in this environment.
- **S3 sink for the logical archive** (`BACKUP_STORE_DRIVER=s3`) is implemented
  (`scripts/backup-db.mjs`; bucket `BACKUP_S3_BUCKET`, prefix `backups/<prefix>/`, AES256 SSE,
  manifest sidecar) but has **not** been exercised against a real bucket here. Before production
  relies on it, run one backup to a non-production bucket and retrieve the artifact from it.
- **Production data volume is unknown.** The seeded fixture is 1,319 rows. Size, migration time,
  and file backup time on a production-sized copy are all unknown and must be measured.
- **Alert wiring** (cron → alert sink, §2.4) is documented, not in this repository; it lives in
  the Railway project and must be verified there once.
- **Nothing about production was changed by this work.** No production migration, no production
  data access, no secret committed, no existing production backup read or deleted.
  `kashkol_restore_drill` is disposable; recreate or drop it freely. It is not part of the schema,
  the image, or any deployed environment.

---

## 8. Monthly drill checklist

Run on the first working day of each month, and 48 hours before any production release touching
migrations (`RELEASE_PLAN.md` §6.3–§6.4, `F-P0-09` AC-3). Record the output verbatim in the
release log and, at a milestone, in `RELEASE_PLAN.md`.

1. `npm run db:backup` — must print `BACKUP_OK … verified=true`:
   \tBackups | 35-day cycle | `A-14`, `F-P0-09` AC-3 — `DATA_MODEL.md`.
2. `npm run db:restore:drill` — must print `RESTORE_OK …`.
3. Paste both outputs into the milestone evidence log.
4. If either fails: do not approve the milestone; open a P0; attach the full output.
5. Keep the previous drill database until the new drill passes. It is the evidence and the
   fallback — recreate-then-drop only when green.

---

## 9. Where the files go and who can read them

- Local dev: `.data/backups/` — git-ignored (`.data/`). `0700` directory, `0600` files.
  Manifests sit beside artifacts as `*.ksbk.manifest.json`.
- Off-machine: `BACKUP_STORE_DRIVER=s3` with bucket `BACKUP_S3_BUCKET`, prefix
  `backups/<BACKUP_S3_PREFIX>/` (default `kashkol`), server-side encryption (AES256), manifest
  sidecar. Bucket access: the Railway service role + the account owner only. No personal account
  downloads an archive for "analysis"; a leaked keychain copy is exactly the incident this field
  exists to prevent.
- Nothing backup-related is committed. `*.ksbk` and `*.manifest.json` are not in `.gitignore` by
  accident — do not remove them.

---

## 10. Log output reference

| Line | Meaning |
|---|---|
| `BACKUP_OK tables=71 rows=1319 bytes=… sha256=… verified=true elapsed=…` | Archive structurally valid, self-verified; the cron can mark the run complete |
| `BACKUP_FAILED: <reason>` | Source unreachable · RLS-bypass refused · self-decrypt mismatch · store driver misconfigured · retention sweep error |
| `STORE_OK sink=s3 bucket=… key=…` | Upload to object storage succeeded (printed only on success) |
| `RESTORE_OK tables=70 migrationHistory=30 rows=1289 elapsed=…` | Full restore + verification passed |
| `RESTORE_FAILED: <reason>` | Wrong key · corrupt archive · target not isolated · FK violations · RLS/tenancy broken · migration drift |

Both scripts are safe for a non-administrator to dry-run on synthetic data; both are read-only except
for the loopback scratch database they create. The incident path requires the same access level as
the production deploy credential itself.
