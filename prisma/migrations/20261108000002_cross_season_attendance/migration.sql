-- Migration: 20261108000002_cross_season_attendance
--
-- Adds:
--   attendance_mark.is_cross_season  — true when the student attended a session
--     outside their primary enrolled group
--   attendance_mark.primary_group_id — the group the student is primarily
--     enrolled in at time of the cross-season attendance
--
-- A partial unique index prevents a student from having two attendance marks in
-- the same session (the base @@unique([sessionId, studentId]) already guarantees
-- this for all rows; this index is kept for query optimisation on cross-season
-- lookups only).

ALTER TABLE "attendance_mark"
  ADD COLUMN "is_cross_season" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "primary_group_id" UUID;

ALTER TABLE "attendance_mark"
  ADD CONSTRAINT "attendance_mark_workspace_id_primary_group_id_fkey"
  FOREIGN KEY ("workspace_id", "primary_group_id")
  REFERENCES "group" ("workspace_id", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- Partial index: only index cross-season marks — normal marks don't need it.
CREATE INDEX "attendance_mark_cross_season_idx"
  ON "attendance_mark" ("workspace_id", "primary_group_id")
  WHERE "is_cross_season" = TRUE;
