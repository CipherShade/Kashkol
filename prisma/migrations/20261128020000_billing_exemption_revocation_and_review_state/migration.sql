-- Forward-only billing remediation follow-up.
-- Adds explicit revocation time and submission/action-specific review replay keys.

ALTER TABLE "billing_exemption"
  ADD COLUMN "revoked_on" TIMESTAMPTZ(6);

UPDATE "billing_exemption"
  SET "revoked_on" = "updated_at"
  WHERE "status" = 'revoked' AND "revoked_on" IS NULL;

ALTER TABLE "billing_payment_submission"
  ADD COLUMN "review_action" "billing_review_action";

UPDATE "billing_payment_submission"
  SET "review_action" = CASE "status"
    WHEN 'under_review' THEN 'under_review'::"billing_review_action"
    WHEN 'approved' THEN 'approved'::"billing_review_action"
    WHEN 'rejected' THEN 'rejected'::"billing_review_action"
    WHEN 'flagged' THEN 'flagged'::"billing_review_action"
    ELSE NULL
  END
  WHERE "review_idempotency_key" IS NOT NULL;

DROP INDEX IF EXISTS "billing_payment_submission_workspace_id_id_review_idempotency_key_status_key";
CREATE UNIQUE INDEX "billing_submission_review_idem_action_key"
  ON "billing_payment_submission" ("workspace_id", "id", "review_idempotency_key", "review_action");

-- Revocation time is part of the overlap semantics, so keep it in the index
-- expression that backs the exclusion constraint.
ALTER TABLE "billing_exemption"
  DROP CONSTRAINT IF EXISTS "billing_exemption_no_overlap";
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
