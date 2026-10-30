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
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["tests/integration/**", "tests/e2e/**", "node_modules/**"],
    passWithNoTests: false,
    reporters: ["default"],
    pool: "threads",
  },
});
