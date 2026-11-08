-- Migration: 20261108000004_homework_completion_marks
--
-- Creates the homework_completion_mark table for offline homework tracking.
-- Each row records whether a student completed a homework assignment.
-- The session_id FK is optional — a homework may be tracked without a session.
--
-- RLS follows the standard tenant-isolation pattern (ADR-0006):
--   ENABLE + FORCE + policy on workspace_id.

-- PostgreSQL enum for HomeworkCompletionStatus
CREATE TYPE "homework_completion_status" AS ENUM (
    'completed',
    'not_completed',
    'not_applicable'
);

CREATE TABLE "homework_completion_mark" (
    "id"           UUID                        NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID                        NOT NULL,
    "homework_id"  UUID                        NOT NULL,
    "student_id"   UUID                        NOT NULL,
    "session_id"   UUID,
    "status"       "homework_completion_status" NOT NULL DEFAULT 'not_completed',
    "note"         TEXT,
    "recorded_by"  TEXT                        NOT NULL,
    "created_at"   TIMESTAMPTZ                 NOT NULL DEFAULT now(),
    "updated_at"   TIMESTAMPTZ                 NOT NULL DEFAULT now(),

    CONSTRAINT "homework_completion_mark_pkey" PRIMARY KEY ("id")
);

-- FK: workspace
ALTER TABLE "homework_completion_mark"
  ADD CONSTRAINT "homework_completion_mark_workspace_id_fkey"
  FOREIGN KEY ("workspace_id")
  REFERENCES "workspace" ("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- FK: homework (composite — prevents cross-workspace reference)
ALTER TABLE "homework_completion_mark"
  ADD CONSTRAINT "homework_completion_mark_workspace_id_homework_id_fkey"
  FOREIGN KEY ("workspace_id", "homework_id")
  REFERENCES "homework" ("workspace_id", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- FK: student (composite)
ALTER TABLE "homework_completion_mark"
  ADD CONSTRAINT "homework_completion_mark_workspace_id_student_id_fkey"
  FOREIGN KEY ("workspace_id", "student_id")
  REFERENCES "student" ("workspace_id", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- FK: session (composite, nullable)
ALTER TABLE "homework_completion_mark"
  ADD CONSTRAINT "homework_completion_mark_workspace_id_session_id_fkey"
  FOREIGN KEY ("workspace_id", "session_id")
  REFERENCES "teaching_session" ("workspace_id", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- One mark per student per homework (upsertable)
CREATE UNIQUE INDEX "homework_completion_mark_homework_id_student_id_key"
  ON "homework_completion_mark" ("homework_id", "student_id");

CREATE UNIQUE INDEX "homework_completion_mark_workspace_id_id_key"
  ON "homework_completion_mark" ("workspace_id", "id");

CREATE INDEX "homework_completion_mark_workspace_id_idx"
  ON "homework_completion_mark" ("workspace_id");

CREATE INDEX "homework_completion_mark_workspace_id_student_id_idx"
  ON "homework_completion_mark" ("workspace_id", "student_id");

CREATE INDEX "homework_completion_mark_session_id_idx"
  ON "homework_completion_mark" ("session_id")
  WHERE "session_id" IS NOT NULL;

-- Row-level security (ADR-0006)
ALTER TABLE "homework_completion_mark" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "homework_completion_mark" FORCE ROW LEVEL SECURITY;
CREATE POLICY "homework_completion_mark_tenant_isolation" ON "homework_completion_mark"
  USING ("workspace_id" = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK ("workspace_id" = current_setting('app.workspace_id', true)::uuid);
