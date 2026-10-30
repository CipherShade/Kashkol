CREATE TYPE "report_export_status" AS ENUM ('queued', 'processing', 'ready', 'failed');

CREATE TABLE "report_export" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "status" "report_export_status" NOT NULL DEFAULT 'queued',
    "requested_by" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storage_key" TEXT,
    "failure_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "report_export_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "report_export_type_check"
      CHECK ("type" IN ('attendance', 'enrollment', 'academics', 'homework', 'payments', 'balances'))
);

CREATE UNIQUE INDEX "report_export_workspace_id_id_key"
    ON "report_export"("workspace_id", "id");

CREATE TABLE "report_export_queue" (
    "job_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_export_queue_pkey" PRIMARY KEY ("job_id"),
    CONSTRAINT "report_export_queue_status_check"
      CHECK ("status" IN ('queued', 'processing')),
    CONSTRAINT "report_export_queue_report_fkey"
      FOREIGN KEY ("workspace_id", "job_id")
      REFERENCES "report_export"("workspace_id", "id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "report_export"
    ADD CONSTRAINT "report_export_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "report_export_workspace_id_created_at_idx"
    ON "report_export"("workspace_id", "created_at");
CREATE INDEX "report_export_queue_status_created_at_idx"
    ON "report_export_queue"("status", "created_at");

ALTER TABLE "report_export" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_export" FORCE ROW LEVEL SECURITY;
CREATE POLICY "report_export_tenant_isolation" ON "report_export"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE "report_export" TO kashkol_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "report_export_queue" TO kashkol_app;
  END IF;
END $$;
