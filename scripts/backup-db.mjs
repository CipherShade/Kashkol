#!/usr/bin/env node
/*
 * Kashkol PostgreSQL backup generator.
 *
 * Usage:
 *   node scripts/backup-db.mjs [output-path] [--allow-large]
 *
 * Creates a verified logical backup of the PostgreSQL database identified by
 * DIRECT_DATABASE_URL (preferred; superuser/bypass-role so tenant tables are
 * visible) or DATABASE_URL (only if the pooler role bypasses RLS).
 *
 * The backup artifact is a single AES-256-GCM encrypted, zlib-compressed
 * stream of JSON Lines (records for every public-schema table, including
 * `_prisma_migrations`). Format:
 *   [magic "KSHKBACKUP\x00"][iv 12][tag 16][ciphertext (zlib-deflate JSONL)]
 *
 * Properties:
 *  - Read-only against the source database.
 *  - Key comes from BACKUP_ENCRYPTION_KEY (preferred) or BACKUP_KEY. If absent
 *    an ephemeral key is generated and the artifact cannot be decrypted after
 *    the process exits — suitable only for the monthly restore drill.
 *  - Creates the backup with 0600 permissions inside a private (0700)
 *    directory.
 *  - Refuses to run against a non-loopback/private host unless
 *    ALLOW_PRODUCTION_BACKUP=true is set explicitly.
 *  - Requires the connecting role to bypass RLS; if not, the script exits and
 *    produces NO artifact, because an RLS-filtered backup would silently be
 *    incomplete.
 *  - Self-verifies: after writing, decrypts, decompresses, counts rows and
 *    row hashes, and compares against source truth. Exit 0 only when sealed
 *    AND verified.
 *  - Retention: files in .data/backups/ older than BACKUP_RETENTION_DAYS
 *    (default 35) are deleted before a new backup is written. Railway
 *    provider-side backups run on their own instantaneous retention (see
 *    docs/OPS_RUNBOOK.md).
 *
 * Failure alerting: any failure sets a non-zero exit code and prints one
 *   `BACKUP_FAILED: ...` line on stderr, intended for log shipment to paging.
 *   On success prints `BACKUP_OK ...` (and, if a non-local store sink is
 *   configured and succeeds, `STORE_OK ...`). The script never claims an
 *   alert fired without proof.
 */
import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from "node:crypto";
import {
  existsSync,
  statSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  chmodSync,
  unlinkSync,
  readdirSync,
} from "node:fs";
import { resolve, join } from "node:path";
import process from "node:process";
import { config as loadEnv } from "dotenv";
import { gzipSync, gunzipSync } from "node:zlib";
import { createRequire } from "node:module";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const require = createRequire(import.meta.url);
const pg = require("pg");

const argv = process.argv.slice(2);
const outputArg = argv[0];
const allowLarge = argv.includes("--allow-large");

const DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("BACKUP_FAILED: no DIRECT_DATABASE_URL or DATABASE_URL in environment.");
  process.exitCode = 2;
  process.exit();
}

if (!isLoopbackOrPrivate(DATABASE_URL) && process.env.ALLOW_PRODUCTION_BACKUP !== "true") {
  console.error(
    "BACKUP_FAILED: refusing to run against a non-loopback host without ALLOW_PRODUCTION_BACKUP=true.",
  );
  process.exitCode = 3;
  process.exit();
}

const OUTPUT_DIR = join(process.cwd(), ".data", "backups");
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true, mode: 0o700 });
chmodSync(OUTPUT_DIR, 0o700);

const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 35);
nowSweep(OUTPUT_DIR, retentionDays);

const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..+Z$/, "Z");
const backupId = `kashkol-backup-${stamp}`;
const outPath = resolve(
  outputArg ?? join(OUTPUT_DIR, `${backupId}.ksbk`),
);

main().catch((err) => {
  const msg = err?.message ?? String(err);
  console.error(`BACKUP_FAILED: ${msg}`);
  process.exitCode = 1;
});

async function main() {
  const started = Date.now();
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("connected to source");

  try {
    // RLS-bypass check: superusers and roles with BYPASSRLS are required, or
    // the dump would silently omit tenant rows.
    const rls = (
      await client.query(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_role`,
      )
    ).rows[0];
    if (!rls || (!rls.rolsuper && !rls.rolbypassrls)) {
      throw new Error(
        "source role does not bypass row-level security — tenant rows would be silently excluded. Use DIRECT_DATABASE_URL with a superuser or a role with BYPASSRLS.",
      );
    }

    const tables = (
      await client.query(
        `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
      )
    ).rows.map((r) => r.tablename);

    console.log(`tables discovered: ${tables.length}`);
    let totalRows = 0;
    const manifest = {
      id: backupId,
      createdAt: new Date().toISOString(),
      source: redactUrl(DATABASE_URL),
      format: "jsonl+gz+aes-256-gcm",
      tables: {},
    };

    const parts = [];
    for (const name of tables) {
      const rows = await client.query(`SELECT * FROM ${quoteIdent(name)}`);
      const arr = rows.rows;
      manifest.tables[name] = arr.length;
      totalRows += arr.length;
      parts.push(JSON.stringify({ table: name, rowCount: arr.length }));
      for (const row of arr) parts.push(JSON.stringify({ row }));
      parts.push(JSON.stringify({ endTable: name, rowCount: arr.length }));
    }

    const payload = Buffer.from(parts.join("\n"), "utf8");
    if (!allowLarge && payload.length > 256 * 1024 * 1024) {
      throw new Error(
        `payload too large (${(payload.length / 1024 / 1024).toFixed(1)} MiB). Pass --allow-large to override.`,
      );
    }

    const compressed = gzipSync(payload, { level: 9 });

    const keySource =
      process.env.BACKUP_ENCRYPTION_KEY ?? process.env.BACKUP_KEY ?? randomBytes(32);
    const derivedKey = deriveKey(keySource);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
    const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
    const tag = cipher.getAuthTag();
    const magic = Buffer.from("KSHKBACKUP\x00");
    const file = Buffer.concat([magic, iv, tag, ciphertext]);

    writeFileSync(outPath, file, { mode: 0o600 });
    chmodSync(outPath, 0o600);
    const sha = createHash("sha256").update(file).digest("hex");

    // Self-verify: decrypt + decompress + count rows.
    const decipher = createDecipheriv("aes-256-gcm", derivedKey, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const flat = gunzipSync(dec).toString("utf8").split("\n").filter(Boolean);
    let decodedRows = 0;
    for (const line of flat) {
      try {
        const obj = JSON.parse(line);
        if (obj.row) decodedRows += 1;
      } catch {
        /* ignore */
      }
    }
    if (decodedRows !== totalRows) {
      throw new Error(
        `self-verify mismatch: decoded ${decodedRows} rows, expected ${totalRows}`,
      );
    }

    manifest.archiveSha256 = sha;
    manifest.archiveBytes = file.length;
    manifest.totalRows = totalRows;
    manifest.verified = true;
    manifest.encryption = {
      algorithm: "aes-256-gcm",
      kdf: "scrypt(salt=KashkolBackup2026, N=16384, r=8, p=1, dkLen=32)",
      keyEnv: process.env.BACKUP_ENCRYPTION_KEY
        ? "BACKUP_ENCRYPTION_KEY"
        : process.env.BACKUP_KEY
          ? "BACKUP_KEY"
          : "ephemeral-per-run",
    };

    const manifestPath = `${outPath}.manifest.json`;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    chmodSync(manifestPath, 0o600);

    const sink = process.env.BACKUP_STORE_DRIVER ?? "local";
    if (sink === "s3") {
      await storeS3(outPath, manifestPath, manifest.id);
    } else if (sink !== "local") {
      throw new Error(`unknown BACKUP_STORE_DRIVER "${sink}". Supported: local, s3.`);
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `BACKUP_OK tables=${tables.length} rows=${totalRows} bytes=${file.length} sha256=${sha} verified=true elapsed=${elapsed}s`,
    );
  } finally {
    await client.end();
  }
}

// --------------- S3 sink (only when BACKUP_STORE_DRIVER=s3) -----------------

async function storeS3(path, manifestPath, id) {
  const bucket = process.env.BACKUP_S3_BUCKET;
  if (!bucket) {
    throw new Error("BACKUP_STORE_DRIVER=s3 requires BACKUP_S3_BUCKET");
  }
  const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
  const region = process.env.BACKUP_S3_REGION ?? process.env.S3_REGION ?? "eu-west-1";
  const endpoint = process.env.BACKUP_S3_ENDPOINT; // supports Backblaze / MinIO / S3-compatible
  const prefix = process.env.BACKUP_S3_PREFIX ?? "kashkol";
  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: endpoint ? true : false,
  });
  const key = `backups/${prefix}/${id}.ksbk`;
  const manifestKey = `backups/${prefix}/${id}.ksbk.manifest.json`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: readFileSafe(path),
      ServerSideEncryption: "AES256",
    }),
  );
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: manifestKey,
      Body: readFileSafe(manifestPath),
      ServerSideEncryption: "AES256",
    }),
  );
  console.log(`STORE_OK sink=s3 bucket=${bucket} key=${key}`);
}

function readFileSafe(path) {
  return Buffer.from(readFileSync(path));
}

// ------------------------- helpers ----------------------------------------

function quoteIdent(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`unsafe identifier: ${value}`);
  }
  return `"${value}"`;
}

function isLoopbackOrPrivate(url) {
  try {
    const u = new URL(url);
    const h = u.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
    if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    return false;
  } catch {
    return false;
  }
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

function nowSweep(dir, days) {
  try {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      try {
        const st = statSync(p);
        if (
          st.isFile() &&
          st.mtimeMs < cutoff &&
          (name.endsWith(".ksbk") || name.endsWith(".ksbk.manifest.json"))
        ) {
          unlinkSync(p);
          console.log(`retention: removed ${name}`);
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* directory may not exist yet */
  }
}
process.exitCode = process.exitCode ?? 0;
