-- Migration: 20261113000002_session_scoped_finance
--
-- ADR-0028: the manual ledger is now session-scoped, not student-scoped.
--
-- Changes:
--   1. `payment.student_id` becomes nullable. New payments are created against
--      a `session_id` (session receipts). Existing rows keep their `student_id`.
--   2. `payment_adjustment.student_id` becomes nullable (adjustments link to
--      the session-linked `payment`, not to a student).
--   3. A CHECK constraint ensures that new session-scoped rows always carry a
--      session: if `student_id IS NULL`, then `session_id IS NOT NULL`.
--   4. `attendance_mark.payment_verified` is dropped: it was the per-student
--      link between an attendance mark and a payment row, and it is no longer
--      meaningful in the session-scoped model.

ALTER TABLE "payment"
  ALTER COLUMN "student_id" DROP NOT NULL;

ALTER TABLE "payment_adjustment"
  ALTER COLUMN "student_id" DROP NOT NULL;

ALTER TABLE "payment"
  ADD CONSTRAINT "payment_session_required_check" CHECK (
    "student_id" IS NOT NULL
    OR "session_id" IS NOT NULL
  );

ALTER TABLE "attendance_mark"
  DROP COLUMN IF EXISTS "payment_verified";

CREATE INDEX IF NOT EXISTS "payment_workspace_id_session_id_idx"
  ON "payment"("workspace_id", "session_id")
  WHERE "session_id" IS NOT NULL;
