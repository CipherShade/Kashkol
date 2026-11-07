-- Phase 2 reconciliation for the public forms lifecycle (`F-P3-12`).
--
-- The previous migration (`20261106120000_forms_public_lifecycle`) created
-- `form_upload` and the submission idempotency columns, but the physical schema
-- drifted from `prisma/schema.prisma`:
--   - `form_upload` never had FORCE ROW LEVEL SECURITY, its tenant foreign keys,
--     its unique `(workspace_id, file_id)` constraint, or its declared indexes.
--   - `form_submission` used a global `submission_token` unique index and a
--     workspace-scoped `dedupe_key` unique index instead of the form-scoped
--     indexes the service queries with.
--   - `dedupe_key` was created as UUID while the shared Zod schema accepts an
--     opaque 8-128 character string.
--   - The migration added an unused `file.form_uploads` UUID[] column.
--   - The application role was granted only SELECT on `form_upload`, so the
--     upload route could not record provenance.
--
-- This migration is additive and idempotent where PostgreSQL allows it.

-- ---------------------------------------------------------------------------
-- 1. Forced row-level security for the public upload provenance table
-- ---------------------------------------------------------------------------
ALTER TABLE "form_upload" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Submission idempotency: form-scoped keys
-- ---------------------------------------------------------------------------
-- `dedupe_key` carries a client-supplied opaque value, not a UUID.
ALTER TABLE "form_submission"
    ALTER COLUMN "dedupe_key" TYPE TEXT USING "dedupe_key"::text;

DROP INDEX IF EXISTS "form_submission_submission_token_key";
DROP INDEX IF EXISTS "form_submission_workspace_id_dedupe_key_unique";

CREATE UNIQUE INDEX "form_submission_form_id_submission_token_key"
    ON "form_submission"("form_id", "submission_token");
CREATE UNIQUE INDEX "form_submission_form_id_dedupe_key_key"
    ON "form_submission"("form_id", "dedupe_key");

-- ---------------------------------------------------------------------------
-- 3. Public upload provenance: tenant foreign keys and lookup indexes
-- ---------------------------------------------------------------------------
ALTER TABLE "form_upload"
    ADD CONSTRAINT "form_upload_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_upload"
    ADD CONSTRAINT "form_upload_workspace_id_form_id_fkey"
      FOREIGN KEY ("workspace_id", "form_id") REFERENCES "form"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_upload"
    ADD CONSTRAINT "form_upload_workspace_id_question_id_fkey"
      FOREIGN KEY ("workspace_id", "question_id") REFERENCES "form_question"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "form_upload"
    ADD CONSTRAINT "form_upload_workspace_id_file_id_fkey"
      FOREIGN KEY ("workspace_id", "file_id") REFERENCES "file"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "form_upload_workspace_id_file_id_key"
    ON "form_upload"("workspace_id", "file_id");
CREATE INDEX "form_upload_workspace_id_idx" ON "form_upload"("workspace_id");
CREATE INDEX "form_upload_workspace_id_form_id_idx" ON "form_upload"("workspace_id", "form_id");
CREATE INDEX "form_upload_workspace_id_question_id_idx" ON "form_upload"("workspace_id", "question_id");
CREATE INDEX "form_upload_form_id_upload_session_hash_idx"
    ON "form_upload"("form_id", "upload_session_hash");

-- ---------------------------------------------------------------------------
-- 4. Remove the unused column introduced by the previous migration
-- ---------------------------------------------------------------------------
ALTER TABLE "file" DROP COLUMN IF EXISTS "form_uploads";

-- ---------------------------------------------------------------------------
-- 5. The upload route writes provenance; SELECT alone is not enough
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "form_upload" TO kashkol_app;
  END IF;
END
$$;
