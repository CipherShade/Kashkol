-- F-P2-03: students attach scanned files to their own homework submission.
-- A submission file carries no group/student target on `file` itself; the
-- owning student is recorded by the submission-file join.
ALTER TABLE "file" DROP CONSTRAINT "file_scope_check";

ALTER TABLE "file" ADD CONSTRAINT "file_scope_check" CHECK (
  (("scope" = 'teacher_only'::"file_scope") AND "group_id" IS NULL AND "student_id" IS NULL)
  OR (("scope" = 'groups'::"file_scope") AND "group_id" IS NOT NULL AND "student_id" IS NULL)
  OR (("scope" = 'students'::"file_scope") AND "student_id" IS NOT NULL AND "group_id" IS NULL)
  OR (("scope" = 'form_upload'::"file_scope") AND "group_id" IS NULL AND "student_id" IS NULL)
  OR (("scope" = 'homework_submission'::"file_scope") AND "group_id" IS NULL AND "student_id" IS NULL)
);

CREATE TABLE "homework_submission_file" (
    "workspace_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_submission_file_pkey" PRIMARY KEY ("workspace_id", "submission_id", "file_id")
);

ALTER TABLE "homework_submission_file"
    ADD CONSTRAINT "homework_submission_file_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "homework_submission_file"
    ADD CONSTRAINT "homework_submission_file_workspace_id_submission_id_fkey"
      FOREIGN KEY ("workspace_id", "submission_id") REFERENCES "homework_submission"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "homework_submission_file"
    ADD CONSTRAINT "homework_submission_file_workspace_id_file_id_fkey"
      FOREIGN KEY ("workspace_id", "file_id") REFERENCES "file"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "homework_submission_file_workspace_id_file_id_idx"
    ON "homework_submission_file"("workspace_id", "file_id");

ALTER TABLE "homework_submission_file" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "homework_submission_file" FORCE ROW LEVEL SECURITY;
CREATE POLICY "homework_submission_file_tenant_isolation" ON "homework_submission_file"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "homework_submission_file" TO kashkol_app;
  END IF;
END $$;
