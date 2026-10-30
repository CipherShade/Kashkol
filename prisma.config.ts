import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 does not load environment files implicitly (ADR-0002).
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

// `prisma generate` must work on a clean checkout and in CI where no database
// exists. The placeholder is never connected to; migration commands fail with a
// clear connection error if no real URL is configured.
const databaseUrl =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx scripts/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
