-- Usage-based platform billing (ADR-0045, ADR-0046, ADR-0047).
-- Forward-only: no existing pedagogical or session-receipt data is changed.

-- 1. Enum additions ---------------------------------------------------------

ALTER TYPE "file_scope" ADD VALUE IF NOT EXISTS 'billing_evidence';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'billing_invoice_issued';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'billing_submission_approved';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'billing_submission_rejected';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'billing_submission_flagged';

CREATE TYPE "billing_entry_type" AS ENUM (
  'usage_charge', 'adjustment', 'invoice_allocation', 'payment_credit'
);
CREATE TYPE "billing_direction" AS ENUM ('debit', 'credit');
CREATE TYPE "billing_submission_status" AS ENUM (
  'submitted', 'under_review', 'approved', 'rejected', 'flagged'
);
CREATE TYPE "billing_review_action" AS ENUM ('approved', 'rejected', 'flagged');
CREATE TYPE "billing_exemption_reason" AS ENUM (
  'internal_testing', 'beta_tester', 'testimonial', 'promotional', 'partner', 'custom'
);
CREATE TYPE "billing_exemption_status" AS ENUM (
  'scheduled', 'active', 'expired', 'revoked'
);

-- 2. Global append-only configuration ---------------------------------------

CREATE TABLE "billing_config" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "version" INTEGER NOT NULL,
  "rate_minor" INTEGER NOT NULL,
  "minimum_invoice_minor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EGP',
  "billing_timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
  "instapay_handle" TEXT NOT NULL,
  "instapay_link" TEXT NOT NULL,
  "qr_storage_key" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "effective_at" TIMESTAMPTZ(6) NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "billing_config_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_config_version_key" ON "billing_config" ("version");
CREATE INDEX "billing_config_version_idx" ON "billing_config" ("version");

-- The initial config contains no invented InstaPay details. The admin UI shows
-- the transfer handle as unconfigured until a platform admin supplies one.
INSERT INTO "billing_config" (
  "id", "version", "rate_minor", "minimum_invoice_minor", "currency",
  "billing_timezone", "instapay_handle", "instapay_link", "is_active",
  "effective_at", "created_by", "created_at"
) VALUES (
  gen_random_uuid(), 1, 99, 5000, 'EGP', 'Africa/Cairo', '', '',
  true, now(), 'system:billing-migration', now()
);

-- Platform-wide duplicate-reference index. It stores only a SHA-256 fingerprint.
CREATE TABLE "billing_reference_fingerprint" (
  "fingerprint" TEXT NOT NULL,
  "workspace_id" UUID NOT NULL,
  "submission_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "billing_reference_fingerprint_pkey" PRIMARY KEY ("fingerprint")
);
CREATE INDEX "billing_reference_fingerprint_workspace_id_idx"
  ON "billing_reference_fingerprint" ("workspace_id");

-- 3. Tenant billing tables ---------------------------------------------------

CREATE TABLE "workspace_billing_state" (
  "workspace_id" UUID NOT NULL,
  "activation_month" TEXT NOT NULL,
  "activated_at" TIMESTAMPTZ(6) NOT NULL,
  "activated_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_billing_state_pkey" PRIMARY KEY ("workspace_id")
);

CREATE TABLE "billing_exemption" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "reason" "billing_exemption_reason" NOT NULL,
  "notes" TEXT,
  "start_date" TEXT NOT NULL,
  "expires_on" TEXT,
  "status" "billing_exemption_status" NOT NULL DEFAULT 'scheduled',
  "created_by_admin_id" TEXT NOT NULL,
  "modified_by_admin_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "billing_exemption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_exemption_workspace_id_id_key"
  ON "billing_exemption" ("workspace_id", "id");
CREATE INDEX "billing_exemption_workspace_id_status_start_date_idx"
  ON "billing_exemption" ("workspace_id", "status", "start_date");

CREATE TABLE "billing_usage_snapshot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "period_month" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "rate_minor" INTEGER NOT NULL,
  "config_version" INTEGER NOT NULL,
  "qualifying_student_count" INTEGER NOT NULL,
  "charge_minor" INTEGER NOT NULL,
  "billable" BOOLEAN NOT NULL DEFAULT true,
  "computed_at" TIMESTAMPTZ(6) NOT NULL,
  "created_by" TEXT NOT NULL,
  CONSTRAINT "billing_usage_snapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_usage_snapshot_workspace_id_id_key"
  ON "billing_usage_snapshot" ("workspace_id", "id");
CREATE UNIQUE INDEX "billing_usage_snapshot_workspace_id_period_month_version_key"
  ON "billing_usage_snapshot" ("workspace_id", "period_month", "version");
CREATE INDEX "billing_usage_snapshot_workspace_id_period_month_idx"
  ON "billing_usage_snapshot" ("workspace_id", "period_month");

CREATE TABLE "billing_usage_student" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "snapshot_id" UUID NOT NULL,
  "period_month" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "student_id" UUID NOT NULL,
  "mark_ids" TEXT[] NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "billing_usage_student_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_usage_student_workspace_id_id_key"
  ON "billing_usage_student" ("workspace_id", "id");
CREATE UNIQUE INDEX "billing_usage_student_workspace_id_period_month_version_student_id_key"
  ON "billing_usage_student" ("workspace_id", "period_month", "version", "student_id");
CREATE INDEX "billing_usage_student_workspace_id_snapshot_id_idx"
  ON "billing_usage_student" ("workspace_id", "snapshot_id");

CREATE TABLE "billing_ledger_entry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "entry_type" "billing_entry_type" NOT NULL,
  "direction" "billing_direction" NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EGP',
  "period_month" TEXT,
  "snapshot_version" INTEGER,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "description_key" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by" TEXT NOT NULL,
  CONSTRAINT "billing_ledger_entry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_ledger_entry_workspace_id_id_key"
  ON "billing_ledger_entry" ("workspace_id", "id");
CREATE UNIQUE INDEX "billing_ledger_entry_workspace_id_idempotency_key_key"
  ON "billing_ledger_entry" ("workspace_id", "idempotency_key");
CREATE INDEX "billing_ledger_entry_workspace_id_entry_type_created_at_idx"
  ON "billing_ledger_entry" ("workspace_id", "entry_type", "created_at");
CREATE INDEX "billing_ledger_entry_workspace_id_period_month_idx"
  ON "billing_ledger_entry" ("workspace_id", "period_month");

CREATE TABLE "billing_invoice" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "cycle_key" TEXT NOT NULL,
  "total_minor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EGP',
  "issued_at" TIMESTAMPTZ(6) NOT NULL,
  "config_version" INTEGER NOT NULL,
  "threshold_minor_at_issue" INTEGER NOT NULL,
  "created_by" TEXT NOT NULL,
  CONSTRAINT "billing_invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_invoice_workspace_id_id_key"
  ON "billing_invoice" ("workspace_id", "id");
CREATE UNIQUE INDEX "billing_invoice_workspace_id_number_key"
  ON "billing_invoice" ("workspace_id", "number");
CREATE UNIQUE INDEX "billing_invoice_workspace_id_cycle_key_key"
  ON "billing_invoice" ("workspace_id", "cycle_key");
CREATE INDEX "billing_invoice_workspace_id_issued_at_idx"
  ON "billing_invoice" ("workspace_id", "issued_at");

CREATE TABLE "billing_invoice_line_item" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "ledger_entry_id" UUID NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "description_key" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "billing_invoice_line_item_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_invoice_line_item_workspace_id_id_key"
  ON "billing_invoice_line_item" ("workspace_id", "id");
CREATE UNIQUE INDEX "billing_invoice_line_item_invoice_id_ledger_entry_id_key"
  ON "billing_invoice_line_item" ("invoice_id", "ledger_entry_id");
CREATE INDEX "billing_invoice_line_item_workspace_id_invoice_id_idx"
  ON "billing_invoice_line_item" ("workspace_id", "invoice_id");

CREATE TABLE "billing_payment_submission" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "reference_raw" TEXT NOT NULL,
  "reference_fingerprint" TEXT NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EGP',
  "transferred_at" TIMESTAMPTZ(6) NOT NULL,
  "status" "billing_submission_status" NOT NULL DEFAULT 'submitted',
  "evidence_file_id" UUID,
  "submitted_by" TEXT NOT NULL,
  "submitted_at" TIMESTAMPTZ(6) NOT NULL,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMPTZ(6),
  "review_note_code" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "billing_payment_submission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_payment_submission_workspace_id_id_key"
  ON "billing_payment_submission" ("workspace_id", "id");
CREATE UNIQUE INDEX "billing_payment_submission_workspace_id_invoice_id_reference_fingerprint_key"
  ON "billing_payment_submission" ("workspace_id", "invoice_id", "reference_fingerprint");
CREATE INDEX "billing_payment_submission_workspace_id_status_idx"
  ON "billing_payment_submission" ("workspace_id", "status");
CREATE INDEX "billing_payment_submission_workspace_id_invoice_id_idx"
  ON "billing_payment_submission" ("workspace_id", "invoice_id");
CREATE INDEX "billing_payment_submission_workspace_id_reference_fingerprint_idx"
  ON "billing_payment_submission" ("workspace_id", "reference_fingerprint");

CREATE TABLE "billing_review_event" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "submission_id" UUID NOT NULL,
  "action" "billing_review_action" NOT NULL,
  "note_code" TEXT,
  "actor_user_id" TEXT NOT NULL,
  "actor_display_name" TEXT NOT NULL,
  "actor_type" TEXT NOT NULL,
  "platform_audit_event_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "billing_review_event_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_review_event_workspace_id_id_key"
  ON "billing_review_event" ("workspace_id", "id");
CREATE INDEX "billing_review_event_workspace_id_submission_id_idx"
  ON "billing_review_event" ("workspace_id", "submission_id");

-- 4. Foreign keys ------------------------------------------------------------

ALTER TABLE "workspace_billing_state"
  ADD CONSTRAINT "workspace_billing_state_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_exemption"
  ADD CONSTRAINT "billing_exemption_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_usage_snapshot"
  ADD CONSTRAINT "billing_usage_snapshot_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_usage_student"
  ADD CONSTRAINT "billing_usage_student_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_usage_student"
  ADD CONSTRAINT "billing_usage_student_workspace_id_snapshot_id_fkey"
  FOREIGN KEY ("workspace_id", "snapshot_id")
  REFERENCES "billing_usage_snapshot" ("workspace_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_usage_student"
  ADD CONSTRAINT "billing_usage_student_workspace_id_student_id_fkey"
  FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student" ("workspace_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_ledger_entry"
  ADD CONSTRAINT "billing_ledger_entry_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_invoice"
  ADD CONSTRAINT "billing_invoice_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_invoice_line_item"
  ADD CONSTRAINT "billing_invoice_line_item_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_invoice_line_item"
  ADD CONSTRAINT "billing_invoice_line_item_workspace_id_invoice_id_fkey"
  FOREIGN KEY ("workspace_id", "invoice_id")
  REFERENCES "billing_invoice" ("workspace_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_invoice_line_item"
  ADD CONSTRAINT "billing_invoice_line_item_workspace_id_ledger_entry_id_fkey"
  FOREIGN KEY ("workspace_id", "ledger_entry_id")
  REFERENCES "billing_ledger_entry" ("workspace_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_payment_submission"
  ADD CONSTRAINT "billing_payment_submission_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_payment_submission"
  ADD CONSTRAINT "billing_payment_submission_workspace_id_invoice_id_fkey"
  FOREIGN KEY ("workspace_id", "invoice_id")
  REFERENCES "billing_invoice" ("workspace_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_review_event"
  ADD CONSTRAINT "billing_review_event_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_review_event"
  ADD CONSTRAINT "billing_review_event_workspace_id_submission_id_fkey"
  FOREIGN KEY ("workspace_id", "submission_id")
  REFERENCES "billing_payment_submission" ("workspace_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Forced tenant isolation -------------------------------------------------

ALTER TABLE "workspace_billing_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_billing_state" FORCE ROW LEVEL SECURITY;
CREATE POLICY "workspace_billing_state_tenant_isolation" ON "workspace_billing_state"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "billing_exemption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_exemption" FORCE ROW LEVEL SECURITY;
CREATE POLICY "billing_exemption_tenant_isolation" ON "billing_exemption"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "billing_usage_snapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_usage_snapshot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "billing_usage_snapshot_tenant_isolation" ON "billing_usage_snapshot"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "billing_usage_student" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_usage_student" FORCE ROW LEVEL SECURITY;
CREATE POLICY "billing_usage_student_tenant_isolation" ON "billing_usage_student"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "billing_ledger_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_ledger_entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "billing_ledger_entry_tenant_isolation" ON "billing_ledger_entry"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "billing_invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_invoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "billing_invoice_tenant_isolation" ON "billing_invoice"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "billing_invoice_line_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_invoice_line_item" FORCE ROW LEVEL SECURITY;
CREATE POLICY "billing_invoice_line_item_tenant_isolation" ON "billing_invoice_line_item"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "billing_payment_submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_payment_submission" FORCE ROW LEVEL SECURITY;
CREATE POLICY "billing_payment_submission_tenant_isolation" ON "billing_payment_submission"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "billing_review_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_review_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY "billing_review_event_tenant_isolation" ON "billing_review_event"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());

-- 6. Append-only enforcement and grants -------------------------------------

CREATE OR REPLACE FUNCTION "prevent_billing_record_rewrite"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'billing records are append-only';
END;
$$;

CREATE TRIGGER "billing_config_append_only"
  BEFORE UPDATE OR DELETE ON "billing_config"
  FOR EACH ROW EXECUTE FUNCTION "prevent_billing_record_rewrite"();
CREATE TRIGGER "workspace_billing_state_append_only"
  BEFORE UPDATE OR DELETE ON "workspace_billing_state"
  FOR EACH ROW EXECUTE FUNCTION "prevent_billing_record_rewrite"();
CREATE TRIGGER "billing_usage_snapshot_append_only"
  BEFORE UPDATE OR DELETE ON "billing_usage_snapshot"
  FOR EACH ROW EXECUTE FUNCTION "prevent_billing_record_rewrite"();
CREATE TRIGGER "billing_usage_student_append_only"
  BEFORE UPDATE OR DELETE ON "billing_usage_student"
  FOR EACH ROW EXECUTE FUNCTION "prevent_billing_record_rewrite"();
CREATE TRIGGER "billing_ledger_entry_append_only"
  BEFORE UPDATE OR DELETE ON "billing_ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION "prevent_billing_record_rewrite"();
CREATE TRIGGER "billing_invoice_append_only"
  BEFORE UPDATE OR DELETE ON "billing_invoice"
  FOR EACH ROW EXECUTE FUNCTION "prevent_billing_record_rewrite"();
CREATE TRIGGER "billing_invoice_line_item_append_only"
  BEFORE UPDATE OR DELETE ON "billing_invoice_line_item"
  FOR EACH ROW EXECUTE FUNCTION "prevent_billing_record_rewrite"();
CREATE TRIGGER "billing_review_event_append_only"
  BEFORE UPDATE OR DELETE ON "billing_review_event"
  FOR EACH ROW EXECUTE FUNCTION "prevent_billing_record_rewrite"();
CREATE TRIGGER "billing_reference_fingerprint_append_only"
  BEFORE UPDATE OR DELETE ON "billing_reference_fingerprint"
  FOR EACH ROW EXECUTE FUNCTION "prevent_billing_record_rewrite"();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT ON TABLE
      "billing_config", "workspace_billing_state", "billing_usage_snapshot",
      "billing_usage_student", "billing_ledger_entry", "billing_invoice",
      "billing_invoice_line_item", "billing_review_event",
      "billing_reference_fingerprint" TO kashkol_app;
    REVOKE UPDATE, DELETE ON TABLE
      "billing_config", "workspace_billing_state", "billing_usage_snapshot",
      "billing_usage_student", "billing_ledger_entry", "billing_invoice",
      "billing_invoice_line_item", "billing_review_event",
      "billing_reference_fingerprint" FROM kashkol_app;

    GRANT SELECT, INSERT, UPDATE ON TABLE
      "billing_exemption", "billing_payment_submission" TO kashkol_app;
    REVOKE DELETE ON TABLE
      "billing_exemption", "billing_payment_submission" FROM kashkol_app;
  END IF;
END $$;
