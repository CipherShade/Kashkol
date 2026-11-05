-- Forms & surveys foundation (`F-P3-09`): definitions, questions, logic, and
-- responses. Every table is tenant-scoped and protected by forced RLS.

ALTER TYPE "permission_resource" ADD VALUE 'forms';

CREATE TYPE "form_status" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "form_submission_mode" AS ENUM ('identified', 'anonymous');
CREATE TYPE "form_question_type" AS ENUM (
  'short_answer',
  'long_answer',
  'multiple_choice',
  'checkboxes',
  'dropdown',
  'number',
  'date',
  'time',
  'file_upload',
  'rating',
  'linear_scale'
);
CREATE TYPE "form_logic_operator" AS ENUM (
  'equals',
  'not_equals',
  'contains',
  'is_answered',
  'is_not_answered',
  'greater_than',
  'less_than'
);
CREATE TYPE "form_logic_action" AS ENUM ('show', 'hide', 'require');

CREATE TABLE "form" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "form_status" NOT NULL DEFAULT 'draft',
    "submission_mode" "form_submission_mode" NOT NULL DEFAULT 'identified',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "public_slug" TEXT,
    "accepting_responses" BOOLEAN NOT NULL DEFAULT true,
    "confirmation_message" TEXT,
    "settings_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_by_user_id" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "form_public_slug_key" ON "form"("public_slug");
CREATE UNIQUE INDEX "form_workspace_id_id_key" ON "form"("workspace_id", "id");
CREATE INDEX "form_workspace_id_idx" ON "form"("workspace_id");
CREATE INDEX "form_workspace_id_status_idx" ON "form"("workspace_id", "status");

ALTER TABLE "form"
    ADD CONSTRAINT "form_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form" FORCE ROW LEVEL SECURITY;

CREATE POLICY "form_tenant_isolation" ON "form"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "form_section" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order_index" INTEGER NOT NULL,
    "page_break_before" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_section_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "form_section_workspace_id_id_key" ON "form_section"("workspace_id", "id");
CREATE UNIQUE INDEX "form_section_form_id_order_index_key" ON "form_section"("form_id", "order_index");
CREATE INDEX "form_section_workspace_id_idx" ON "form_section"("workspace_id");

ALTER TABLE "form_section"
    ADD CONSTRAINT "form_section_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_section"
    ADD CONSTRAINT "form_section_workspace_id_form_id_fkey"
      FOREIGN KEY ("workspace_id", "form_id") REFERENCES "form"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_section" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_section" FORCE ROW LEVEL SECURITY;

CREATE POLICY "form_section_tenant_isolation" ON "form_section"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "form_question" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "section_id" UUID,
    "order_index" INTEGER NOT NULL,
    "question_type" "form_question_type" NOT NULL,
    "prompt" TEXT NOT NULL,
    "description" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "config_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_question_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "form_question_workspace_id_id_key" ON "form_question"("workspace_id", "id");
CREATE UNIQUE INDEX "form_question_form_id_order_index_key" ON "form_question"("form_id", "order_index");
CREATE INDEX "form_question_workspace_id_idx" ON "form_question"("workspace_id");
CREATE INDEX "form_question_form_id_idx" ON "form_question"("form_id");
CREATE INDEX "form_question_workspace_id_section_id_idx" ON "form_question"("workspace_id", "section_id");

ALTER TABLE "form_question"
    ADD CONSTRAINT "form_question_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_question"
    ADD CONSTRAINT "form_question_workspace_id_form_id_fkey"
      FOREIGN KEY ("workspace_id", "form_id") REFERENCES "form"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_question"
    ADD CONSTRAINT "form_question_workspace_id_section_id_fkey"
      FOREIGN KEY ("workspace_id", "section_id") REFERENCES "form_section"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_question" FORCE ROW LEVEL SECURITY;

CREATE POLICY "form_question_tenant_isolation" ON "form_question"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "form_question_option" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_question_option_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "form_question_option_workspace_id_id_key" ON "form_question_option"("workspace_id", "id");
CREATE UNIQUE INDEX "form_question_option_question_id_order_index_key" ON "form_question_option"("question_id", "order_index");
CREATE INDEX "form_question_option_workspace_id_idx" ON "form_question_option"("workspace_id");

ALTER TABLE "form_question_option"
    ADD CONSTRAINT "form_question_option_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_question_option"
    ADD CONSTRAINT "form_question_option_workspace_id_question_id_fkey"
      FOREIGN KEY ("workspace_id", "question_id") REFERENCES "form_question"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_question_option" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_question_option" FORCE ROW LEVEL SECURITY;

CREATE POLICY "form_question_option_tenant_isolation" ON "form_question_option"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "form_question_logic" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "source_question_id" UUID NOT NULL,
    "operator" "form_logic_operator" NOT NULL,
    "comparison_json" JSONB,
    "action" "form_logic_action" NOT NULL,
    "target_question_id" UUID,
    "target_section_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_question_logic_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form_question_logic_target_check"
      CHECK (("target_question_id" IS NOT NULL) <> ("target_section_id" IS NOT NULL))
);

CREATE UNIQUE INDEX "form_question_logic_workspace_id_id_key" ON "form_question_logic"("workspace_id", "id");
CREATE INDEX "form_question_logic_workspace_id_idx" ON "form_question_logic"("workspace_id");
CREATE INDEX "form_question_logic_form_id_idx" ON "form_question_logic"("form_id");
CREATE INDEX "form_question_logic_workspace_id_source_question_id_idx" ON "form_question_logic"("workspace_id", "source_question_id");

ALTER TABLE "form_question_logic"
    ADD CONSTRAINT "form_question_logic_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_question_logic"
    ADD CONSTRAINT "form_question_logic_workspace_id_form_id_fkey"
      FOREIGN KEY ("workspace_id", "form_id") REFERENCES "form"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_question_logic"
    ADD CONSTRAINT "form_question_logic_workspace_id_source_question_id_fkey"
      FOREIGN KEY ("workspace_id", "source_question_id") REFERENCES "form_question"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_question_logic"
    ADD CONSTRAINT "form_question_logic_workspace_id_target_question_id_fkey"
      FOREIGN KEY ("workspace_id", "target_question_id") REFERENCES "form_question"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_question_logic"
    ADD CONSTRAINT "form_question_logic_workspace_id_target_section_id_fkey"
      FOREIGN KEY ("workspace_id", "target_section_id") REFERENCES "form_section"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_question_logic" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_question_logic" FORCE ROW LEVEL SECURITY;

CREATE POLICY "form_question_logic_tenant_isolation" ON "form_question_logic"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "form_submission" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "submission_mode" "form_submission_mode" NOT NULL,
    "student_id" UUID,
    "submitted_by_user_id" TEXT,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "form_submission_workspace_id_id_key" ON "form_submission"("workspace_id", "id");
CREATE INDEX "form_submission_workspace_id_idx" ON "form_submission"("workspace_id");
CREATE INDEX "form_submission_workspace_id_form_id_submitted_at_idx" ON "form_submission"("workspace_id", "form_id", "submitted_at");
CREATE INDEX "form_submission_workspace_id_student_id_idx" ON "form_submission"("workspace_id", "student_id");

ALTER TABLE "form_submission"
    ADD CONSTRAINT "form_submission_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_submission"
    ADD CONSTRAINT "form_submission_workspace_id_form_id_fkey"
      FOREIGN KEY ("workspace_id", "form_id") REFERENCES "form"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_submission"
    ADD CONSTRAINT "form_submission_workspace_id_student_id_fkey"
      FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_submission" FORCE ROW LEVEL SECURITY;

CREATE POLICY "form_submission_tenant_isolation" ON "form_submission"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "form_answer" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "value_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_answer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "form_answer_workspace_id_id_key" ON "form_answer"("workspace_id", "id");
CREATE UNIQUE INDEX "form_answer_submission_id_question_id_key" ON "form_answer"("submission_id", "question_id");
CREATE INDEX "form_answer_workspace_id_idx" ON "form_answer"("workspace_id");
CREATE INDEX "form_answer_submission_id_idx" ON "form_answer"("submission_id");

ALTER TABLE "form_answer"
    ADD CONSTRAINT "form_answer_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_answer"
    ADD CONSTRAINT "form_answer_workspace_id_submission_id_fkey"
      FOREIGN KEY ("workspace_id", "submission_id") REFERENCES "form_submission"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_answer"
    ADD CONSTRAINT "form_answer_workspace_id_question_id_fkey"
      FOREIGN KEY ("workspace_id", "question_id") REFERENCES "form_question"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_answer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_answer" FORCE ROW LEVEL SECURITY;

CREATE POLICY "form_answer_tenant_isolation" ON "form_answer"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE TABLE "form_answer_file" (
    "workspace_id" UUID NOT NULL,
    "answer_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,

    CONSTRAINT "form_answer_file_pkey" PRIMARY KEY ("workspace_id", "answer_id", "file_id")
);

CREATE INDEX "form_answer_file_workspace_id_file_id_idx" ON "form_answer_file"("workspace_id", "file_id");

ALTER TABLE "form_answer_file"
    ADD CONSTRAINT "form_answer_file_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_answer_file"
    ADD CONSTRAINT "form_answer_file_workspace_id_answer_id_fkey"
      FOREIGN KEY ("workspace_id", "answer_id") REFERENCES "form_answer"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_answer_file"
    ADD CONSTRAINT "form_answer_file_workspace_id_file_id_fkey"
      FOREIGN KEY ("workspace_id", "file_id") REFERENCES "file"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_answer_file" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_answer_file" FORCE ROW LEVEL SECURITY;

CREATE POLICY "form_answer_file_tenant_isolation" ON "form_answer_file"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      "form",
      "form_section",
      "form_question",
      "form_question_option",
      "form_question_logic",
      "form_submission",
      "form_answer",
      "form_answer_file"
    TO kashkol_app;
  END IF;
END $$;
