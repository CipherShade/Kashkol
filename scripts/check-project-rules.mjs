#!/usr/bin/env node
/*
 * Rules that must hold across files and are awkward to express in ESLint:
 *   - both message catalogues carry exactly the same non-empty keys;
 *   - every route handler is declared in the route registry;
 *   - Prisma is imported only from the two allowed locations;
 *   - no NEXT_PUBLIC_* name looks like a credential;
 *   - no physical-direction CSS property is used;
 *   - the tenant-table registry matches the schema, and every RLS table is
 *     enabled, forced, and policied in the migration;
 *   - REQUIRED_MIGRATION_NAME names the newest migration.
 *
 * This is a CI gate, not a formatter. It fails with a precise file:reason line.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const failures = [];

function fail(file, message) {
  failures.push(`${path.relative(ROOT, file)}: ${message}`);
}

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function walk(directory, predicate = () => true) {
  if (!fs.existsSync(directory)) return [];
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full, predicate));
    } else if (predicate(full)) {
      results.push(full);
    }
  }
  return results;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function flattenKeys(value, prefix = "", output = []) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenKeys(child, prefix ? `${prefix}.${key}` : key, output);
    }
  } else {
    output.push([prefix, value]);
  }
  return output;
}

// 1. Message catalogue parity.
{
  const locales = ["ar", "en"];
  const catalogues = new Map();
  for (const locale of locales) {
    const file = path.join(ROOT, "messages", `${locale}.json`);
    if (!fs.existsSync(file)) {
      fail(file, "missing message catalogue");
      continue;
    }
    try {
      catalogues.set(locale, new Map(flattenKeys(JSON.parse(fs.readFileSync(file, "utf8")))));
    } catch (error) {
      fail(file, `invalid JSON (${error instanceof Error ? error.message : "unknown"})`);
    }
  }

  const first = catalogues.get(locales[0]);
  const second = catalogues.get(locales[1]);
  if (first && second) {
    for (const [key, value] of first) {
      if (!second.has(key))
        fail(path.join(ROOT, "messages", `${locales[1]}.json`), `missing key "${key}"`);
      if (typeof value !== "string" || value.trim() === "") {
        fail(path.join(ROOT, "messages", `${locales[0]}.json`), `empty value for "${key}"`);
      }
    }
    for (const [key, value] of second) {
      if (!first.has(key))
        fail(path.join(ROOT, "messages", `${locales[0]}.json`), `missing key "${key}"`);
      if (typeof value !== "string" || value.trim() === "") {
        fail(path.join(ROOT, "messages", `${locales[1]}.json`), `empty value for "${key}"`);
      }
    }
  }
}

// 2. Route registry completeness.
{
  const registryFile = path.join(ROOT, "src", "lib", "routes", "registry.ts");
  const registrySource = fs.existsSync(registryFile) ? read("src/lib/routes/registry.ts") : "";
  const registered = new Set(
    [...registrySource.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]),
  );

  const routeFiles = walk(path.join(ROOT, "src", "app"), (file) => file.endsWith("route.ts"));
  for (const file of routeFiles) {
    const relative = path.relative(path.join(ROOT, "src", "app"), file).replaceAll("\\", "/");
    const routePath = `/${relative.slice(0, -"/route.ts".length)}`;
    if (!registered.has(routePath)) {
      fail(file, `route "${routePath}" is not declared in src/lib/routes/registry.ts`);
    }
  }
  for (const routePath of registered) {
    const exists = routeFiles.some(
      (file) =>
        `/${path
          .relative(path.join(ROOT, "src", "app"), file)
          .replaceAll("\\", "/")
          .slice(0, -"/route.ts".length)}` === routePath,
    );
    if (!exists) fail(registryFile, `registered route "${routePath}" has no route.ts`);
  }
}

// 3. Prisma import boundary.
{
  const sourceFiles = walk(path.join(ROOT, "src"), (file) => /\.(ts|tsx|mts)$/.test(file));
  const importPattern =
    /(?:from\s+|import\s*\(\s*)["'](?:@prisma\/client|@\/generated\/prisma|prisma)(?:\/[^"']*)?["']/g;
  for (const file of sourceFiles) {
    const relative = path.relative(ROOT, file).replaceAll("\\", "/");
    if (relative.startsWith("src/generated/")) continue;
    const allowed =
      relative.startsWith("src/lib/db/") || /^src\/modules\/[^/]+\/repository\.ts$/.test(relative);
    if (!allowed && importPattern.test(fs.readFileSync(file, "utf8"))) {
      fail(file, "Prisma may be imported only from src/lib/db/ or src/modules/*/repository.ts");
    }
    importPattern.lastIndex = 0;
  }
}

// 4. No credential-like NEXT_PUBLIC_ variable.
{
  const files = [
    ...walk(path.join(ROOT, "src"), (file) => /\.(ts|tsx|mjs|css)$/.test(file)),
    ...walk(path.join(ROOT, "scripts"), (file) => /\.(ts|mjs)$/.test(file)),
    path.join(ROOT, ".env.example"),
    path.join(ROOT, "next.config.ts"),
  ].filter((file) => fs.existsSync(file));

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    if (/NEXT_PUBLIC_[A-Z0-9_]*(SECRET|KEY|TOKEN|PASSWORD)/i.test(source)) {
      fail(file, "a credential-looking value must never be prefixed NEXT_PUBLIC_");
    }
  }
}

// 5. Logical CSS properties only.
{
  const cssFiles = walk(path.join(ROOT, "src"), (file) => file.endsWith(".css"));
  const banned = [
    { pattern: /(^|[^-\w])(margin|padding|border)-(left|right)\s*:/gm, name: "physical box side" },
    { pattern: /(^|[^-\w])(left|right)\s*:\s*[^;]+;/g, name: "physical inset" },
    { pattern: /text-align\s*:\s*(left|right)\b/g, name: "physical text alignment" },
    { pattern: /(float|clear)\s*:\s*(left|right)\b/g, name: "physical float/clear" },
  ];

  for (const file of cssFiles) {
    const source = stripComments(fs.readFileSync(file, "utf8"));
    for (const { pattern, name } of banned) {
      pattern.lastIndex = 0;
      if (pattern.test(source)) fail(file, `physical direction property (${name}) is banned`);
    }
  }
}

// 6. Tenant registry, RLS, and migration state.
{
  const schema = read("prisma/schema.prisma");
  const models = new Map();
  for (const match of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const [, name, body] = match;
    const table = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name;
    models.set(table, body);
  }

  const registrySource = read("src/lib/db/tenant-tables.ts");
  // Only the TENANT_TABLES block. IDENTITY_TABLES is deliberately global and
  // must not be mistaken for a tenant table when the file is reformatted.
  const tenantBlock =
    registrySource.match(/TENANT_TABLES\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  const registry = new Set(
    [...tenantBlock.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]),
  );

  const tenantModels = new Set(
    [...models.entries()]
      .filter(([, body]) => /\bworkspaceId\b/.test(body) || /\bworkspace_id\b/.test(body))
      .map(([table]) => table),
  );

  for (const table of tenantModels) {
    if (!registry.has(table)) {
      fail(
        path.join(ROOT, "src", "lib", "db", "tenant-tables.ts"),
        `missing tenant table "${table}"`,
      );
    }
  }
  for (const table of registry) {
    if (!models.has(table)) {
      fail(
        path.join(ROOT, "src", "lib", "db", "tenant-tables.ts"),
        `unknown tenant table "${table}"`,
      );
    }
  }

  const migrationsRoot = path.join(ROOT, "prisma", "migrations");
  const migrations = fs
    .readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const newest = migrations.at(-1);
  const migrationState = read("src/lib/db/migration-state.ts");
  const required = migrationState.match(/REQUIRED_MIGRATION_NAME\s*=\s*"([^"]+)"/)?.[1];
  if (!newest) {
    fail(migrationsRoot, "no migration directory exists");
  } else if (required !== newest) {
    fail(path.join(ROOT, "src", "lib", "db", "migration-state.ts"), `expected "${newest}"`);
  }

  const sql = migrations
    .map((name) => fs.readFileSync(path.join(migrationsRoot, name, "migration.sql"), "utf8"))
    .join("\n");
  for (const table of ["workspace", ...registry]) {
    if (!new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`).test(sql)) {
      fail(migrationsRoot, `RLS is not enabled on "${table}"`);
    }
    if (!new RegExp(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`).test(sql)) {
      fail(migrationsRoot, `RLS is not forced on "${table}"`);
    }
    if (!new RegExp(`ON "${table}"`).test(sql)) {
      fail(migrationsRoot, `no RLS policy for "${table}"`);
    }
  }
  if (!/REVOKE UPDATE, DELETE ON TABLE "audit_event"/.test(sql)) {
    fail(migrationsRoot, "audit_event is not append-only");
  }
  if (!/permission_grant_workspace_id_member_id_fkey/.test(sql)) {
    fail(migrationsRoot, "no composite grant/member workspace constraint");
  }
}

if (failures.length > 0) {
  console.error("Project rules failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Project rules passed.");
