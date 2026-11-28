-- Follow-up to the second read-only billing audit.
-- A server-derived key makes a retried config append idempotent without
-- rewriting the append-only billing_config table. No existing row is changed.

CREATE TABLE "billing_config_idempotency" (
  "key" TEXT NOT NULL,
  "config_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "billing_config_idempotency_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "billing_config_idempotency_config_id_key"
  ON "billing_config_idempotency" ("config_id");

ALTER TABLE "billing_config_idempotency"
  ADD CONSTRAINT "billing_config_idempotency_config_id_fkey"
  FOREIGN KEY ("config_id") REFERENCES "billing_config" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "billing_config_idempotency_append_only"
  BEFORE UPDATE OR DELETE ON "billing_config_idempotency"
  FOR EACH ROW EXECUTE FUNCTION "prevent_billing_record_rewrite"();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT ON TABLE "billing_config_idempotency" TO kashkol_app;
    REVOKE UPDATE, DELETE ON TABLE "billing_config_idempotency" FROM kashkol_app;
  END IF;
END $$;
