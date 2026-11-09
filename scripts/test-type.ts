import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });
import { getDb, disconnectDb } from "../src/lib/db/client";

async function main() {
  const db = getDb();
  const types = await db.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typname LIKE '%report%'`);
  console.log("Types:", types);
  await disconnectDb();
}
main().catch(console.error);
