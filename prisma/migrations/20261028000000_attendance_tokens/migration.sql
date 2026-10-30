-- CreateTable
CREATE TABLE "attendance_token" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "rotated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_token_workspace_id_id_key" ON "attendance_token"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "attendance_token_workspace_id_idx" ON "attendance_token"("workspace_id");

-- CreateIndex
CREATE INDEX "attendance_token_token_hash_idx" ON "attendance_token"("token_hash");

-- CreateIndex
CREATE INDEX "attendance_token_session_id_expires_at_idx" ON "attendance_token"("session_id", "expires_at");

-- AddForeignKey
ALTER TABLE "attendance_token" ADD CONSTRAINT "attendance_token_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_token" ADD CONSTRAINT "attendance_token_workspace_id_session_id_fkey" FOREIGN KEY ("workspace_id", "session_id") REFERENCES "teaching_session"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "attendance_token" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_token" FORCE ROW LEVEL SECURITY;

-- CreatePolicy
CREATE POLICY "attendance_token_tenant_isolation" ON "attendance_token"
    USING ("workspace_id" = current_workspace_id())
    WITH CHECK ("workspace_id" = current_workspace_id());

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "attendance_token" TO kashkol_app;
