import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

const prismaImportRestrictions = [
  "error",
  {
    paths: [
      {
        name: "@prisma/client",
        message: "Import Prisma only from src/lib/db/ or src/modules/*/repository.ts (ADR-0006).",
      },
      {
        name: "prisma",
        message: "Import Prisma only from src/lib/db/ or src/modules/*/repository.ts (ADR-0006).",
      },
      {
        name: "@/generated/prisma",
        message:
          "Import the generated Prisma client only from src/lib/db/ or src/modules/*/repository.ts (ADR-0006).",
      },
    ],
    patterns: [
      {
        group: ["@prisma/client/*", "prisma/*", "@/generated/prisma/*"],
        message: "Import Prisma only from src/lib/db/ or src/modules/*/repository.ts (ADR-0006).",
      },
    ],
  },
];

const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "coverage/**",
      ".data/**",
      "src/generated/**",
      "next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...nextVitals,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-restricted-imports": prismaImportRestrictions,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["src/lib/db/**/*.ts", "src/modules/*/repository.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["scripts/**/*.{ts,mjs}", "prisma.config.ts", "*.mjs"],
    rules: {
      "no-console": "off",
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["**/*.test.ts", "tests/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
];

export default config;
