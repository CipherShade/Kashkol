-- Forms public lifecycle (`F-P3-12`): public form viewing and submission without workspace context.
-- Makes form data available to unauthenticated visitors under controlled read policies,
-- adds file provenance tracking for public submissions, and enforces idempotency via
-- submission tokens and deduplication keys.

-- ---------------------------------------------------------------------------
-- Helper: safe public-form ID function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "current_public_form_id"()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT nullif(current_setting('app.public_form_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- Form table: tighten RLS to force closed state for draft/archived/private
-- ---------------------------------------------------------------------------
ALTER TABLE "form" ENABLE ROW LEVEL SECURITY;

-- Public policy: only visible when form is published, accepting responses, not archived.
-- The function current_public_form_id() returns NULL when no scope is set; this
-- policy always returns false when the config is unset, matching zero rows and
-- yielding the closed-404 behaviour described in ADR-0023.
CREATE POLICY "form_public_read" ON "form"
    USING ("is_public" = true AND "status" = 'published' AND "accepting_responses" = true AND "archived_at" IS NULL AND "id" = "current_public_form_id"())
    WITH CHECK ("is_public" = true AND "status" = 'published' AND "accepting_responses" = true AND "archived_at" IS NULL AND "id" = "current_public_form_id"());

-- ---------------------------------------------------------------------------
-- Form section: public scope via parent form visibility
-- ---------------------------------------------------------------------------
ALTER TABLE "form_section" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_section_public_read" ON "form_section"
    USING (
        "form_id" IN (
            SELECT "id" FROM "form" WHERE "is_public" = true AND "status" = 'published' AND "accepting_responses" = true AND "archived_at" IS NULL
        )
    )
    WITH CHECK (
        "form_id" IN (
            SELECT "id" FROM "form" WHERE "is_public" = true AND "status" = 'published' AND "accepting_responses" = true AND "archived_at" IS NULL
        )
    );

-- ---------------------------------------------------------------------------
-- Form question: public scope via parent form visibility
-- ---------------------------------------------------------------------------
ALTER TABLE "form_question" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_question_public_read" ON "form_question"
    USING (
        "form_id" IN (
            SELECT "id" FROM "form" WHERE "is_public" = true AND "status" = 'published' AND "accepting_responses" = true AND "archived_at" IS NULL
        )
    )
    WITH CHECK (
        "form_id" IN (
            SELECT "id" FROM "form" WHERE "is_public" = true AND "status" = 'published' AND "accepting_responses" = true AND "archived_at" IS NULL
        )
    );

-- ---------------------------------------------------------------------------
-- Form question option: public scope via parent question
-- ---------------------------------------------------------------------------
ALTER TABLE "form_question_option" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_question_option_public_read" ON "form_question_option"
    USING (
        "question_id" IN (
            SELECT "id" FROM "form_question" WHERE "form_id" IN (
                SELECT "id" FROM "form" WHERE "is_public" = true AND "status" = 'published' AND "accepting_responses" = true AND "archived_at" IS NULL
            )
        )
    )
    WITH CHECK (
        "question_id" IN (
            SELECT "id" FROM "form_question" WHERE "form_id" IN (
                SELECT "id" FROM "form" WHERE "is_public" = true AND "status" = 'published' AND "accepting_responses" = true AND "archived_at" IS NULL
            )
        )
    );

-- ---------------------------------------------------------------------------
-- Form question logic: public scope via parent form visibility
-- ---------------------------------------------------------------------------
ALTER TABLE "form_question_logic" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_question_logic_public_read" ON "form_question_logic"
    USING (
        "form_id" IN (
            SELECT "id" FROM "form" WHERE "is_public" = true AND "status" = 'published' AND "accepting_responses" = true AND "archived_at" IS NULL
        )
    )
    WITH CHECK (
        "form_id" IN (
            SELECT "id" FROM "form" WHERE "is_public" = true AND "status" = 'published' AND "accepting_responses" = true AND "archived_at" IS NULL
        )
    );

-- ---------------------------------------------------------------------------
-- Form submission: add submission_token and dedupe_key columns + unique indexes
-- ---------------------------------------------------------------------------
-- NOTE: columns may already exist if the uncommitted schema diff was applied.
-- Adding them here ensures the migration is self-contained.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'form_submission'::regclass AND attname = 'submission_token') THEN
    ALTER TABLE "form_submission" ADD COLUMN "submission_token" UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'form_submission'::regclass AND attname = 'dedupe_key') THEN
    ALTER TABLE "form_submission" ADD COLUMN "dedupe_key" UUID;
  END IF;
END
$$;

CREATE UNIQUE INDEX "form_submission_submission_token_key" ON "form_submission"("submission_token");
CREATE UNIQUE INDEX "form_submission_workspace_id_dedupe_key_unique" ON "form_submission"("workspace_id", "dedupe_key");

-- ---------------------------------------------------------------------------
-- Form upload table: provenance tracking for public submissions
-- ---------------------------------------------------------------------------
CREATE TABLE "form_upload" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "upload_session_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_upload_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "form_upload" ENABLE ROW LEVEL SECURITY;

-- Provenance policy: only rows whose parent form is published and accepting responses
CREATE POLICY "form_upload_public_read" ON "form_upload"
    USING (
        "form_id" IN (
            SELECT "id" FROM "form" WHERE "is_public" = true AND "status" = 'published' AND "accepting_responses" = true AND "archived_at" IS NULL
        )
    )
    WITH CHECK (
        "form_id" IN (
            SELECT "id" FROM "form" WHERE "is_public" = true AND "status" = 'published' AND "accepting_responses" = true AND "archived_at" IS NULL
        )
    );

-- ---------------------------------------------------------------------------
-- File model: add form_uploads collection and index references
-- ---------------------------------------------------------------------------
ALTER TABLE "file" ADD COLUMN "form_uploads" UUID[];  -- not used in RLS, just schema alignment

-- ---------------------------------------------------------------------------
-- Form answer file: ensure unique (workspace_id, file_id) constraint
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'form_answer_file_workspace_id_file_id_key' AND n.nspname = 'public') THEN
    CREATE UNIQUE INDEX "form_answer_file_workspace_id_file_id_key" ON "form_answer_file"("workspace_id", "file_id");
  END IF;
END
$$;

-- Grant access to the app role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT ON TABLE "form_upload" TO kashkol_app;
    -- form_submission SELECT is already covered by prior grants
  END IF;
END
$$;