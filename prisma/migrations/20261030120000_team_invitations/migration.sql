-- Team invitations, suspended members, and the granular permission resources
-- introduced with assistant collaboration (`F-P2-01`).

ALTER TYPE "member_status" ADD VALUE IF NOT EXISTS 'suspended' BEFORE 'removed';

ALTER TYPE "permission_resource" ADD VALUE IF NOT EXISTS 'groups' AFTER 'grades';
ALTER TYPE "permission_resource" ADD VALUE IF NOT EXISTS 'sessions' AFTER 'groups';
ALTER TYPE "permission_resource" ADD VALUE IF NOT EXISTS 'exports' AFTER 'payments';
ALTER TYPE "permission_resource" ADD VALUE IF NOT EXISTS 'integrations' AFTER 'exports';

CREATE TYPE "invitation_status" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

CREATE TABLE "workspace_invitation" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "member_role" NOT NULL DEFAULT 'assistant',
    "grants" JSONB NOT NULL DEFAULT '[]',
    "token_hash" TEXT NOT NULL,
    "status" "invitation_status" NOT NULL DEFAULT 'pending',
    "invited_by_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_sent_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_by_user_id" TEXT,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_invitation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_invitation_role_check" CHECK ("role" = 'assistant')
);

CREATE UNIQUE INDEX "workspace_invitation_token_hash_key"
    ON "workspace_invitation"("token_hash");
CREATE UNIQUE INDEX "workspace_invitation_workspace_id_id_key"
    ON "workspace_invitation"("workspace_id", "id");
CREATE INDEX "workspace_invitation_workspace_id_idx"
    ON "workspace_invitation"("workspace_id");
CREATE INDEX "workspace_invitation_workspace_id_email_idx"
    ON "workspace_invitation"("workspace_id", "email");

ALTER TABLE "workspace_invitation"
    ADD CONSTRAINT "workspace_invitation_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workspace_invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_invitation" FORCE ROW LEVEL SECURITY;

CREATE POLICY "workspace_invitation_tenant_isolation" ON "workspace_invitation"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

-- Acceptance happens before a workspace scope exists. The token hash is a
-- bearer secret, so this policy exposes exactly one row to a caller that
-- already knows the token. It is SELECT-only: the acceptance write runs inside
-- the resolved workspace transaction.
CREATE POLICY "workspace_invitation_token_lookup" ON "workspace_invitation"
    FOR SELECT
    USING ("token_hash" = current_setting('app.invitation_token_hash', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workspace_invitation" TO kashkol_app;
  END IF;
END $$;
