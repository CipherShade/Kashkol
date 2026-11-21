-- CreateTable
CREATE TABLE "report_export_queue" (
    "job_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_export_queue_pkey" PRIMARY KEY ("job_id")
);

-- CreateIndex
CREATE INDEX "report_export_queue_status_created_at_idx" ON "report_export_queue"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "report_export_queue_workspace_id_job_id_key" ON "report_export_queue"("workspace_id", "job_id");

-- CreateIndex
CREATE INDEX "file_scope_group_id_idx" ON "file"("scope", "group_id");

-- CreateIndex
CREATE INDEX "file_scope_student_id_idx" ON "file"("scope", "student_id");

-- AddForeignKey
ALTER TABLE "report_export_queue" ADD CONSTRAINT "report_export_queue_workspace_id_job_id_fkey" FOREIGN KEY ("workspace_id", "job_id") REFERENCES "report_export"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
