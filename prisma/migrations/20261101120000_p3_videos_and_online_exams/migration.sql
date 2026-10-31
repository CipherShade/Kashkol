-- P3 Recorded video via external provider (`F-P3-02`) and Online quizzes & exams (`F-P3-01`).

CREATE TYPE "video_publication_status" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "video_asset_status" AS ENUM ('pending', 'processing', 'ready', 'failed', 'unavailable');
CREATE TYPE "online_exam_status" AS ENUM ('draft', 'published', 'closed', 'archived');
CREATE TYPE "online_exam_assignment_scope" AS ENUM ('group', 'selected_students');
CREATE TYPE "online_exam_question_type" AS ENUM ('mcq_single', 'true_false', 'short_answer', 'essay');
CREATE TYPE "online_exam_result_visibility" AS ENUM ('after_manual_publish', 'immediate_after_submit', 'after_window_close');
CREATE TYPE "online_exam_attempt_status" AS ENUM ('in_progress', 'submitted', 'manual_pending', 'graded');

CREATE TABLE "video_lesson" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID,
    "subject_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "topic" TEXT,
    "scope" "file_scope" NOT NULL DEFAULT 'groups',
    "publication_status" "video_publication_status" NOT NULL DEFAULT 'draft',
    "provider" TEXT NOT NULL DEFAULT 'cloudflare_stream',
    "provider_asset_id" TEXT NOT NULL,
    "asset_status" "video_asset_status" NOT NULL DEFAULT 'pending',
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "thumbnail_path" TEXT,
    "require_signed_playback" BOOLEAN NOT NULL DEFAULT true,
    "playback_count" INTEGER NOT NULL DEFAULT 0,
    "last_verified_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_lesson_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_lesson_workspace_id_id_key" ON "video_lesson"("workspace_id", "id");
CREATE UNIQUE INDEX "video_lesson_workspace_id_provider_provider_asset_id_key" ON "video_lesson"("workspace_id", "provider", "provider_asset_id");
CREATE INDEX "video_lesson_workspace_id_idx" ON "video_lesson"("workspace_id");
CREATE INDEX "video_lesson_workspace_id_publication_status_idx" ON "video_lesson"("workspace_id", "publication_status");
CREATE INDEX "video_lesson_workspace_id_group_id_idx" ON "video_lesson"("workspace_id", "group_id");

ALTER TABLE "video_lesson"
    ADD CONSTRAINT "video_lesson_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "video_lesson"
    ADD CONSTRAINT "video_lesson_workspace_id_group_id_fkey"
      FOREIGN KEY ("workspace_id", "group_id") REFERENCES "group"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "video_lesson"
    ADD CONSTRAINT "video_lesson_workspace_id_subject_id_fkey"
      FOREIGN KEY ("workspace_id", "subject_id") REFERENCES "subject"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "video_lesson" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "video_lesson" FORCE ROW LEVEL SECURITY;

CREATE POLICY "video_lesson_tenant_isolation" ON "video_lesson"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "video_group_access" (
    "workspace_id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,

    CONSTRAINT "video_group_access_pkey" PRIMARY KEY ("workspace_id", "video_id", "group_id")
);

CREATE INDEX "video_group_access_workspace_id_group_id_idx" ON "video_group_access"("workspace_id", "group_id");

ALTER TABLE "video_group_access"
    ADD CONSTRAINT "video_group_access_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "video_group_access"
    ADD CONSTRAINT "video_group_access_workspace_id_video_id_fkey"
      FOREIGN KEY ("workspace_id", "video_id") REFERENCES "video_lesson"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "video_group_access"
    ADD CONSTRAINT "video_group_access_workspace_id_group_id_fkey"
      FOREIGN KEY ("workspace_id", "group_id") REFERENCES "group"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "video_group_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "video_group_access" FORCE ROW LEVEL SECURITY;

CREATE POLICY "video_group_access_tenant_isolation" ON "video_group_access"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "video_student_access" (
    "workspace_id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,

    CONSTRAINT "video_student_access_pkey" PRIMARY KEY ("workspace_id", "video_id", "student_id")
);

CREATE INDEX "video_student_access_workspace_id_student_id_idx" ON "video_student_access"("workspace_id", "student_id");

ALTER TABLE "video_student_access"
    ADD CONSTRAINT "video_student_access_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "video_student_access"
    ADD CONSTRAINT "video_student_access_workspace_id_video_id_fkey"
      FOREIGN KEY ("workspace_id", "video_id") REFERENCES "video_lesson"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "video_student_access"
    ADD CONSTRAINT "video_student_access_workspace_id_student_id_fkey"
      FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "video_student_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "video_student_access" FORCE ROW LEVEL SECURITY;

CREATE POLICY "video_student_access_tenant_isolation" ON "video_student_access"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "online_exam" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "assessment_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "assignment_scope" "online_exam_assignment_scope" NOT NULL DEFAULT 'group',
    "status" "online_exam_status" NOT NULL DEFAULT 'draft',
    "available_from" TIMESTAMPTZ(6) NOT NULL,
    "available_until" TIMESTAMPTZ(6) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "max_attempts" INTEGER NOT NULL DEFAULT 1,
    "result_visibility" "online_exam_result_visibility" NOT NULL DEFAULT 'after_manual_publish',
    "results_published_at" TIMESTAMPTZ(6),
    "max_score" DECIMAL(6, 2) NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "online_exam_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "online_exam_assessment_id_key" ON "online_exam"("assessment_id");
CREATE UNIQUE INDEX "online_exam_workspace_id_id_key" ON "online_exam"("workspace_id", "id");
CREATE UNIQUE INDEX "online_exam_workspace_id_assessment_id_key" ON "online_exam"("workspace_id", "assessment_id");
CREATE INDEX "online_exam_workspace_id_idx" ON "online_exam"("workspace_id");
CREATE INDEX "online_exam_workspace_id_group_id_status_idx" ON "online_exam"("workspace_id", "group_id", "status");

ALTER TABLE "online_exam"
    ADD CONSTRAINT "online_exam_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_exam"
    ADD CONSTRAINT "online_exam_workspace_id_group_id_fkey"
      FOREIGN KEY ("workspace_id", "group_id") REFERENCES "group"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_exam"
    ADD CONSTRAINT "online_exam_workspace_id_assessment_id_fkey"
      FOREIGN KEY ("workspace_id", "assessment_id") REFERENCES "assessment"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_exam" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "online_exam" FORCE ROW LEVEL SECURITY;

CREATE POLICY "online_exam_tenant_isolation" ON "online_exam"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "online_exam_student_assignment" (
    "workspace_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,

    CONSTRAINT "online_exam_student_assignment_pkey" PRIMARY KEY ("workspace_id", "exam_id", "student_id")
);

CREATE INDEX "online_exam_student_assignment_workspace_id_student_id_idx" ON "online_exam_student_assignment"("workspace_id", "student_id");

ALTER TABLE "online_exam_student_assignment"
    ADD CONSTRAINT "online_exam_student_assignment_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_exam_student_assignment"
    ADD CONSTRAINT "online_exam_student_assignment_workspace_id_exam_id_fkey"
      FOREIGN KEY ("workspace_id", "exam_id") REFERENCES "online_exam"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_exam_student_assignment"
    ADD CONSTRAINT "online_exam_student_assignment_workspace_id_student_id_fkey"
      FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_exam_student_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "online_exam_student_assignment" FORCE ROW LEVEL SECURITY;

CREATE POLICY "online_exam_student_assignment_tenant_isolation" ON "online_exam_student_assignment"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "online_exam_question" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL,
    "question_type" "online_exam_question_type" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "correct_answer_json" JSONB,
    "explanation" TEXT,
    "points" DECIMAL(6, 2) NOT NULL DEFAULT 1,
    "auto_gradable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "online_exam_question_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "online_exam_question_workspace_id_id_key" ON "online_exam_question"("workspace_id", "id");
CREATE UNIQUE INDEX "online_exam_question_exam_id_order_index_key" ON "online_exam_question"("exam_id", "order_index");
CREATE INDEX "online_exam_question_workspace_id_idx" ON "online_exam_question"("workspace_id");
CREATE INDEX "online_exam_question_exam_id_idx" ON "online_exam_question"("exam_id");

ALTER TABLE "online_exam_question"
    ADD CONSTRAINT "online_exam_question_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_exam_question"
    ADD CONSTRAINT "online_exam_question_workspace_id_exam_id_fkey"
      FOREIGN KEY ("workspace_id", "exam_id") REFERENCES "online_exam"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_exam_question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "online_exam_question" FORCE ROW LEVEL SECURITY;

CREATE POLICY "online_exam_question_tenant_isolation" ON "online_exam_question"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "online_exam_attempt" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "online_exam_attempt_status" NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline_at" TIMESTAMPTZ(6) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "submission_idempotency_key" TEXT,
    "auto_score" DECIMAL(6, 2) NOT NULL DEFAULT 0,
    "manual_score" DECIMAL(6, 2),
    "total_score" DECIMAL(6, 2),
    "graded_at" TIMESTAMPTZ(6),
    "graded_by_user_id" TEXT,
    "grading_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "online_exam_attempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "online_exam_attempt_workspace_id_id_key" ON "online_exam_attempt"("workspace_id", "id");
CREATE UNIQUE INDEX "online_exam_attempt_exam_id_student_id_attempt_number_key" ON "online_exam_attempt"("exam_id", "student_id", "attempt_number");
CREATE INDEX "online_exam_attempt_workspace_id_idx" ON "online_exam_attempt"("workspace_id");
CREATE INDEX "online_exam_attempt_exam_id_student_id_idx" ON "online_exam_attempt"("exam_id", "student_id");

ALTER TABLE "online_exam_attempt"
    ADD CONSTRAINT "online_exam_attempt_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_exam_attempt"
    ADD CONSTRAINT "online_exam_attempt_workspace_id_exam_id_fkey"
      FOREIGN KEY ("workspace_id", "exam_id") REFERENCES "online_exam"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_exam_attempt"
    ADD CONSTRAINT "online_exam_attempt_workspace_id_student_id_fkey"
      FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_exam_attempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "online_exam_attempt" FORCE ROW LEVEL SECURITY;

CREATE POLICY "online_exam_attempt_tenant_isolation" ON "online_exam_attempt"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "online_exam_response" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "answer_json" JSONB NOT NULL,
    "is_correct" BOOLEAN,
    "auto_awarded_points" DECIMAL(6, 2),
    "manual_awarded_points" DECIMAL(6, 2),
    "teacher_feedback" TEXT,
    "saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "online_exam_response_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "online_exam_response_workspace_id_id_key" ON "online_exam_response"("workspace_id", "id");
CREATE UNIQUE INDEX "online_exam_response_attempt_id_question_id_key" ON "online_exam_response"("attempt_id", "question_id");
CREATE INDEX "online_exam_response_workspace_id_idx" ON "online_exam_response"("workspace_id");
CREATE INDEX "online_exam_response_attempt_id_idx" ON "online_exam_response"("attempt_id");

ALTER TABLE "online_exam_response"
    ADD CONSTRAINT "online_exam_response_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_exam_response"
    ADD CONSTRAINT "online_exam_response_workspace_id_attempt_id_fkey"
      FOREIGN KEY ("workspace_id", "attempt_id") REFERENCES "online_exam_attempt"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_exam_response"
    ADD CONSTRAINT "online_exam_response_workspace_id_question_id_fkey"
      FOREIGN KEY ("workspace_id", "question_id") REFERENCES "online_exam_question"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "online_exam_response" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "online_exam_response" FORCE ROW LEVEL SECURITY;

CREATE POLICY "online_exam_response_tenant_isolation" ON "online_exam_response"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      "video_lesson",
      "video_group_access",
      "video_student_access",
      "online_exam",
      "online_exam_student_assignment",
      "online_exam_question",
      "online_exam_attempt",
      "online_exam_response"
    TO kashkol_app;
  END IF;
END $$;
