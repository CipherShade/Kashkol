import process from "node:process";
import { main } from "./main";

/**
 * Production entry point for the background worker (ADR-0008, ADR-0024).
 *
 * Thin composition: parse the environment, verify the applied schema, drain
 * queued report exports and the per-workspace message outbox, and exit with
 * a stable code. `main` owns the logic; this file only hands the exit code to
 * the process. Exits non-zero on any startup or fatal error so the platform
 * (Railway `restartPolicyType=ON_FAILURE`) restarts it honestly instead of
 * showing a permanently-green, dead worker.
 */
main()
  .then((code) => process.exit(code))
  .catch(() => process.exit(1));
