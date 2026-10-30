-- CreateTable
CREATE TABLE "session_revision" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "actor_id" TEXT NOT NULL,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_revision_workspace_id_id_key" ON "session_revision"("workspace_id", "id");
CREATE INDEX "session_revision_workspace_id_idx" ON "session_revision"("workspace_id");
CREATE INDEX "session_revision_session_id_created_at_idx" ON "session_revision"("session_id", "created_at");

-- AddForeignKey
ALTER TABLE "session_revision" ADD CONSTRAINT "session_revision_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "session_revision" ADD CONSTRAINT "session_revision_workspace_id_session_id_fkey" FOREIGN KEY ("workspace_id", "session_id") REFERENCES "teaching_session"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "session_revision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_revision" FORCE ROW LEVEL SECURITY;
CREATE POLICY "session_revision_tenant_isolation" ON "session_revision"
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Append-only: grant INSERT and SELECT only (no UPDATE/DELETE)
GRANT SELECT, INSERT ON TABLE "session_revision" TO kashkol_app;
REVOKE UPDATE, DELETE ON TABLE "session_revision" FROM kashkol_app;
