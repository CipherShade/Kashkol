-- The scheduling work added room, location, notes, teacher/assistant assignment,
-- series grouping, and start/completion timestamps to `TeachingSession` in
-- `prisma/schema.prisma`, but no migration ever created them. The database and
-- the schema had drifted, which blocked every integration test that creates a
-- session (`portals-access`, `search`, `students-groups`, `workspace-authorization`).
--
-- The foreign-key behaviour is unchanged: `teacher_id` and `assistant_id` are
-- actor ids stored as TEXT (matching the rest of the model), and `series_id` is an
-- opaque UUID grouping key with no separate series table.
ALTER TABLE "teaching_session"
    ADD COLUMN "room" TEXT,
    ADD COLUMN "location" TEXT,
    ADD COLUMN "notes" TEXT,
    ADD COLUMN "teacher_id" TEXT,
    ADD COLUMN "assistant_id" TEXT,
    ADD COLUMN "series_id" UUID,
    ADD COLUMN "occurrence_no" INTEGER,
    ADD COLUMN "started_at" TIMESTAMPTZ(6),
    ADD COLUMN "completed_at" TIMESTAMPTZ(6);

CREATE INDEX "teaching_session_series_id_idx" ON "teaching_session"("series_id");
