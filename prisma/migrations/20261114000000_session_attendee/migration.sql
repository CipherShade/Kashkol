-- Migration: 20261114000000_session_attendee
--
-- Sessions can now be created independent of a group, or linked to a grade
-- label instead of a group (ADR-0029, supersedes D-03's group-only one-off
-- sessions). Three modes share the same table:
--   1. group session   — group_id set (existing behaviour).
--   2. grade session  — group_id null, grade_label set; the roster is
--      snapshotted at creation from every student enrolled in a group with
--      that grade label, into `session_attendee` (origin = 'grade').
--   3. independent    — group_id null, grade_label null; starts empty and
--      the teacher adds students from the attendance screen (origin =
--      'manual').
--
-- RLS follows the standard tenant-isolation pattern (ADR-0006).

-- ---------------------------------------------------------------------------
-- 1. Enum for the attendee origin
-- ---------------------------------------------------------------------------
CREATE TYPE "session_attendee_origin" AS ENUM ('manual', 'grade');

-- ---------------------------------------------------------------------------
-- 2. Teaching sessions: group stays required for group sessions but may now
--    be null (independent / grade sessions). `grade_label` carries the grade
--    the roster was snapshotted from.
-- ---------------------------------------------------------------------------
ALTER TABLE "teaching_session" ALTER COLUMN "group_id" DROP NOT NULL;
ALTER TABLE "teaching_session" ADD COLUMN "grade_label" TEXT;

-- ---------------------------------------------------------------------------
-- 3. New table: session_attendee (the resolved roster of group-less
--    sessions; manual add/remove works for both kinds after creation)
-- ---------------------------------------------------------------------------
CREATE TABLE "session_attendee" (
    "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID        NOT NULL,
    "session_id"   UUID        NOT NULL,
    "student_id"   UUID        NOT NULL,
    "origin"       "session_attendee_origin" NOT NULL DEFAULT 'manual',
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "session_attendee_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "session_attendee"
  ADD CONSTRAINT "session_attendee_workspace_id_fkey"
  FOREIGN KEY ("workspace_id")
  REFERENCES "workspace" ("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "session_attendee"
  ADD CONSTRAINT "session_attendee_workspace_id_session_id_fkey"
  FOREIGN KEY ("workspace_id", "session_id")
  REFERENCES "teaching_session" ("workspace_id", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "session_attendee"
  ADD CONSTRAINT "session_attendee_workspace_id_student_id_fkey"
  FOREIGN KEY ("workspace_id", "student_id")
  REFERENCES "student" ("workspace_id", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX "session_attendee_workspace_id_id_key"
  ON "session_attendee" ("workspace_id", "id");

CREATE UNIQUE INDEX "session_attendee_workspace_id_session_id_student_id_key"
  ON "session_attendee" ("workspace_id", "session_id", "student_id");

CREATE INDEX "session_attendee_workspace_id_idx"
  ON "session_attendee" ("workspace_id");

CREATE INDEX "session_attendee_workspace_id_session_id_idx"
  ON "session_attendee" ("workspace_id", "session_id");

CREATE INDEX "session_attendee_workspace_id_student_id_idx"
  ON "session_attendee" ("workspace_id", "student_id");

-- ---------------------------------------------------------------------------
-- 4. Row-level security (ADR-0006) + application-role grants
-- ---------------------------------------------------------------------------
ALTER TABLE "session_attendee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_attendee" FORCE ROW LEVEL SECURITY;
CREATE POLICY "session_attendee_tenant_isolation" ON "session_attendee"
  USING ("workspace_id" = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK ("workspace_id" = current_setting('app.workspace_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "session_attendee" TO kashkol_app;
