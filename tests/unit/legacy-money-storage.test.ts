import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TENANT_TABLES } from "@/lib/db/tenant-tables";
import { notificationRuleConfigSchema } from "@/modules/notifications/settings";
import { PERMISSION_RESOURCES } from "@/modules/tenancy/types";
import { ARCHIVE_TABLES, RETAINED_TABLES } from "@/modules/workspace-backup/tables";

const LEGACY_MONEY_TABLES = ["payment_adjustment", "fee_rule", "payment_revision"] as const;

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20261125010000_legacy_money_storage_removal/migration.sql",
  ),
  "utf8",
);

describe("legacy workspace money storage is physically removed", () => {
  it("removes the legacy tables from the tenant registry", () => {
    for (const table of LEGACY_MONEY_TABLES) {
      expect(TENANT_TABLES).not.toContain(table);
      expect(RETAINED_TABLES.has(table)).toBe(false);
      expect(ARCHIVE_TABLES).not.toContain(table);
    }
    expect(RETAINED_TABLES.has("payment")).toBe(true);
  });

  it("has no money permission resource", () => {
    expect(PERMISSION_RESOURCES as readonly string[]).not.toContain("payments");
  });

  it("exposes only the four non-money notification rules", () => {
    const keys = Object.keys(notificationRuleConfigSchema.shape);
    expect(keys).toEqual([
      "atRiskEnabled",
      "unrecordedSessionEnabled",
      "homeworkDueSoonEnabled",
      "assessmentPendingGradesEnabled",
      "cooldownHours",
    ]);
    expect(keys.some((key) => key.toLowerCase().includes("payment"))).toBe(false);
  });

  it("drops the legacy tables, columns, enum values, and grant rows in the migration", () => {
    expect(migrationSql).toContain('DROP TABLE IF EXISTS "payment_adjustment"');
    expect(migrationSql).toContain('DROP TABLE IF EXISTS "fee_rule"');
    expect(migrationSql).toContain('DROP TABLE IF EXISTS "payment_revision"');
    expect(migrationSql).toContain('DROP COLUMN IF EXISTS "voided_at"');
    expect(migrationSql).toContain('DROP COLUMN IF EXISTS "default_price_per_student_minor"');
    expect(migrationSql).toContain("WHERE \"resource\" = 'payments'");
    expect(migrationSql).toContain("DELETE FROM \"notification\" WHERE \"type\" = 'payment_overdue'");
    expect(migrationSql).not.toMatch(
      /CREATE TYPE "notification_type"[\s\S]*?'payment_overdue'[\s\S]*?\);/,
    );
  });
});
