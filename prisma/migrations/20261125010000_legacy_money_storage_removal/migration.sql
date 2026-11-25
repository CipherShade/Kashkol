-- Migration: 20261125010000_legacy_money_storage_removal
--
-- ADR-0043: the owner approved permanent removal of legacy workspace money
-- storage. Only collected session receipts remain. Platform billing is not
-- touched. This migration is deliberately destructive for the removed concepts;
-- it is not reversible from the application.
--
-- Row-level security is disabled only for the explicit data cleanup below and
-- restored with FORCE before the migration ends.

-- ---------------------------------------------------------------------------
-- 1. Drop removed money tables and their enum.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS "payment_revision";
DROP TABLE IF EXISTS "payment_adjustment";
DROP TABLE IF EXISTS "fee_rule";
DROP TYPE IF EXISTS "payment_adjustment_kind";

-- ---------------------------------------------------------------------------
-- 2. Reduce payment to collected session receipts.
-- ---------------------------------------------------------------------------

ALTER TABLE "payment" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "payment" DISABLE TRIGGER "payment_append_only";

-- Non-session rows and voided rows are legacy money concepts, not collected
-- session earnings. The append-only trigger is paused solely for this migration.
DELETE FROM "payment"
WHERE "session_id" IS NULL OR "voided_at" IS NOT NULL;

ALTER TABLE "payment" ENABLE TRIGGER "payment_append_only";

ALTER TABLE "payment"
  DROP CONSTRAINT IF EXISTS "payment_session_required_check",
  DROP CONSTRAINT IF EXISTS "payment_workspace_id_student_id_fkey",
  DROP COLUMN IF EXISTS "student_id",
  DROP COLUMN IF EXISTS "period",
  DROP COLUMN IF EXISTS "purpose",
  DROP COLUMN IF EXISTS "reference_number",
  DROP COLUMN IF EXISTS "voided_at",
  DROP COLUMN IF EXISTS "void_reason",
  ALTER COLUMN "session_id" SET NOT NULL;

-- The old composite unique index and the partial session index belonged to the
-- student/void model. The current schema has one required session per receipt.
DROP INDEX IF EXISTS "payment_workspace_id_id_student_id_key";
DROP INDEX IF EXISTS "payment_workspace_id_session_id_idx";
CREATE INDEX "payment_workspace_id_session_id_idx"
  ON "payment"("workspace_id", "session_id");

ALTER TABLE "payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Drop group default price storage.
-- ---------------------------------------------------------------------------

ALTER TABLE "group" DROP COLUMN IF EXISTS "default_price_per_student_minor";

-- ---------------------------------------------------------------------------
-- 4. Remove money notification storage from data, settings, and the enum.
-- ---------------------------------------------------------------------------

ALTER TABLE "notification" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_log" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "message_outbox" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_settings" DISABLE ROW LEVEL SECURITY;

DELETE FROM "notification_log"
WHERE "outbox_id" IN (
  SELECT "id" FROM "message_outbox" WHERE "type" = 'payment_overdue'
);
DELETE FROM "notification" WHERE "type" = 'payment_overdue';
DELETE FROM "message_outbox" WHERE "type" = 'payment_overdue';

UPDATE "workspace_settings"
SET "notification_rule_config" =
  COALESCE("notification_rule_config", '{}'::jsonb)
    - 'paymentOverdueEnabled'
    - 'paymentOverdueDays'
WHERE "notification_rule_config" ?| ARRAY['paymentOverdueEnabled', 'paymentOverdueDays'];

ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification" FORCE ROW LEVEL SECURITY;
ALTER TABLE "notification_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_log" FORCE ROW LEVEL SECURITY;
ALTER TABLE "message_outbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_outbox" FORCE ROW LEVEL SECURITY;
ALTER TABLE "workspace_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_settings" FORCE ROW LEVEL SECURITY;

ALTER TYPE "notification_type" RENAME TO "notification_type_legacy";
CREATE TYPE "notification_type" AS ENUM (
  'attendance_present',
  'attendance_absent',
  'attendance_late',
  'attendance_excused',
  'session_cancelled',
  'session_rescheduled',
  'homework_assigned',
  'homework_reminder',
  'exam_result',
  'student_at_risk',
  'session_unrecorded',
  'homework_due_soon',
  'assessment_pending_grades',
  'backup_ready',
  'export_ready',
  'general'
);
ALTER TABLE "notification"
  ALTER COLUMN "type" TYPE "notification_type"
  USING "type"::text::"notification_type";
ALTER TABLE "message_outbox"
  ALTER COLUMN "type" TYPE "notification_type"
  USING "type"::text::"notification_type";
DROP TYPE "notification_type_legacy";

-- ---------------------------------------------------------------------------
-- 5. Remove the money permission resource and any historical grant rows.
-- ---------------------------------------------------------------------------

ALTER TABLE "permission_grant" DISABLE ROW LEVEL SECURITY;
DELETE FROM "permission_grant" WHERE "resource" = 'payments';
ALTER TABLE "permission_grant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permission_grant" FORCE ROW LEVEL SECURITY;

ALTER TYPE "permission_resource" RENAME TO "permission_resource_legacy";
CREATE TYPE "permission_resource" AS ENUM (
  'students',
  'grades',
  'groups',
  'sessions',
  'attendance',
  'homework',
  'files',
  'messages',
  'exports',
  'integrations',
  'settings',
  'team',
  'audit',
  'forms',
  'portal_access'
);
ALTER TABLE "permission_grant"
  ALTER COLUMN "resource" TYPE "permission_resource"
  USING "resource"::text::"permission_resource";
DROP TYPE "permission_resource_legacy";

-- ---------------------------------------------------------------------------
-- 6. Remove the stale balances export type and allow the current report set.
-- ---------------------------------------------------------------------------

ALTER TABLE "report_export" DISABLE ROW LEVEL SECURITY;
DELETE FROM "report_export" WHERE "type" = 'balances';
ALTER TABLE "report_export" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_export" FORCE ROW LEVEL SECURITY;

ALTER TABLE "report_export" DROP CONSTRAINT IF EXISTS "report_export_type_check";
ALTER TABLE "report_export"
  ADD CONSTRAINT "report_export_type_check"
  CHECK ("type" IN (
    'attendance',
    'enrollment',
    'academics',
    'homework',
    'payments',
    'sessionRevenue'
  ));
