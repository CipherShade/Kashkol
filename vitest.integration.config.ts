import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "server-only": path.resolve(process.cwd(), "tests/stubs/server-only.ts"),
    },
    conditions: ["react-server", "node"],
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["tests/unit/**", "tests/e2e/**", "node_modules/**"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    passWithNoTests: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ["default"],
    pool: "threads",
  },
});
