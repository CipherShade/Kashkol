-- Forward-only billing consistency follow-up.
-- Adds real idempotency keys for submissions and reviews, and makes the
-- already-modelled under_review state reachable through the review event log.

ALTER TYPE "billing_review_action" ADD VALUE IF NOT EXISTS 'under_review';

ALTER TABLE "billing_payment_submission"
  ADD COLUMN "idempotency_key" text;

UPDATE "billing_payment_submission"
  SET "idempotency_key" = "id"::text
  WHERE "idempotency_key" IS NULL;

ALTER TABLE "billing_payment_submission"
  ALTER COLUMN "idempotency_key" SET NOT NULL;

ALTER TABLE "billing_payment_submission"
  ADD COLUMN "review_idempotency_key" text;

CREATE UNIQUE INDEX "billing_payment_submission_workspace_id_idempotency_key_key"
  ON "billing_payment_submission" ("workspace_id", "idempotency_key");

CREATE UNIQUE INDEX "billing_payment_submission_workspace_id_review_idempotency_key_key"
  ON "billing_payment_submission" ("workspace_id", "review_idempotency_key");
