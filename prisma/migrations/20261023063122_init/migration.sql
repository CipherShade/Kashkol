-- CreateEnum
CREATE TYPE "locale" AS ENUM ('ar', 'en');

-- CreateEnum
CREATE TYPE "theme" AS ENUM ('light', 'dark', 'system');

-- CreateEnum
CREATE TYPE "workspace_status" AS ENUM ('active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "member_role" AS ENUM ('owner', 'assistant');

-- CreateEnum
CREATE TYPE "member_status" AS ENUM ('active', 'invited', 'removed');

-- CreateEnum
CREATE TYPE "permission_resource" AS ENUM ('students', 'grades', 'attendance', 'homework', 'files', 'messages', 'payments', 'settings', 'team', 'audit');

-- CreateEnum
CREATE TYPE "permission_action" AS ENUM ('read', 'write');

-- CreateEnum
CREATE TYPE "audit_actor_type" AS ENUM ('user', 'system', 'platform_admin');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(6),
    "refreshTokenExpiresAt" TIMESTAMPTZ(6),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preference" (
    "userId" TEXT NOT NULL,
    "locale" "locale" NOT NULL DEFAULT 'ar',
    "theme" "theme" NOT NULL DEFAULT 'system',

    CONSTRAINT "user_preference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "workspace" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "teaching_name" TEXT NOT NULL,
    "primary_subject" TEXT,
    "grades_taught" TEXT[],
    "status" "workspace_status" NOT NULL DEFAULT 'active',
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_settings" (
    "workspace_id" UUID NOT NULL,
    "at_risk_after" INTEGER NOT NULL DEFAULT 2,
    "inactive_after" INTEGER NOT NULL DEFAULT 4,
    "locale" "locale" NOT NULL DEFAULT 'ar',
    "theme" "theme" NOT NULL DEFAULT 'system',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "email_digest_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspace_settings_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateTable
CREATE TABLE "workspace_member" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "member_role" NOT NULL,
    "status" "member_status" NOT NULL DEFAULT 'active',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspace_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_grant" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "resource" "permission_resource" NOT NULL,
    "action" "permission_action" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "permission_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_task" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "onboarding_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "actor_user_id" TEXT,
    "actor_display_name" TEXT NOT NULL,
    "actor_type" "audit_actor_type" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "diff" JSONB,
    "request_id" TEXT NOT NULL,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_slug_key" ON "workspace"("slug");

-- CreateIndex
CREATE INDEX "workspace_member_workspace_id_idx" ON "workspace_member"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_member_user_id_idx" ON "workspace_member"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_member_workspace_id_user_id_key" ON "workspace_member"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "permission_grant_workspace_id_idx" ON "permission_grant"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "permission_grant_member_id_resource_action_key" ON "permission_grant"("member_id", "resource", "action");

-- CreateIndex
CREATE INDEX "onboarding_task_workspace_id_idx" ON "onboarding_task"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_task_workspace_id_key_key" ON "onboarding_task"("workspace_id", "key");

-- CreateIndex
CREATE INDEX "audit_event_workspace_id_created_at_idx" ON "audit_event"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_event_workspace_id_action_idx" ON "audit_event"("workspace_id", "action");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_grant" ADD CONSTRAINT "permission_grant_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_grant" ADD CONSTRAINT "permission_grant_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_task" ADD CONSTRAINT "onboarding_task_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity constraints that belong in the database, not in application code.
-- ---------------------------------------------------------------------------

ALTER TABLE "workspace_settings"
  ADD CONSTRAINT "workspace_settings_thresholds_check"
  CHECK ("at_risk_after" >= 1 AND "at_risk_after" < "inactive_after" AND "inactive_after" <= 10);

-- ---------------------------------------------------------------------------
-- Row-level security (ADR-0006).
--
-- The application role is not the table owner and has no BYPASSRLS. Every
-- transaction sets `app.workspace_id` with set_config(..., true), so the
-- setting cannot leak across pooled connections. A query outside a scoped
-- transaction sees NULL and therefore zero rows: fail closed.
-- ---------------------------------------------------------------------------

ALTER TABLE "workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace" FORCE ROW LEVEL SECURITY;
CREATE POLICY "workspace_tenant_isolation" ON "workspace"
  USING ("id" = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK ("id" = current_setting('app.workspace_id', true)::uuid);

ALTER TABLE "workspace_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "workspace_settings_tenant_isolation" ON "workspace_settings"
  USING ("workspace_id" = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK ("workspace_id" = current_setting('app.workspace_id', true)::uuid);

ALTER TABLE "workspace_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_member" FORCE ROW LEVEL SECURITY;
CREATE POLICY "workspace_member_tenant_isolation" ON "workspace_member"
  USING ("workspace_id" = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK ("workspace_id" = current_setting('app.workspace_id', true)::uuid);

ALTER TABLE "permission_grant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permission_grant" FORCE ROW LEVEL SECURITY;
CREATE POLICY "permission_grant_tenant_isolation" ON "permission_grant"
  USING ("workspace_id" = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK ("workspace_id" = current_setting('app.workspace_id', true)::uuid);

ALTER TABLE "onboarding_task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onboarding_task" FORCE ROW LEVEL SECURITY;
CREATE POLICY "onboarding_task_tenant_isolation" ON "onboarding_task"
  USING ("workspace_id" = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK ("workspace_id" = current_setting('app.workspace_id', true)::uuid);

ALTER TABLE "audit_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_event_tenant_isolation" ON "audit_event"
  USING ("workspace_id" = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK ("workspace_id" = current_setting('app.workspace_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- Application role privileges. The role never owns a table and cannot bypass
-- RLS. The audit log is append-only: no UPDATE or DELETE grant.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      "user", "session", "account", "verification", "user_preference",
      "workspace", "workspace_settings", "workspace_member",
      "permission_grant", "onboarding_task", "audit_event"
    TO kashkol_app;

    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kashkol_app;

    IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
      GRANT SELECT ON TABLE "_prisma_migrations" TO kashkol_app;
    END IF;

    REVOKE UPDATE, DELETE ON TABLE "audit_event" FROM kashkol_app;
  END IF;
END $$;
