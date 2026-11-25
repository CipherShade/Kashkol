-- F-P2-11 / ADR-0039: owner-requested workspace backup and restore jobs.
CREATE TYPE "workspace_archive_job_kind" AS ENUM ('backup', 'restore');
CREATE TYPE "workspace_archive_job_status" AS ENUM ('queued', 'processing', 'succeeded', 'failed');

CREATE TABLE "workspace_archive_job" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "kind" "workspace_archive_job_kind" NOT NULL,
    "status" "workspace_archive_job_status" NOT NULL DEFAULT 'queued',
    "requested_by" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "preview" JSONB,
    "result" JSONB,
    "failure_code" TEXT,
    "locked_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "workspace_archive_job_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_archive_job_workspace_id_id_key"
    ON "workspace_archive_job"("workspace_id", "id");
CREATE INDEX "workspace_archive_job_workspace_id_status_created_at_idx"
    ON "workspace_archive_job"("workspace_id", "status", "created_at");

ALTER TABLE "workspace_archive_job"
    ADD CONSTRAINT "workspace_archive_job_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workspace_archive_job" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_archive_job" FORCE ROW LEVEL SECURITY;
CREATE POLICY "workspace_archive_job_tenant_isolation" ON "workspace_archive_job"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workspace_archive_job" TO kashkol_app;
  END IF;
END $$;
