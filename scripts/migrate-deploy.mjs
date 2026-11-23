#!/usr/bin/env node
/**
 * migrate-deploy.mjs
 *
 * Pre-deploy migration runner for Railway.
 *
 * Prisma refuses to deploy when a migration is recorded as unfinished in
 * _prisma_migrations (P3009). Resolving that row is a data decision, not a
 * cleanup task: a migration may have applied its DDL before failing, in which
 * case it must be marked applied, not rolled back. This script therefore never
 * guesses. It reports unresolved migrations and requires an explicit operator
 * decision via --applied <name> or --rolled-back <name>.
 */

import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import pg from "pg";

const MIGRATION_NAME = /^[A-Za-z0-9_]+$/;

/** Parse explicit migration resolutions. Unknown flags and bad names fail closed. */
export function parseResolutionArgs(argv) {
  const applied = [];
  const rolledBack = [];

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag !== "--applied" && flag !== "--rolled-back") {
      throw new Error(`Unknown argument: ${flag}`);
    }
    const name = argv[++index];
    if (!name || !MIGRATION_NAME.test(name)) {
      throw new Error(`Invalid migration name for ${flag}: ${name ?? "(missing)"}`);
    }
    (flag === "--applied" ? applied : rolledBack).push(name);
  }

  return { applied, rolledBack };
}

/** A migration folder is <timestamp>_<name>; the suffix names its main table. */
export function migrationTable(name) {
  return name.replace(/^\d+_/, "");
}

function run(command) {
  console.log(`$ ${command}`);
  execSync(command, { stdio: "inherit" });
}

/** Classify a Prisma 7 ledger row. There is no `success` column. */
export function classifyLedgerRow(row) {
  const rolledBack = Boolean(row.rolled_back_at);
  const finished = Boolean(row.finished_at);
  return {
    name: row.migration_name,
    applied: finished && !rolledBack,
    rolledBack,
    unfinished: !finished && !rolledBack,
  };
}

async function readLedger(client) {
  const { rows } = await client.query(
    `SELECT migration_name, finished_at, rolled_back_at
       FROM _prisma_migrations
      ORDER BY migration_name`
  );

  return rows.map(classifyLedgerRow);
}

async function main() {
  const resolutions = parseResolutionArgs(process.argv.slice(2));
  const connectionString =
    process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    console.log("No DATABASE_URL set — proceeding without ledger inspection.");
    run("npx prisma migrate deploy");
    return;
  }

  const client = new pg.Client({ connectionString });

  try {
    await client.connect();

    let ledger;
    try {
      ledger = await readLedger(client);
    } catch (error) {
      // 42P01 = undefined_table: first deploy, no _prisma_migrations yet.
      if (error?.code === "42P01") {
        console.log("_prisma_migrations does not exist yet — proceeding.");
        run("npx prisma migrate deploy");
        return;
      }
      throw error;
    }

    const unresolved = ledger.filter((row) => !row.applied);
    if (unresolved.length === 0) {
      console.log("No unresolved migrations — proceeding.");
      run("npx prisma migrate deploy");
      return;
    }

    console.log("Unresolved migrations in _prisma_migrations:");
    for (const row of unresolved) {
      console.log(`  - ${row.name} (rolledBack=${row.rolledBack})`);
    }

    const chosen = new Map([
      ...resolutions.applied.map((name) => [name, "applied"]),
      ...resolutions.rolledBack.map((name) => [name, "rolled-back"]),
    ]);
    const duplicate = ["--applied", "--rolled-back"].flatMap((flag) => {
      const values = flag === "--applied" ? resolutions.applied : resolutions.rolledBack;
      return values.filter((name, index) => values.indexOf(name) !== index);
    });
    if (duplicate.length > 0) {
      throw new Error(`Migration resolved twice: ${[...new Set(duplicate)].join(", ")}`);
    }

    const missing = [...chosen.keys()].filter(
      (name) => !unresolved.some((row) => row.name === name)
    );
    if (missing.length > 0) {
      throw new Error(`Resolution given for non-unresolved migration(s): ${missing.join(", ")}`);
    }

    const stillUnresolved = unresolved
      .map((row) => row.name)
      .filter((name) => !chosen.has(name));
    if (stillUnresolved.length > 0) {
      throw new Error(
        `Refusing to guess. Resolve explicitly: ${stillUnresolved.join(", ")}. ` +
          "Use --applied when the DDL was applied before the failure, " +
          "--rolled-back when none of it was."
      );
    }

    for (const [name, resolution] of chosen) {
      if (resolution === "applied") {
        const table = migrationTable(name);
        const { rows } = await client.query("SELECT to_regclass($1) AS relation", [
          `public.${table}`,
        ]);
        if (!rows[0]?.relation) {
          throw new Error(
            `Refusing to mark ${name} applied: public.${table} does not exist.`
          );
        }
        console.log(`Marking ${name} as applied (public.${table} exists).`);
        run(`npx prisma migrate resolve --applied ${name}`);
      } else {
        console.log(`Marking ${name} as rolled back.`);
        run(`npx prisma migrate resolve --rolled-back ${name}`);
      }
    }
  } finally {
    await client.end().catch(() => {});
  }

  run("npx prisma migrate deploy");
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  });
}
