import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

// Override DATABASE_URL with DIRECT_DATABASE_URL to run as database owner
if (process.env.DIRECT_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL;
}

import { getDb, disconnectDb } from "../src/lib/db/client";

async function main(): Promise<void> {
  const db = getDb();

  console.log("Granting permissions to kashkol_app...");
  await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO kashkol_app;`);
  await db.$executeRawUnsafe(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO kashkol_app;`);
  await db.$executeRawUnsafe(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO kashkol_app;`);
  await db.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO kashkol_app;`);
  await db.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO kashkol_app;`);
  console.log("Permissions granted successfully.");

  await disconnectDb();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
