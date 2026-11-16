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
      // next-intl's navigation factory imports Next's client router; the UI
      // suite renders under Node where those entry points do not resolve.
      "next/navigation": path.resolve(process.cwd(), "tests/stubs/next-navigation.ts"),
      "next/link": path.resolve(process.cwd(), "tests/stubs/next-link.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/ui/**/*.test.tsx"],
    passWithNoTests: false,
    reporters: ["default"],
    pool: "threads",
    // next-intl is inlined so the `next/navigation` and `next/link` aliases
    // above apply to its own imports instead of Node resolving them directly.
    server: { deps: { inline: ["next-intl"] } },
  },
});
