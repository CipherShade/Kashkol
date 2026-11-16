-- Migration: 20261116000000_notifications_substrate_reconciliation
--
-- Reconciles the notification schema with DATA_MODEL.md §5.9 and
-- ARCHITECTURE.md §15 for the in-app notification substrate (F-P0-10, F-P2-07):
--   1. Adds `notification_severity` enum ('info', 'warning', 'critical').
--   2. Adds teacher/operational alert values to `notification_type`.
--   3. Adds `recipient_user_id`, `severity`, `message_key`, `message_params`,
--      and `dedupe_key` to `notification`.
--   4. Makes `student_id`, `title`, and `body` nullable so teacher/system alerts
--      can exist without a student and can use locale-independent message keys.
--   5. Adds unique index on `(workspace_id, recipient_user_id, dedupe_key)` for
--      database-enforced idempotency and cooldowns.
--   6. Adds foreign key from `recipient_user_id` to `user(id)`.

-- ---------------------------------------------------------------------------
-- 1. Create severity enum
-- ---------------------------------------------------------------------------
CREATE TYPE "notification_severity" AS ENUM ('info', 'warning', 'critical');

-- ---------------------------------------------------------------------------
-- 2. Extend notification_type enum
-- ---------------------------------------------------------------------------
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'student_at_risk';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'session_unrecorded';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'homework_due_soon';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'assessment_pending_grades';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'backup_ready';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'export_ready';

-- ---------------------------------------------------------------------------
-- 3. Alter notification table columns
-- ---------------------------------------------------------------------------
ALTER TABLE "notification"
  ADD COLUMN IF NOT EXISTS "recipient_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "severity" "notification_severity" NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS "message_key" TEXT,
  ADD COLUMN IF NOT EXISTS "message_params" JSONB,
  ADD COLUMN IF NOT EXISTS "dedupe_key" TEXT;

ALTER TABLE "notification" ALTER COLUMN "student_id" DROP NOT NULL;
ALTER TABLE "notification" ALTER COLUMN "title" DROP NOT NULL;
ALTER TABLE "notification" ALTER COLUMN "body" DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Indexes & Constraints
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "notification_workspace_id_recipient_user_id_idx"
  ON "notification"("workspace_id", "recipient_user_id");

CREATE INDEX IF NOT EXISTS "notification_workspace_id_recipient_user_id_read_at_idx"
  ON "notification"("workspace_id", "recipient_user_id", "read_at");

CREATE UNIQUE INDEX IF NOT EXISTS "notification_workspace_id_recipient_user_id_dedupe_key_key"
  ON "notification"("workspace_id", "recipient_user_id", "dedupe_key")
  WHERE "recipient_user_id" IS NOT NULL AND "dedupe_key" IS NOT NULL;

ALTER TABLE "notification"
  DROP CONSTRAINT IF EXISTS "notification_recipient_user_id_fkey",
  ADD CONSTRAINT "notification_recipient_user_id_fkey"
  FOREIGN KEY ("recipient_user_id")
  REFERENCES "user"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
