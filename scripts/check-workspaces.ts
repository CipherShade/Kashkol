import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

import { getDb, disconnectDb } from "../src/lib/db/client";

async function main(): Promise<void> {
  const db = getDb();
  console.log("Workspaces:", await db.workspace.findMany());
  await disconnectDb();
}

main().catch(console.error);
