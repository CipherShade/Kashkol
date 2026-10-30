import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Component tests run with the plain Node condition (no `react-server`) so
 * `react-dom/server` can render the server-safe primitives to static markup.
 * The main unit config keeps the `react-server` condition for server modules.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "server-only": path.resolve(process.cwd(), "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/ui/**/*.test.tsx"],
    passWithNoTests: false,
    reporters: ["default"],
    pool: "threads",
  },
});
