-- Migration: 20261108000000_session_pricing
--
-- Adds:
--   group.default_price_per_student_minor  — default session price for a group
--   teaching_session.price_per_student_minor — per-session price override
--   payment.session_id — links a payment record to a specific session

-- group: default price per student (piastres / minor currency unit)
ALTER TABLE "group"
  ADD COLUMN "default_price_per_student_minor" INTEGER;

-- teaching_session: per-session price override
ALTER TABLE "teaching_session"
  ADD COLUMN "price_per_student_minor" INTEGER;

-- payment: optional FK to the session this payment covers
ALTER TABLE "payment"
  ADD COLUMN "session_id" UUID;

ALTER TABLE "payment"
  ADD CONSTRAINT "payment_workspace_id_session_id_fkey"
  FOREIGN KEY ("workspace_id", "session_id")
  REFERENCES "teaching_session" ("workspace_id", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "payment_workspace_id_session_id_idx"
  ON "payment" ("workspace_id", "session_id")
  WHERE "session_id" IS NOT NULL;
