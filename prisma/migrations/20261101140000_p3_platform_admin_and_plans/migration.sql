-- P3 Platform Administration (`F-P3-03`) and Workspace Plans & Limits (`F-P3-04`).

CREATE TYPE "workspace_plan_tier" AS ENUM ('pilot', 'standard', 'expanded');
CREATE TYPE "workspace_plan_status" AS ENUM ('pilot_active', 'active', 'past_due', 'suspended', 'cancelled');

ALTER TABLE "workspace"
  ADD COLUMN "plan_tier" "workspace_plan_tier" NOT NULL DEFAULT 'pilot',
  ADD COLUMN "plan_status" "workspace_plan_status" NOT NULL DEFAULT 'pilot_active',
  ADD COLUMN "plan_limit_overrides" JSONB,
  ADD COLUMN "plan_assigned_at" TIMESTAMPTZ(6),
  ADD COLUMN "plan_assigned_by" TEXT,
  ADD COLUMN "plan_note" TEXT,
  ADD COLUMN "status_reason" TEXT,
  ADD COLUMN "status_updated_at" TIMESTAMPTZ(6),
  ADD COLUMN "status_updated_by" TEXT;

CREATE TABLE "platform_admin" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "granted_by_user_id" TEXT,
    "grant_reason" TEXT NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_user_id" TEXT,
    "revoke_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_admin_user_id_key" ON "platform_admin"("user_id");
CREATE INDEX "platform_admin_user_id_revoked_at_idx" ON "platform_admin"("user_id", "revoked_at");

ALTER TABLE "platform_admin"
    ADD CONSTRAINT "platform_admin_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "user"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "platform_audit_event" (
    "id" UUID NOT NULL,
    "actor_user_id" TEXT,
    "actor_display_name" TEXT NOT NULL,
    "target_workspace_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "diff" JSONB,
    "request_id" TEXT NOT NULL,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_audit_event_created_at_idx" ON "platform_audit_event"("created_at");
CREATE INDEX "platform_audit_event_target_workspace_id_created_at_idx" ON "platform_audit_event"("target_workspace_id", "created_at");
CREATE INDEX "platform_audit_event_actor_user_id_created_at_idx" ON "platform_audit_event"("actor_user_id", "created_at");

CREATE TABLE "break_glass_grant" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "admin_display_name" TEXT NOT NULL,
    "ticket_ref" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_user_id" TEXT,
    "revoke_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "break_glass_grant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "break_glass_grant_workspace_id_id_key" ON "break_glass_grant"("workspace_id", "id");
CREATE INDEX "break_glass_grant_workspace_id_idx" ON "break_glass_grant"("workspace_id");
CREATE INDEX "break_glass_grant_workspace_id_expires_at_revoked_at_idx" ON "break_glass_grant"("workspace_id", "expires_at", "revoked_at");
CREATE INDEX "break_glass_grant_admin_user_id_expires_at_idx" ON "break_glass_grant"("admin_user_id", "expires_at");

ALTER TABLE "break_glass_grant"
    ADD CONSTRAINT "break_glass_grant_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "break_glass_grant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "break_glass_grant" FORCE ROW LEVEL SECURITY;

CREATE POLICY "break_glass_grant_tenant_isolation" ON "break_glass_grant"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

-- A verified active platform admin may list workspace metadata rows inside a
-- platform-admin scoped transaction (`app.platform_admin_user_id`). Tenant
-- tables (`student`, `student_note`, `assessment_score`, `guardian`, etc.) do
-- NOT receive a cross-tenant policy.
CREATE POLICY "workspace_platform_admin_read" ON "workspace"
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM "platform_admin" pa
        WHERE pa."user_id" = nullif(current_setting('app.platform_admin_user_id', true), '')
          AND pa."revoked_at" IS NULL
      )
    );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE "platform_admin", "break_glass_grant" TO kashkol_app;
    GRANT SELECT, INSERT ON TABLE "platform_audit_event" TO kashkol_app;
    REVOKE UPDATE, DELETE ON TABLE "platform_audit_event" FROM kashkol_app;
  END IF;
END $$;
