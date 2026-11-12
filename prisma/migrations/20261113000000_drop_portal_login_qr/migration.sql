-- Migration: 20261113000000_drop_portal_login_qr
--
-- Removes the portal-login QR prefill token from the student sign-in
-- identity table.
--
-- ADR-0027: a student's QR code has one purpose — attendance identification
-- (`student.qr_token_hash`, HMAC-signed). It must never sign a student in,
-- reset a password, or activate an account. The `/portal?t=` prefill token was
-- a QR used for portal login and is removed with this migration.
--
-- This migration replaces nothing: the attendance QR flow is unaffected.

DROP INDEX IF EXISTS "portal_login_qr_token_hash_key";

ALTER TABLE "portal_login"
  DROP COLUMN IF EXISTS "qr_token_hash",
  DROP COLUMN IF EXISTS "qr_token_expires_at";
