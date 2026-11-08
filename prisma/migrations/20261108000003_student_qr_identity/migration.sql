-- Migration: 20261108000003_student_qr_identity
--
-- Adds:
--   student.qr_token_hash — SHA-256 hash of the student's permanent QR token.
--
-- Only the hash is stored. The plaintext token is delivered once (to the
-- student's QR display) and never written to a log or an audit diff.
-- The UNIQUE constraint ensures one active token per student.
-- Setting the value to NULL revokes the token.

ALTER TABLE "student"
  ADD COLUMN "qr_token_hash" TEXT;

-- Global unique index: a hash must not be reused across workspaces.
-- This prevents a compromised hash from being replayed in another tenant.
CREATE UNIQUE INDEX "student_qr_token_hash_key"
  ON "student" ("qr_token_hash")
  WHERE "qr_token_hash" IS NOT NULL;
