import { getServerEnv } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";
import { REQUIRED_MIGRATION_NAME } from "@/lib/db/migration-state";

export type CheckState = "ok" | "fail" | "unknown";

export type ReadinessCheck = {
  state: CheckState;
  detail: string;
};

export type Readiness = {
  status: "ready" | "not_ready";
  appEnv: string;
  checks: {
    config: ReadinessCheck;
    database: ReadinessCheck;
    migrations: ReadinessCheck;
  };
  timestamp: string;
};

type MigrationRow = { count: bigint };
type LatestMigrationRow = { migration_name: string };

async function checkDatabase(): Promise<{
  database: ReadinessCheck;
  migrations: ReadinessCheck;
}> {
  let db;
  try {
    db = getDb();
    await db.$queryRaw`SELECT 1`;
  } catch {
    return {
      database: { state: "fail", detail: "database.unreachable" },
      migrations: { state: "unknown", detail: "database.unavailable" },
    };
  }

  let appliedCount = 0;
  let latest: string | null = null;
  try {
    const [countRow] = await db.$queryRaw<MigrationRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
    `;
    appliedCount = Number(countRow?.count ?? 0);

    const latestRows = await db.$queryRaw<LatestMigrationRow[]>`
      SELECT "migration_name"
      FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
      ORDER BY "finished_at" DESC
      LIMIT 1
    `;
    latest = latestRows[0]?.migration_name ?? null;
  } catch {
    return {
      database: { state: "ok", detail: "database.reachable" },
      migrations: { state: "fail", detail: "migrations.unreadable" },
    };
  }

  const upToDate = latest === REQUIRED_MIGRATION_NAME;
  return {
    database: { state: "ok", detail: "database.reachable" },
    migrations: {
      state: upToDate ? "ok" : "fail",
      detail: upToDate
        ? `migrations.applied.${appliedCount}`
        : `migrations.pending.${REQUIRED_MIGRATION_NAME}`,
    },
  };
}

export async function getReadiness(): Promise<Readiness> {
  let appEnv = "unknown";
  let config: ReadinessCheck = { state: "ok", detail: "config.valid" };
  let requireMigrations = true;

  try {
    const env = getServerEnv();
    appEnv = env.APP_ENV;
    requireMigrations = env.REQUIRE_MIGRATIONS;
  } catch {
    config = { state: "fail", detail: "config.invalid" };
  }

  if (config.state === "fail") {
    return {
      status: "not_ready",
      appEnv,
      checks: {
        config,
        database: { state: "unknown", detail: "config.invalid" },
        migrations: { state: "unknown", detail: "config.invalid" },
      },
      timestamp: new Date().toISOString(),
    };
  }

  const databaseChecks = await checkDatabase();
  const ready =
    databaseChecks.database.state === "ok" &&
    (!requireMigrations || databaseChecks.migrations.state === "ok");

  return {
    status: ready ? "ready" : "not_ready",
    appEnv,
    checks: { config, ...databaseChecks },
    timestamp: new Date().toISOString(),
  };
}
