-- Migration: 20261108000001_attendance_payment_verification
--
-- Adds:
--   attendance_mark.payment_verified — tracks whether payment was verified
--     during the attendance process for this student at this session.

ALTER TABLE "attendance_mark"
  ADD COLUMN "payment_verified" BOOLEAN NOT NULL DEFAULT FALSE;
