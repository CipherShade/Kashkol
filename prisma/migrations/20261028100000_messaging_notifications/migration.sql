-- Create enums
CREATE TYPE "guardian_relation" AS ENUM ('mother', 'father', 'other', 'legal_guardian');
CREATE TYPE "message_channel" AS ENUM ('whatsapp', 'sms', 'email', 'in_app');
CREATE TYPE "message_status" AS ENUM ('pending', 'prepared', 'sending', 'sent', 'delivered', 'failed', 'cancelled', 'retried');
CREATE TYPE "notification_type" AS ENUM ('attendance_present', 'attendance_absent', 'attendance_late', 'attendance_excused', 'session_cancelled', 'session_rescheduled', 'homework_assigned', 'homework_reminder', 'exam_result', 'general');
CREATE TYPE "outbox_state" AS ENUM ('pending', 'running', 'done', 'failed', 'cancelled');

-- CreateTable guardian
CREATE TABLE "guardian" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "relation" "guardian_relation" NOT NULL DEFAULT 'other',
    "phone_e164" TEXT NOT NULL,
    "email" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_authorized" BOOLEAN NOT NULL DEFAULT true,
    "opt_out" BOOLEAN NOT NULL DEFAULT false,
    "consent_given" BOOLEAN NOT NULL DEFAULT false,
    "consent_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable notification
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID,
    "type" "notification_type" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable message_outbox
CREATE TABLE "message_outbox" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID,
    "channel" "message_channel" NOT NULL DEFAULT 'whatsapp',
    "type" "notification_type" NOT NULL,
    "template_key" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "message_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_retry_at" TIMESTAMPTZ(6),
    "provider" TEXT DEFAULT 'fake',
    "provider_message_id" TEXT,
    "last_error" TEXT,
    "error_details" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "metadata" JSONB,
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "message_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable notification_settings
CREATE TABLE "notification_settings" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "provider" TEXT NOT NULL DEFAULT 'fake',
    "provider_config" JSONB,
    "quiet_hours_start" TEXT,
    "quiet_hours_end" TEXT,
    "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
    "rate_limit_per_hour" INTEGER NOT NULL DEFAULT 100,
    "daily_limit" INTEGER NOT NULL DEFAULT 1000,
    "template_overrides" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable notification_log
CREATE TABLE "notification_log" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "outbox_id" UUID,
    "action" TEXT NOT NULL,
    "status" "message_status",
    "details" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "guardian_workspace_id_id_key" ON "guardian"("workspace_id", "id");
CREATE UNIQUE INDEX "guardian_workspace_id_student_id_phone_e164_key" ON "guardian"("workspace_id", "student_id", "phone_e164");
CREATE INDEX "guardian_workspace_id_idx" ON "guardian"("workspace_id");
CREATE INDEX "guardian_student_id_idx" ON "guardian"("student_id");
CREATE INDEX "guardian_phone_e164_idx" ON "guardian"("phone_e164");

CREATE UNIQUE INDEX "notification_workspace_id_id_key" ON "notification"("workspace_id", "id");
CREATE INDEX "notification_workspace_id_idx" ON "notification"("workspace_id");
CREATE INDEX "notification_student_id_idx" ON "notification"("student_id");
CREATE INDEX "notification_guardian_id_idx" ON "notification"("guardian_id");
CREATE INDEX "notification_workspace_id_is_read_idx" ON "notification"("workspace_id", "is_read");

CREATE UNIQUE INDEX "message_outbox_workspace_id_id_key" ON "message_outbox"("workspace_id", "id");
CREATE UNIQUE INDEX "message_outbox_idempotency_key_key" ON "message_outbox"("idempotency_key");
CREATE INDEX "message_outbox_workspace_id_idx" ON "message_outbox"("workspace_id");
CREATE INDEX "message_outbox_student_id_idx" ON "message_outbox"("student_id");
CREATE INDEX "message_outbox_guardian_id_idx" ON "message_outbox"("guardian_id");
CREATE INDEX "message_outbox_status_next_retry_at_idx" ON "message_outbox"("status", "next_retry_at");
CREATE INDEX "message_outbox_workspace_id_status_idx" ON "message_outbox"("workspace_id", "status");

CREATE UNIQUE INDEX "notification_settings_workspace_id_key" ON "notification_settings"("workspace_id");
CREATE UNIQUE INDEX "notification_settings_workspace_id_id_key" ON "notification_settings"("workspace_id", "id");
CREATE INDEX "notification_settings_workspace_id_idx" ON "notification_settings"("workspace_id");

CREATE UNIQUE INDEX "notification_log_workspace_id_id_key" ON "notification_log"("workspace_id", "id");
CREATE INDEX "notification_log_workspace_id_idx" ON "notification_log"("workspace_id");
CREATE INDEX "notification_log_outbox_id_idx" ON "notification_log"("outbox_id");
CREATE INDEX "notification_log_created_at_idx" ON "notification_log"("created_at");

-- FKs
ALTER TABLE "guardian" ADD CONSTRAINT "guardian_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guardian" ADD CONSTRAINT "guardian_workspace_id_student_id_fkey" FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification" ADD CONSTRAINT "notification_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification" ADD CONSTRAINT "notification_workspace_id_student_id_fkey" FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification" ADD CONSTRAINT "notification_workspace_id_guardian_id_fkey" FOREIGN KEY ("workspace_id", "guardian_id") REFERENCES "guardian"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "message_outbox" ADD CONSTRAINT "message_outbox_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_outbox" ADD CONSTRAINT "message_outbox_workspace_id_student_id_fkey" FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_outbox" ADD CONSTRAINT "message_outbox_workspace_id_guardian_id_fkey" FOREIGN KEY ("workspace_id", "guardian_id") REFERENCES "guardian"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_workspace_id_outbox_id_fkey" FOREIGN KEY ("workspace_id", "outbox_id") REFERENCES "message_outbox"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS
ALTER TABLE "guardian" ENABLE ROW LEVEL SECURITY; ALTER TABLE "guardian" FORCE ROW LEVEL SECURITY;
CREATE POLICY "guardian_tenant_isolation" ON "guardian" USING ("workspace_id" = current_workspace_id()) WITH CHECK ("workspace_id" = current_workspace_id());

ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY; ALTER TABLE "notification" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_tenant_isolation" ON "notification" USING ("workspace_id" = current_workspace_id()) WITH CHECK ("workspace_id" = current_workspace_id());

ALTER TABLE "message_outbox" ENABLE ROW LEVEL SECURITY; ALTER TABLE "message_outbox" FORCE ROW LEVEL SECURITY;
CREATE POLICY "message_outbox_tenant_isolation" ON "message_outbox" USING ("workspace_id" = current_workspace_id()) WITH CHECK ("workspace_id" = current_workspace_id());

ALTER TABLE "notification_settings" ENABLE ROW LEVEL SECURITY; ALTER TABLE "notification_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_settings_tenant_isolation" ON "notification_settings" USING ("workspace_id" = current_workspace_id()) WITH CHECK ("workspace_id" = current_workspace_id());

ALTER TABLE "notification_log" ENABLE ROW LEVEL SECURITY; ALTER TABLE "notification_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_log_tenant_isolation" ON "notification_log" USING ("workspace_id" = current_workspace_id()) WITH CHECK ("workspace_id" = current_workspace_id());

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "guardian", "notification", "message_outbox", "notification_settings", "notification_log" TO kashkol_app;
