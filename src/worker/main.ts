import { disconnectDb } from "@/lib/db/client";
import { getServerEnv } from "@/lib/config/env";
import { isRequiredMigrationApplied } from "@/lib/db/migration-gate";
import { REQUIRED_MIGRATION_NAME } from "@/lib/db/migration-state";
import { runWorker } from "./runner";

/**
 * The worker's main routine: parse the configuration, verify the applied
 * schema matches what this build expects, drain, and disconnect. Kept
 * side-effect-free at the module level so unit tests can exercise the
 * start-up gates directly; `src/worker/index.ts` is the actual process
 * entry point and owns `process.exit`.
 */
export async function main(): Promise<number> {
  try {
    const env = getServerEnv();
    if (env.REQUIRE_MIGRATIONS && !(await isRequiredMigrationApplied())) {
      console.error(
        `[worker] startup gate failed: required migration ${REQUIRED_MIGRATION_NAME} is not applied`,
      );
      return 1;
    }
    await runWorker();
    return 0;
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown failure";
    console.error(`[worker] fatal: ${code}`);
    return 1;
  } finally {
    try {
      await disconnectDb();
    } catch {
      console.error("[worker] database disconnect failed on shutdown");
    }
  }
}
