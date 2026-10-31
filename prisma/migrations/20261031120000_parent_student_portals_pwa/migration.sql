-- Parent and student portal invitations, granular portal grant permissions,
-- and lock-screen-safe Web Push subscriptions (`F-P2-02`, `F-P2-03`).

ALTER TABLE "portal_grant"
    ADD COLUMN IF NOT EXISTS "guardian_id" UUID,
    ADD COLUMN IF NOT EXISTS "permissions" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "portal_grant"
    ADD CONSTRAINT "portal_grant_workspace_id_guardian_id_fkey"
      FOREIGN KEY ("workspace_id", "guardian_id") REFERENCES "guardian"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "portal_invitation" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID,
    "kind" "portal_kind" NOT NULL,
    "email" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "token_hash" TEXT NOT NULL,
    "status" "invitation_status" NOT NULL DEFAULT 'pending',
    "issued_by_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_sent_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_by_user_id" TEXT,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_invitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portal_invitation_token_hash_key"
    ON "portal_invitation"("token_hash");
CREATE UNIQUE INDEX "portal_invitation_workspace_id_id_key"
    ON "portal_invitation"("workspace_id", "id");
CREATE INDEX "portal_invitation_workspace_id_idx"
    ON "portal_invitation"("workspace_id");
CREATE INDEX "portal_invitation_workspace_id_student_id_idx"
    ON "portal_invitation"("workspace_id", "student_id");
CREATE INDEX "portal_invitation_workspace_id_email_idx"
    ON "portal_invitation"("workspace_id", "email");

ALTER TABLE "portal_invitation"
    ADD CONSTRAINT "portal_invitation_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "portal_invitation"
    ADD CONSTRAINT "portal_invitation_workspace_id_student_id_fkey"
      FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "portal_invitation"
    ADD CONSTRAINT "portal_invitation_workspace_id_guardian_id_fkey"
      FOREIGN KEY ("workspace_id", "guardian_id") REFERENCES "guardian"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "portal_invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portal_invitation" FORCE ROW LEVEL SECURITY;

CREATE POLICY "portal_invitation_tenant_isolation" ON "portal_invitation"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE POLICY "portal_invitation_token_lookup" ON "portal_invitation"
    FOR SELECT
    USING ("token_hash" = current_setting('app.portal_invitation_token_hash', true));

CREATE TABLE "portal_push_subscription" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "portal_user_id" TEXT NOT NULL,
    "kind" "portal_kind" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh_key" TEXT NOT NULL,
    "auth_key" TEXT NOT NULL,
    "include_sensitive_details" BOOLEAN NOT NULL DEFAULT false,
    "user_agent" TEXT,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_push_subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portal_push_subscription_workspace_id_id_key"
    ON "portal_push_subscription"("workspace_id", "id");
CREATE UNIQUE INDEX "portal_push_subscription_workspace_id_portal_user_id_endpoint_key"
    ON "portal_push_subscription"("workspace_id", "portal_user_id", "endpoint");
CREATE INDEX "portal_push_subscription_workspace_id_idx"
    ON "portal_push_subscription"("workspace_id");
CREATE INDEX "portal_push_subscription_portal_user_id_idx"
    ON "portal_push_subscription"("portal_user_id");

ALTER TABLE "portal_push_subscription"
    ADD CONSTRAINT "portal_push_subscription_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "portal_push_subscription"
    ADD CONSTRAINT "portal_push_subscription_portal_user_id_fkey"
      FOREIGN KEY ("portal_user_id") REFERENCES "user"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "portal_push_subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portal_push_subscription" FORCE ROW LEVEL SECURITY;

CREATE POLICY "portal_push_subscription_tenant_isolation" ON "portal_push_subscription"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE POLICY "portal_push_subscription_self_read" ON "portal_push_subscription"
    FOR SELECT
    USING ("portal_user_id" = current_setting('app.user_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      "portal_invitation", "portal_push_subscription"
    TO kashkol_app;
  END IF;
END $$;
