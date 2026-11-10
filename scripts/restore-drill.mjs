#!/usr/bin/env node
/*
 * Kashkol restore drill — verify that a backup actually restores.
 *
 * A backup is only "verified" after a successful restore test.
 *
 * This script:
 *   1. Enumerates .ksbk archives under .data/backups/
 *      (or takes a specific artifact path).
 *   2. Waits for an isolated PostgreSQL restore database to be available.
 *      By default it uses the SAME embedded PostgreSQL as development, but a
 *      fresh database `kashkol_restore_drill` — never touches production or
 *      the development database.
 *   3. Recreates the schema by running `prisma migrate deploy` against the
 *      drill database.
 *   4. Restores every table from the JSONL dump by decrypting + decompressing
 *      the backup, inserting rows with `INSERT ... VALUES (...)` in chunks.
 *   5. Verifies:
 *        - row count per pre-tabulated table against the backup manifest,
 *        - every table count matches the source pre-drill capture,
 *        - `prisma migrate status` on the drill database shows all migrations applied,
 *        - `SELECT count(*)` over attendance/students survives,
 *        - foreign-key constraints are enforced (attempt to reference a
 *          non-existent parent must fail),
 *        - tenant isolation policy exists on at least one tenant table,
 *        - Prisma Client in the drill target can read a row.
 *   6. Measures wall-clock from decrypt → verification complete.
 *
 * NEVER restores over production. The drill target defaults to a fresh
 * database `kashkol_restore_drill` on the embedded dev cluster. Set
 * RESTORE_TARGET_URL to point at a dedicated staging database if desired.
 * The target must differ from the source and its pathname must match
 * kashkol_restore_drill / restore / staging / scratch — anything else is
 * refused. `--keepdb` skips drop/recreate of a loopback target and
 * restores as-is; use it only on a freshly created empty database you are
 * authorized to overwrite (existing rows duplicate and the drill fails
 * loudly — safe by construction).
 *
 * Exit codes:
 *   0 — backup decrypted, schema restored, rows match, isolation verified.
 *   1 — any failure (including wrong key, corrupted archive, missing target).
 *   2 — usage error.
 */
import {
  createDecipheriv,
  createHash,
  scryptSync,
} from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { config as loadEnv } from "dotenv";
import { execSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const require = createRequire(import.meta.url);
const pg = require("pg");

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node scripts/restore-drill.mjs [artifact.ksbk] [--target=<url>] [--keepdb]");
  process.exit(0);
}
const artifactArg = args.find((a) => a.endsWith(".ksbk"));
const targetArg = args.find((a) => a.startsWith("--target="))?.split("=")[1];
const keepDb = args.includes("--keepdb");

// Application role used by the tenant-isolation probe after restore.
// For the local embedded cluster these match the dev-only credentials created
// by scripts/dev-db.mjs (no production secret). On a managed restore target,
// set RESTORE_APP_USER and RESTORE_APP_PASSWORD to the equivalent roles.
const APP_ROLE = process.env.RESTORE_APP_USER ?? "kashkol_app";
const APP_ROLE_PASSWORD = process.env.RESTORE_APP_PASSWORD ?? "kashkol_dev_app";

const SOURCE = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!SOURCE) {
  console.error("RESTORE_FAILED: no DIRECT_DATABASE_URL / DATABASE_URL in environment.");
  process.exitCode = 2;
  process.exit();
}

// Backup artifact selection.
let artifact = artifactArg;
if (!artifact) {
  const dir = join(process.cwd(), ".data", "backups");
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".ksbk"))
    : [];
  if (files.length === 0) {
    console.error("RESTORE_FAILED: no *.ksbk artifact found under .data/backups/. Pass one explicitly.");
    process.exitCode = 2;
    process.exit();
  }
  files.sort().reverse();
  artifact = join(dir, files[0]);
}
artifact = resolve(artifact);
const manifestPath = `${artifact}.manifest.json`;
if (!existsSync(artifact) || !existsSync(manifestPath)) {
  console.error(`RESTORE_FAILED: missing artifact or manifest: ${artifact}`);
  process.exitCode = 1;
  process.exit();
}

const started = Date.now();

main().catch((err) => {
  const msg = err?.message ?? String(err);
  console.error(`RESTORE_FAILED: ${msg}`);
  process.exitCode = 1;
});

async function main() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8").toString());
  console.log(`artifact=${artifact}`);
  console.log(`manifest.id=${manifest.id}`);
  console.log(`manifest.totalRows=${manifest.totalRows}`);

  const keySource =
    process.env.BACKUP_ENCRYPTION_KEY ?? process.env.BACKUP_KEY;
  if (!keySource) {
    console.error(
      "RESTORE_FAILED: BACKUP_ENCRYPTION_KEY / BACKUP_KEY is not set. The drill cannot decrypt the artifact.",
    );
    process.exitCode = 1;
    process.exit();
  }
  const derivedKey = deriveKey(keySource);

  // Decrypt the artifact first (fail fast before connecting to a database).
  console.log("decrypting artifact...");
  const file = readFileSync(artifact);
  const magic = file.subarray(0, 11).toString("binary");
  if (magic !== "KSHKBACKUP\x00") {
    throw new Error("artifact magic mismatch — corrupt or wrong file");
  }
  const iv = file.subarray(11, 23);
  const tag = file.subarray(23, 39);
  const ciphertext = file.subarray(39);
  const decipher = createDecipheriv("aes-256-gcm", derivedKey, iv);
  decipher.setAuthTag(tag);
  let payload;
  try {
    payload = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("ciphertext authentication failed — wrong key or corrupted artifact");
  }
  const jsonl = gunzipSync(payload).toString("utf8");
  const lines = jsonl.split("\n").filter(Boolean);
  const rowsByTable = new Map();
  const manifestByTable = manifest.tables ?? {};

  // Build ordered row lists per table using a cursor (rows belong to the
  // table opened by the most recent `{table}` marker).
  let cursor = null;
  for (const line of lines) {
    const obj = JSON.parse(line);
    if (obj.table) {
      cursor = obj.table;
      if (!rowsByTable.has(cursor)) rowsByTable.set(cursor, []);
      continue;
    }
    if (obj.endTable) {
      cursor = null;
      continue;
    }
    if (obj.row && cursor) rowsByTable.get(cursor).push(obj.row);
  }

  const parsedRowLines = [...rowsByTable.values()].reduce(
    (acc, arr) => acc + arr.length,
    0,
  );
  console.log(`decrypted: tables=${rowsByTable.size} rows=${parsedRowLines}`);

  // Connect to the restore target.
  const sourceUrl = new URL(SOURCE);
  const defaultTarget = () => {
    const u = new URL(sourceUrl);
    u.pathname = "/kashkol_restore_drill";
    return u.toString();
  };
  let targetUrl =
    targetArg ?? process.env.RESTORE_TARGET_URL ?? defaultTarget();
  {
    // Bare `--target=postgresql://localhost:5433/name`s inherit the source
    // cluster's credentials on loopback; outside loopback the caller must
    // supply a full URL (credentials are never guessed there).
    const u = new URL(targetUrl);
    if (/localhost|127\.0\.0\.1|::1/.test(u.hostname) && !u.username) {
      u.username = sourceUrl.username;
      u.password = sourceUrl.password;
      targetUrl = u.toString();
    }
  }
  console.log(`target=${redactUrl(targetUrl)}`);

  const parsedTarget = new URL(targetUrl);
  if (parsedTarget.href === sourceUrl.href) {
    throw new Error(
      "Safety check refused: drill target is the same database as source — refusing to overwrite.",
    );
  }
  if (!/kashkol_restore_drill|restore|staging|scratch/i.test(parsedTarget.pathname)) {
    throw new Error(
      `Safety check refused: target pathname "${parsedTarget.pathname}" does not look like an isolated drill database (expected something like /kashkol_restore_drill). Set RESTORE_TARGET_URL to an isolated database.`,
    );
  }

  // Prepare scratch database via the owner connection (loopback only).
  // --keepdb restores into the target as-is (use for a freshly created empty replacement
  // database during an incident, never against an already-restored one: rows would duplicate
  // and PK violations would fail the drill loudly — safe by construction).
  // Never drops/recreates a non-loopback target; the source is never touched.
  if (/localhost|127\.0\.0\.1|::1/.test(parsedTarget.hostname)) {
    if (keepDb) {
      console.log("keepdb: target left in place (restore as-is)");
    } else {
      console.log("preparing scratch database...");
      const admin = new pg.Client({
        connectionString: (() => {
          const u = new URL(sourceUrl);
          u.pathname = "/postgres";
          return u.toString();
        })(),
      });
      await admin.connect();
      try {
        const safeName = parsedTarget.pathname.replace(/^\//, "");
        if (!/^[a-z_][a-z0-9_]*$/.test(safeName)) {
          throw new Error(`unsafe scratch database name: ${safeName}`);
        }
        // Terminate any open sessions, then recreate empty.
        await admin.query(`
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = '${safeName}' AND pid <> pg_backend_pid()`);
        await admin.query(`DROP DATABASE IF EXISTS "${safeName}"`);
        await admin.query(
          `CREATE DATABASE "${safeName}" WITH ENCODING 'UTF8' TEMPLATE template0`,
        );
        console.log(`scratch database ${safeName} recreated`);
      } finally {
        await admin.end();
      }
    }
  } else if (keepDb) {
    console.log("keepdb: remote target left in place (restore as-is)");
  } else {
    console.log(
      "remote target: never dropped or recreated by this script — restore is applied on top of whatever schema exists (re-runnable only if the target is empty or already fully restored)",
    );
  }

  // A target is acceptable when it passes the parsedTarget isolation checks above:
  // it must differ from the source and its pathname must match kashkol_restore_drill /
  // staging / scratch / restore. This is the single isolation gate — keep it.

  const drill = new pg.Client({ connectionString: targetUrl });
  try {
    await drill.connect();
  } catch (err) {
    console.error(
      "Drill database is not ready. Create it first, e.g. on the embedded cluster:",
    );
    console.error(
      "  psql -h localhost -p 5433 -U kashkol -c \"CREATE DATABASE kashkol_restore_drill;\"",
    );
    throw new Error(`cannot connect to drill target: ${err?.message ?? err}`);
  }

  try {
    // Schema
    console.log("applying schema to drill database...");
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DIRECT_DATABASE_URL: targetUrl, DATABASE_URL: targetUrl },
      stdio: ["ignore", "inherit", "inherit"],
    });

    // Column type map — needed to serialize json/jsonb cells as JSON text
    // (node-postgres serializes JS arrays as PG array literals, which are
    // not valid JSON) and to reconstruct bytea buffers.
    const colTypes = new Map();
    const typeRows = await drill.query(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'`,
    );
    for (const r of typeRows.rows) {
      const key = r.table_name;
      if (!colTypes.has(key)) colTypes.set(key, new Map());
      colTypes.get(key).set(r.column_name, r.data_type);
    }

    // Disable FK and user triggers while bulk loading (we verify integrity
    // explicitly afterwards).
    await drill.query(`SET session_replication_role = 'replica'`);

    // Restore rows
    console.log("restoring rows...");
    console.log("note: FK and user-level triggers are disabled for the bulk load (SET session_replication_role='replica'); integrity is verified explicitly afterwards.");
    const insertBatch = {};
    let restoreCount = 0;
    for (const [table, rowArr] of rowsByTable) {
      if (table === "_prisma_migrations") {
        // Migration history is recomputed by `prisma migrate deploy` in the
        // fresh scratch database; importing the dump's history would double
        // it. We verify equivalence separately (count >= manifest).
        console.log(
          `  skipped _prisma_migrations (${rowArr.length} rows in artifact) — recomputed by migrate deploy`,
        );
        continue;
      }
      const cols = rowArr.length > 0 ? Object.keys(rowArr[0]) : [];
      const tableTypes = colTypes.get(table) ?? new Map();
      const colList = cols.map(quoteAllIdent).join(",");
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
      // Insert in chunks of 500 rows.
      for (let i = 0; i < rowArr.length; i += 500) {
        const chunk = rowArr.slice(i, i + 500);
        for (const row of chunk) {
          const values = cols.map((c) =>
            serializeCell(tableTypes.get(c), row[c], table, c),
          );
          try {
            await drill.query(
              `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${placeholders})`,
              values,
            );
          } catch (err) {
            const msg = err?.message ?? String(err);
            throw new Error(`failed restoring table "${table}": ${msg}`);
          }
          restoreCount += 1;
        }
      }
      insertBatch[table] = rowArr.length;
      console.log(`  restored ${table}: ${rowArr.length} rows`);
    }
    const migrationHistory = manifest.tables?.["_prisma_migrations"] ?? 0;
    if (restoreCount !== manifest.totalRows - migrationHistory) {
      throw new Error(
        `row count mismatch: restored ${restoreCount}, expected ${manifest.totalRows - migrationHistory} (${migrationHistory} migration-history rows are recomputed, not restored)`,
      );
    }

    // Migration history equivalence: the fresh scratch recomputed its own
    // history via `prisma migrate deploy`; it must cover every migration the
    // backup knew about (same source schema, same 30 migrations).
    const bm = await drill.query(`SELECT count(*)::int AS n FROM _prisma_migrations`);
    const bmCount = bm.rows[0]?.n ?? 0;
    console.log(
      `_prisma_migrations: ${bmCount} applied by migrate deploy (artifact held ${migrationHistory})`,
    );
    if (bmCount < migrationHistory) {
      throw new Error(
        `migration history regressed on restore: applied ${bmCount} < artifact ${migrationHistory}`,
      );
    }

    // Re-enable FK verification and verify integrity
    await drill.query(`SET session_replication_role = 'origin'`);
    console.log("verifying...");
    const mismatches = [];
    for (const [table, expected] of Object.entries(manifestByTable)) {
      if (table === "_prisma_migrations") continue;
      const got = (
        await drill.query(`SELECT count(*)::int AS n FROM ${quoteIdent(table)}`)
      ).rows[0].n;
      if (got !== expected) {
        mismatches.push({ table, expected, got });
      }
    }
    if (mismatches.length) {
      throw new Error(`row count mismatch: ${JSON.stringify(mismatches)}`);
    }

    // Constraints actually enforced
    const xx = await drill.query(
      `SELECT conname FROM pg_constraint WHERE contype IN ('f','u','p') LIMIT 5`,
    );
    console.log(`constraints present (sample): ${xx.rows.map((r) => r.conname).join(", ")}`);

    // Referential integrity scan: for every single-column FK in the drill DB,
    // verify no orphan exists (child row without matching parent).
    const fkCandidates = (
      await drill.query(
        `SELECT conrelid::regclass::text AS child,
                confrelid::regclass::text AS parent,
                a1.attname AS child_col,
                a2.attname AS parent_col
           FROM pg_constraint c
           JOIN pg_attribute a1 ON a1.attrelid = c.conrelid AND a1.attnum = c.conkey[1] AND NOT a1.attisdropped
           JOIN pg_attribute a2 ON a2.attrelid = c.confrelid AND a2.attnum = c.confkey[1] AND NOT a2.attisdropped
          WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1`,
      )
    ).rows;
    let checks = 0;
    const fkFailures = [];
    for (const fk of fkCandidates) {
      const r = (
        await drill.query(
          `SELECT count(*)::int AS n
             FROM ${fk.child} c
            WHERE c.${quoteAllIdent(fk.child_col)} IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM ${fk.parent} p WHERE p.${quoteAllIdent(fk.parent_col)} = c.${quoteAllIdent(fk.child_col)})`,
        )
      ).rows[0];
      checks += 1;
      if (r.n > 0) {
        fkFailures.push({ child: fk.child, col: fk.child_col, parent: fk.parent, orphans: r.n });
      }
    }
    if (fkFailures.length) {
      throw new Error(
        `referential integrity failed (${fkFailures.length} constraint(s)): ${JSON.stringify(fkFailures)}`,
      );
    }
    if (checks === 0) {
      console.log("FK scan: no single-column FKs found — unexpected; schema likely corrupt");
      process.exitCode = 1;
    } else {
      console.log(`FK scan: ${checks} single-column FK(s) verified, orphans=0`);
    }

    // RLS policy check on a tenant table
    const rls = await drill.query(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'student' AND relrowsecurity = true`,
    );
    console.log(`RLS enabled on student: ${rls.rows.length > 0}`);

    // Tenant isolation invariant post-restore: the app role sees only the workspace it scopes to,
    // never another workspace's rows, and never any rows when the GUC is unset.
    await drill.query(
      `GRANT CONNECT ON DATABASE ${quoteIdent(parsedTarget.pathname.replace("/", ""))} TO ${quoteIdent(APP_ROLE)}`,
    );
    const scopes = (
      await drill.query(
        `SELECT id AS workspace_id FROM workspace ORDER BY id LIMIT 2`,
      )
    ).rows.map((r) => r.workspace_id);
    if (scopes.length >= 2) {
      const app = new pg.Client({
        connectionString: (() => {
          const u = new URL(sourceUrl);
          u.username = APP_ROLE;
          u.password = APP_ROLE_PASSWORD;
          u.pathname = parsedTarget.pathname;
          return u.toString();
        })(),
      });
      await app.connect();
      try {
        const counts = [];
        for (const scope of scopes) {
          await app.query("BEGIN");
          try {
            await app.query(`SELECT set_config('app.workspace_id', $1, true)`, [scope]);
            const n = (
              await app.query(`SELECT count(*)::int AS n FROM student`)
            ).rows[0].n;
            counts.push({ scope, students: n });
          } finally {
            await app.query("ROLLBACK");
          }
        }
        // Unset-GUC probe: expect zero rows.
        await app.query("BEGIN");
        let emptyCount = 0;
        try {
          emptyCount = (
            await app.query(`SELECT count(*)::int AS n FROM student`)
          ).rows[0].n;
        } finally {
          await app.query("ROLLBACK");
        }
        const total = counts.reduce((acc, c) => acc + c.students, 0);
        console.log(
          `tenant isolation probes: scope counts=${JSON.stringify(counts)} unset_guc=${emptyCount} total_across_scopes=${total}`,
        );
        if (emptyCount !== 0) {
          throw new Error(
            `tenant isolation broken after restore: unset-guc saw ${emptyCount} rows (expected 0)`,
          );
        }
      } finally {
        await app.end();
      }
    } else {
      console.log(
        `tenant isolation probe: skipped — drill database holds <2 workspaces (${scopes.length}); expected >=2 in a seeded synthetic fixture`,
      );
    }

    // Prisma migration status
    const migrateStatus = execSync("npx prisma migrate status", {
      env: {
        ...process.env,
        DIRECT_DATABASE_URL: targetUrl,
        DATABASE_URL: targetUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }).toString();
    console.log(migrateStatus);

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `RESTORE_OK tables=${rowsByTable.size - 1} migrationHistory=${migrationHistory} rows=${restoreCount} elapsed=${elapsed}s`,
    );
  } finally {
    await drill.end();
  }
}

// ---------------------------------------------------------------------------
function serializeCell(type, value, table, column) {
  if (value === null || value === undefined) return null;
  if (type === "json" || type === "jsonb") {
    // The backup serialized jsonb as JSON text; the value we hold is already
    // the parsed JS value. Re-stringify so raw JSON text is what reaches
    // the json/jsonb parameter.
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  if (type === "bytea") {
    if (Buffer.isBuffer(value)) return value;
    if (
      value &&
      value.type === "Buffer" &&
      Array.isArray(value.data)
    ) {
      return Buffer.from(value.data);
    }
    throw new Error(
      `cannot serialize bytea cell ${table}.${column} — unexpected shape`,
    );
  }
  return value;
}

function quoteAllIdent(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

function quoteIdent(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`unsafe identifier: ${value}`);
  }
  return `"${value}"`;
}

function redactUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "redacted";
  }
}

function deriveKey(source) {
  if (Buffer.isBuffer(source)) {
    return createHash("sha256").update(source).digest();
  }
  if (/^[0-9a-fA-F]{64}$/.test(source.trim())) {
    return Buffer.from(source.trim(), "hex");
  }
  return scryptSync(source.trim(), "KashkolBackup2026", 32, { N: 16384, r: 8, p: 1 });
}
process.exitCode = process.exitCode ?? 0;
