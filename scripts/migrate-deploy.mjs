#!/usr/bin/env node
/**
 * migrate-deploy.mjs
 *
 * Pre-deploy migration runner for Railway.
 *
 * Problem: If a previous deployment failed mid-migration (e.g. because a bare
 * GRANT referenced a role that didn't exist on Railway's managed Postgres),
 * Prisma records that migration as FAILED in _prisma_migrations and refuses to
 * apply any subsequent migrations until the error is manually resolved.
 *
 * This script:
 *   1. Finds any FAILED migration rows in _prisma_migrations.
 *   2. Marks each one as "rolled back" (clears the error) so prisma migrate
 *      deploy can re-run them with the fixed SQL.
 *   3. Runs prisma migrate deploy normally.
 *
 * Safe to run on every deploy: if there are no failed migrations the resolve
 * step is a no-op.
 */

import { execSync } from "node:child_process";

const run = (cmd) => {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
};

// Step 1: resolve any failed migrations so deploy can proceed.
// `prisma migrate resolve --rolled-back <name>` is idempotent — it only
// updates the row if it is currently in a failed state.
try {
  // Use prisma db execute to query failed migrations and resolve them.
  // We pass the SQL inline because prisma migrate resolve requires a name.
  const result = execSync(
    `npx prisma db execute --stdin --url "$DATABASE_URL"`,
    {
      input: `
        SELECT migration_name
        FROM _prisma_migrations
        WHERE finished_at IS NULL
          AND applied_steps_count > 0
          AND logs IS NOT NULL;
      `,
      encoding: "utf8",
    }
  );

  const lines = result
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== "migration_name" && !l.startsWith("-"));

  if (lines.length > 0) {
    console.log(
      `Found ${lines.length} failed migration(s) — resolving as rolled-back:`
    );
    for (const name of lines) {
      console.log(`  → ${name}`);
      run(`npx prisma migrate resolve --rolled-back ${name}`);
    }
  } else {
    console.log("No failed migrations found — proceeding.");
  }
} catch (err) {
  // _prisma_migrations might not exist yet (first deploy). That is fine.
  console.log(
    "Could not query _prisma_migrations (may not exist yet) — skipping resolve step."
  );
  console.log(err.message);
}

// Step 2: apply all pending migrations.
run("npx prisma migrate deploy");
