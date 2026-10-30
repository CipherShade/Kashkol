#!/usr/bin/env node
/*
 * Local development PostgreSQL, backed by embedded-postgres.
 *
 * This is intentionally development-only: it listens on a non-standard port,
 * uses throwaway credentials, and stores its data under `.data/postgres`
 * (git-ignored). No production credential is ever required or read.
 *
 *   npm run db:dev:start   start the cluster (foreground; Ctrl+C stops it)
 *   npm run db:dev:stop    stop a cluster started in another terminal
 */
import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, ".data", "postgres");
const PORT = Number(process.env.DEV_DB_PORT ?? 5433);
const DB_NAME = process.env.DEV_DB_NAME ?? "kashkol_dev";
const OWNER_USER = process.env.DEV_DB_OWNER ?? "kashkol";
const OWNER_PASSWORD = process.env.DEV_DB_OWNER_PASSWORD ?? "kashkol_dev";
const APP_USER = process.env.DEV_DB_APP_USER ?? "kashkol_app";
const APP_PASSWORD = process.env.DEV_DB_APP_PASSWORD ?? "kashkol_dev_app";

const options = {
  databaseDir: DATA_DIR,
  port: PORT,
  user: OWNER_USER,
  password: OWNER_PASSWORD,
  persistent: true,
  // Windows defaults initdb to the ANSI code page (WIN1252), which cannot
  // store Arabic. Pin UTF-8 and the C locale so every developer gets the same
  // bytes and deterministic ordering.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: (message) => {
    if (process.env.DEV_DB_VERBOSE === "true") console.log(String(message).trim());
  },
  onError: (error) => console.error(String(error).trim()),
};

function connectionString(user, password, database) {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@localhost:${PORT}/${database}`;
}

async function ensureDatabase() {
  const pg = new EmbeddedPostgres(options);
  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    console.log("Initialising embedded PostgreSQL in .data/postgres ...");
    await pg.initialise();
  }

  console.log(`Starting embedded PostgreSQL on port ${PORT} ...`);
  await pg.start();

  const admin = pg.getPgClient("postgres");
  await admin.connect();
  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME]);
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${DB_NAME}" WITH ENCODING 'UTF8' TEMPLATE template0`);
      console.log(`Created database ${DB_NAME} with UTF-8 encoding.`);
    }

    await admin.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_roles WHERE rolname = '${escapeLiteral(APP_USER)}'
         ) THEN
           CREATE ROLE ${quoteIdent(APP_USER)} LOGIN PASSWORD '${escapeLiteral(APP_PASSWORD)}'
             NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
         END IF;
       END $$;`,
    );
  } finally {
    await admin.end();
  }

  const appAdmin = pg.getPgClient(DB_NAME);
  await appAdmin.connect();
  try {
    await appAdmin.query(`GRANT CONNECT ON DATABASE "${DB_NAME}" TO ${quoteIdent(APP_USER)}`);
    await appAdmin.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdent(APP_USER)}`);
    await appAdmin.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
         GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quoteIdent(APP_USER)}`,
    );
    await appAdmin.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
         GRANT USAGE, SELECT ON SEQUENCES TO ${quoteIdent(APP_USER)}`,
    );
  } finally {
    await appAdmin.end();
  }

  return pg;
}

function quoteIdent(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe development database identifier: ${value}`);
  }
  return `"${value}"`;
}

function escapeLiteral(value) {
  return value.replace(/'/g, "''");
}

async function stop() {
  const pidFile = path.join(DATA_DIR, "postmaster.pid");
  if (!existsSync(pidFile)) {
    console.log("No embedded PostgreSQL cluster is marked as running.");
    return;
  }
  const contents = await fs.readFile(pidFile, "utf8");
  const pid = Number(contents.split(/\r?\n/)[0]);
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Could not read a PID from ${pidFile}`);
  }
  console.log(`Stopping embedded PostgreSQL (pid ${pid}) ...`);
  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      const child = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore" });
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`taskkill exited with ${code}`)),
      );
      child.on("error", reject);
    });
  } else {
    process.kill(pid, "SIGTERM");
  }
  console.log("Stopped.");
}

async function start() {
  const pg = await ensureDatabase();

  console.log("");
  console.log("Development database is ready. Add these to .env.local:");
  console.log("");
  console.log(`  DATABASE_URL=${connectionString(APP_USER, APP_PASSWORD, DB_NAME)}`);
  console.log(`  DIRECT_DATABASE_URL=${connectionString(OWNER_USER, OWNER_PASSWORD, DB_NAME)}`);
  console.log("");
  console.log("Then run: npm run db:migrate && npm run db:seed");
  console.log("Press Ctrl+C to stop the database.");

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log("\nStopping embedded PostgreSQL ...");
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => {});
}

const command = process.argv[2] ?? "start";
if (command === "start") {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else if (command === "stop") {
  stop().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  console.error(`Unknown command: ${command}. Use "start" or "stop".`);
  process.exit(1);
}
