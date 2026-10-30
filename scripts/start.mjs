#!/usr/bin/env node
/*
 * Start the Next.js standalone server produced by `npm run build`.
 *
 * Next's standalone output intentionally omits `.next/static` and `public`;
 * they are served by the platform in some setups and must be copied beside
 * `server.js` when the process serves the image itself (Railway, a container).
 */
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { config as loadEnv } from "dotenv";

// Next's standalone server does not read the development env files by itself.
// Load them here for a local production-mode start. In a deployed environment
// APP_ENV is set by the platform, and a stray .env.local is ignored so it
// cannot supply a development secret or secret-less transport.
if (process.env.APP_ENV === undefined || process.env.APP_ENV === "local") {
  loadEnv({ path: ".env.local", quiet: true });
}
loadEnv({ quiet: true });

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const server = path.join(standalone, "server.js");

if (!existsSync(server)) {
  console.error("Standalone server not found. Run `npm run build` first.");
  process.exit(1);
}

const staticSource = path.join(root, ".next", "static");
if (!existsSync(staticSource)) {
  console.error("Static assets not found. Run `npm run build` first.");
  process.exit(1);
}
cpSync(staticSource, path.join(standalone, ".next", "static"), { recursive: true });

const publicSource = path.join(root, "public");
if (existsSync(publicSource)) {
  cpSync(publicSource, path.join(standalone, "public"), { recursive: true });
}

const child = spawn(process.execPath, [server], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: process.env.HOSTNAME ?? "0.0.0.0",
    PORT: process.env.PORT ?? "3000",
  },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
