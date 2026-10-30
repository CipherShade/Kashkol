CREATE TYPE "payment_adjustment_kind" AS ENUM ('discount', 'refund', 'correction');

ALTER TABLE "payment"
    ALTER COLUMN "period" DROP NOT NULL,
    ADD COLUMN "method_label" TEXT,
    ADD COLUMN "purpose" TEXT,
    ADD COLUMN "reference_number" TEXT,
    ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "payment_workspace_id_idempotency_key_key"
    ON "payment"("workspace_id", "idempotency_key");
CREATE UNIQUE INDEX "payment_workspace_id_id_student_id_key"
    ON "payment"("workspace_id", "id", "student_id");

CREATE TABLE "payment_adjustment" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "payment_id" UUID,
    "kind" "payment_adjustment_kind" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "balance_impact" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "paid_on" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_adjustment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_adjustment_positive_amount_check" CHECK ("amount_minor" > 0),
    CONSTRAINT "payment_adjustment_balance_impact_check" CHECK ("balance_impact" IN (-1, 1)),
    CONSTRAINT "payment_adjustment_kind_impact_check" CHECK (
      ("kind" = 'discount' AND "balance_impact" = -1)
      OR ("kind" = 'refund' AND "balance_impact" = 1)
      OR "kind" = 'correction'
    )
);

CREATE TABLE "fee_rule" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "student_id" UUID,
    "group_id" UUID,
    "amount_minor" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "purpose" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_rule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fee_rule_positive_amount_check" CHECK ("amount_minor" > 0),
    CONSTRAINT "fee_rule_one_target_check" CHECK (
      ("student_id" IS NOT NULL AND "group_id" IS NULL)
      OR ("student_id" IS NULL AND "group_id" IS NOT NULL)
    )
);

ALTER TABLE "payment_adjustment"
    ADD CONSTRAINT "payment_adjustment_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "payment_adjustment_workspace_student_fkey"
      FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "payment_adjustment_workspace_payment_student_fkey"
      FOREIGN KEY ("workspace_id", "payment_id", "student_id")
      REFERENCES "payment"("workspace_id", "id", "student_id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fee_rule"
    ADD CONSTRAINT "fee_rule_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "fee_rule_workspace_student_fkey"
      FOREIGN KEY ("workspace_id", "student_id") REFERENCES "student"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "fee_rule_workspace_group_fkey"
      FOREIGN KEY ("workspace_id", "group_id") REFERENCES "group"("workspace_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "payment_adjustment_workspace_id_id_key"
    ON "payment_adjustment"("workspace_id", "id");
CREATE UNIQUE INDEX "payment_adjustment_workspace_id_idempotency_key_key"
    ON "payment_adjustment"("workspace_id", "idempotency_key");
CREATE INDEX "payment_adjustment_workspace_id_paid_on_idx"
    ON "payment_adjustment"("workspace_id", "paid_on");
CREATE INDEX "payment_adjustment_workspace_id_student_id_paid_on_idx"
    ON "payment_adjustment"("workspace_id", "student_id", "paid_on");

CREATE UNIQUE INDEX "fee_rule_workspace_id_id_key"
    ON "fee_rule"("workspace_id", "id");
CREATE INDEX "fee_rule_workspace_id_student_id_effective_from_idx"
    ON "fee_rule"("workspace_id", "student_id", "effective_from");
CREATE INDEX "fee_rule_workspace_id_group_id_effective_from_idx"
    ON "fee_rule"("workspace_id", "group_id", "effective_from");
CREATE UNIQUE INDEX "fee_rule_student_effective_from_key"
    ON "fee_rule"("workspace_id", "student_id", "effective_from")
    WHERE "student_id" IS NOT NULL;
CREATE UNIQUE INDEX "fee_rule_group_effective_from_key"
    ON "fee_rule"("workspace_id", "group_id", "effective_from")
    WHERE "group_id" IS NOT NULL;

ALTER TABLE "payment_adjustment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_adjustment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_adjustment_tenant_isolation" ON "payment_adjustment"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

ALTER TABLE "fee_rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_rule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fee_rule_tenant_isolation" ON "fee_rule"
    USING ("workspace_id" = "current_workspace_id"())
    WITH CHECK ("workspace_id" = "current_workspace_id"());

CREATE FUNCTION "prevent_financial_record_rewrite"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'financial ledger records are append-only';
END;
$$;

CREATE TRIGGER "payment_append_only"
    BEFORE UPDATE OR DELETE ON "payment"
    FOR EACH ROW EXECUTE FUNCTION "prevent_financial_record_rewrite"();
CREATE TRIGGER "payment_adjustment_append_only"
    BEFORE UPDATE OR DELETE ON "payment_adjustment"
    FOR EACH ROW EXECUTE FUNCTION "prevent_financial_record_rewrite"();
CREATE TRIGGER "fee_rule_append_only"
    BEFORE UPDATE OR DELETE ON "fee_rule"
    FOR EACH ROW EXECUTE FUNCTION "prevent_financial_record_rewrite"();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT ON TABLE "payment", "payment_adjustment", "fee_rule" TO kashkol_app;
    REVOKE UPDATE, DELETE ON TABLE "payment", "payment_adjustment", "fee_rule" FROM kashkol_app;
  END IF;
END $$;
