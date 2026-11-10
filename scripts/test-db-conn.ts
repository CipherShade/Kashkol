import { disconnectDb, getDb } from "../src/lib/db/client";

async function main(): Promise<void> {
  const db = getDb();
  console.log("current_user:", await db.$queryRawUnsafe("SELECT current_user"));
  console.log("search_path:", await db.$queryRawUnsafe("SHOW search_path"));
  try {
    const perms = await db.$queryRawUnsafe(
      `SELECT rolname, rolsuper FROM pg_roles WHERE rolname IN ('kashkol','kashkol_app','kashkol_dev_app','postgres')`,
    );
    console.log("roles:", perms);
  } catch (e) {
    console.error("roles query failed:", e);
  }
  console.log("table list:", await db.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LIMIT 50`,
  ));
  console.log("ts list:", await db.$queryRawUnsafe(
    `SELECT schemaname, tablename FROM information_schema.tables WHERE schemaname='public' ORDER BY schemaname, tablename LIMIT 50`,
  ));
  await disconnectDb();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
