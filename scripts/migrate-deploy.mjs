#!/usr/bin/env node
/**
 * migrate-deploy.mjs
 *
 * Pre-deploy migration runner for Railway.
 *
 * If a previous deployment failed mid-migration, Prisma records the migration
 * as failed in _prisma_migrations and refuses to apply anything else (P3009).
 * This script marks any such rows as rolled back so `prisma migrate deploy`
 * can re-run them, then runs `prisma migrate deploy`.
 */

import { execSync } from "node:child_process";
import pg from "pg";

const run = (cmd) => {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
};

const connectionString =
  process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

async function findFailedMigrations() {
  if (!connectionString) {
    console.log("No DATABASE_URL set — skipping resolve step.");
    return [];
  }
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    const { rows } = await client.query(
      `SELECT migration_name
         FROM _prisma_migrations
        WHERE finished_at IS NULL
          AND rolled_back_at IS NULL`
    );
    return rows.map((r) => r.migration_name);
  } catch (err) {
    // 42P01 = undefined_table: _prisma_migrations does not exist yet (first deploy).
    if (err && err.code === "42P01") {
      console.log("_prisma_migrations does not exist yet — skipping resolve step.");
    } else {
      console.log(`Could not query _prisma_migrations: ${err?.message ?? err}`);
    }
    return [];
  } finally {
    await client.end().catch(() => {});
  }
}

const failed = await findFailedMigrations();

if (failed.length > 0) {
  console.log(`Found ${failed.length} failed migration(s) — resolving as rolled-back:`);
  for (const name of failed) {
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      throw new Error(`Refusing to resolve migration with unexpected name: ${name}`);
    }
    console.log(`  -> ${name}`);
    run(`npx prisma migrate resolve --rolled-back ${name}`);
  }
} else {
  console.log("No failed migrations found — proceeding.");
}

run("npx prisma migrate deploy");
