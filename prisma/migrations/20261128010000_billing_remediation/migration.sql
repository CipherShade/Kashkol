-- Billing remediation (audit findings F1-F21).
-- Forward-only: adds corrections and constraints; it never rewrites issued
-- invoices, ledger entries, or tenant content.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TYPE "billing_entry_type" ADD VALUE IF NOT EXISTS 'exemption_reversal';
ALTER TYPE "billing_entry_type" ADD VALUE IF NOT EXISTS 'invoice_credit';
ALTER TYPE "billing_entry_type" ADD VALUE IF NOT EXISTS 'payment_reversal';
CREATE TYPE "billing_reference_status" AS ENUM ('active', 'revoked');

-- Exemption dates are stored as canonical YYYY-MM-DD text. Parse them with an
-- IMMUTABLE helper so PostgreSQL can enforce the overlap constraint in an
-- index expression; text-to-date casts depend on DateStyle and are not allowed.
CREATE OR REPLACE FUNCTION "billing_parse_date"(value TEXT) RETURNS DATE
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT make_date(
    substring(value from 1 for 4)::INTEGER,
    substring(value from 6 for 2)::INTEGER,
    substring(value from 9 for 2)::INTEGER
  )
$$;

-- One active or historical exemption may never cover the same day twice.
ALTER TABLE "billing_exemption"
  ADD CONSTRAINT "billing_exemption_no_overlap"
  EXCLUDE USING gist (
    "workspace_id" WITH =,
    daterange(
      "billing_parse_date"("start_date"),
      COALESCE("billing_parse_date"("expires_on"), DATE '9999-12-31') + 1,
      '[)'
    ) WITH &&
  )
  WHERE ("status" <> 'revoked'::"billing_exemption_status");

-- Ledger corrections carry the student id only as an opaque UUID for preview
-- reconciliation. No name, phone, or note is copied into the ledger.
ALTER TABLE "billing_ledger_entry"
  ADD COLUMN "student_id" UUID;
CREATE INDEX "billing_ledger_entry_workspace_id_student_id_period_month_idx"
  ON "billing_ledger_entry" ("workspace_id", "student_id", "period_month");

-- Immutable application of a credit to an issued invoice. The invoice row is
-- never changed; outstanding is derived from these records.
CREATE TABLE "billing_invoice_credit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "ledger_entry_id" UUID NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "reason_code" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by" TEXT NOT NULL,
  CONSTRAINT "billing_invoice_credit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_invoice_credit_workspace_id_id_key"
  ON "billing_invoice_credit" ("workspace_id", "id");
CREATE UNIQUE INDEX "billing_invoice_credit_workspace_id_idempotency_key_key"
  ON "billing_invoice_credit" ("workspace_id", "idempotency_key");
CREATE UNIQUE INDEX "billing_invoice_credit_invoice_id_ledger_entry_id_key"
  ON "billing_invoice_credit" ("invoice_id", "ledger_entry_id");
CREATE INDEX "billing_invoice_credit_workspace_id_invoice_id_idx"
  ON "billing_invoice_credit" ("workspace_id", "invoice_id");

ALTER TABLE "billing_invoice_credit"
  ADD CONSTRAINT "billing_invoice_credit_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_invoice_credit"
  ADD CONSTRAINT "billing_invoice_credit_workspace_id_invoice_id_fkey"
  FOREIGN KEY ("workspace_id", "invoice_id")
  REFERENCES "billing_invoice" ("workspace_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_invoice_credit"
  ADD CONSTRAINT "billing_invoice_credit_workspace_id_ledger_entry_id_fkey"
  FOREIGN KEY ("workspace_id", "ledger_entry_id")
  REFERENCES "billing_ledger_entry" ("workspace_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_invoice_credit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_invoice_credit" FORCE ROW LEVEL SECURITY;
CREATE POLICY "billing_invoice_credit_tenant_isolation" ON "billing_invoice_credit"
  USING ("workspace_id" = "current_workspace_id"())
  WITH CHECK ("workspace_id" = "current_workspace_id"());
CREATE TRIGGER "billing_invoice_credit_append_only"
  BEFORE UPDATE OR DELETE ON "billing_invoice_credit"
  FOR EACH ROW EXECUTE FUNCTION "prevent_billing_record_rewrite"();

-- Review idempotency is submission- and action-specific. A key reused for a
-- different submission must never return the first submission's result.
DROP INDEX IF EXISTS "billing_payment_submission_workspace_id_review_idempotency_key_key";
CREATE UNIQUE INDEX "billing_payment_submission_workspace_id_id_review_idempotency_key_status_key"
  ON "billing_payment_submission" ("workspace_id", "id", "review_idempotency_key", "status");

ALTER TABLE "billing_payment_submission"
  ADD COLUMN "reversed_at" TIMESTAMPTZ(6),
  ADD COLUMN "reversal_reason_code" TEXT;

-- Reference registry recovery. History is append-only in a separate global
-- event table; the current row may only be released and reclaimed by the
-- audited billing service.
ALTER TABLE "billing_reference_fingerprint"
  ADD COLUMN "status" "billing_reference_status" NOT NULL DEFAULT 'active',
  ADD COLUMN "revoked_at" TIMESTAMPTZ(6),
  ADD COLUMN "revoked_by" TEXT,
  ADD COLUMN "revoke_reason_code" TEXT;
CREATE INDEX "billing_reference_fingerprint_status_idx"
  ON "billing_reference_fingerprint" ("status");

CREATE TABLE "billing_reference_event" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fingerprint" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "workspace_id" UUID NOT NULL,
  "submission_id" UUID NOT NULL,
  "actor_user_id" TEXT,
  "reason_code" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "billing_reference_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "billing_reference_event_fingerprint_created_at_idx"
  ON "billing_reference_event" ("fingerprint", "created_at");
CREATE TRIGGER "billing_reference_event_append_only"
  BEFORE UPDATE OR DELETE ON "billing_reference_event"
  FOR EACH ROW EXECUTE FUNCTION "prevent_billing_record_rewrite"();

CREATE OR REPLACE FUNCTION "allow_billing_reference_release"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."fingerprint" IS DISTINCT FROM OLD."fingerprint"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'reference fingerprint identity is immutable';
  END IF;
  IF NEW."status" = 'revoked' AND OLD."status" = 'revoked'
     AND (NEW."workspace_id" IS DISTINCT FROM OLD."workspace_id"
          OR NEW."submission_id" IS DISTINCT FROM OLD."submission_id") THEN
    RAISE EXCEPTION 'a revoked reference must be reclaimed as active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "billing_reference_fingerprint_append_only"
  ON "billing_reference_fingerprint";
CREATE TRIGGER "billing_reference_fingerprint_release_guard"
  BEFORE UPDATE OR DELETE ON "billing_reference_fingerprint"
  FOR EACH ROW EXECUTE FUNCTION "allow_billing_reference_release"();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT ON TABLE
      "billing_invoice_credit", "billing_reference_event" TO kashkol_app;
    REVOKE UPDATE, DELETE ON TABLE
      "billing_invoice_credit", "billing_reference_event" FROM kashkol_app;
    GRANT UPDATE ON TABLE "billing_reference_fingerprint" TO kashkol_app;
    REVOKE DELETE ON TABLE "billing_reference_fingerprint" FROM kashkol_app;
  END IF;
END $$;
