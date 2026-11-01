#!/usr/bin/env node
/**
 * Dependency audit script — reproducible dependency vulnerability check.
 * Runs `npm audit --audit-level=moderate`, prints affected packages,
 * and exits with non-zero if critical/high advisories exist.
 */
import { execSync } from "child_process";

try {
  const output = execSync("npm audit --audit-level=moderate", {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  console.log(output);
  // If audit exits 0 there are no advisories at or above the level.
  process.exit(0);
} catch (e) {
  const stderr = e.stderr ? e.stderr.toString() : "";
  const stdout = e.stdout ? e.stdout.toString() : "";
  console.error("Dependency audit failed (advisories present):\n");
  console.error(stdout || stderr || String(e));
  // Check for high/critical advisories in the output text.
  const combined = (stdout + stderr).toLowerCase();
  const hasHighOrCritical =
    combined.includes("high severity") ||
    combined.includes("critical severity");
  if (hasHighOrCritical) {
    console.error("\n[FAIL] High or critical dependency vulnerabilities detected.");
    process.exit(1);
  }
  // Moderate only — log but do not fail build.
  console.error("\n[WARN] Moderate dependency vulnerabilities present. No automatic upgrade performed without compatibility check.");
  process.exit(0);
}
