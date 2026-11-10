import { getDb } from "@/lib/db/client";
import { REQUIRED_MIGRATION_NAME } from "@/lib/db/migration-state";

/**
 * Hard preflight gate for non-request processes, such as the background
 * worker. Returns true only when the applied schema matches what this build
 * expects.
 *
 * The web tier enforces the same invariant through `/readyz`: if the newest
 * applied migration is behind `REQUIRED_MIGRATION_NAME`, the deployment must
 * not claim it is ready. Given no HTTP probe, a worker that starts against a
 * behind schema would silently drain a wall of SQL errors, one failed batch
 * per cycle — the gate makes it fail fast and visibly instead.
 */
export async function isRequiredMigrationApplied(): Promise<boolean> {
  try {
    const db = getDb();
    const rows = await db.$queryRaw<{ migration_name: string }[]>`
      SELECT "migration_name"
      FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
      ORDER BY "finished_at" DESC
      LIMIT 1
    `;
    return rows[0]?.migration_name === REQUIRED_MIGRATION_NAME;
  } catch {
    return false;
  }
}
