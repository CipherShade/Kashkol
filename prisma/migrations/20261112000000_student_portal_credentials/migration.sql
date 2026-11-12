-- Migration: 20261112000000_student_portal_credentials
--
-- Adds teacher-provisioned student sign-in accounts (F-P3-01, F18).
--
-- `portal_login` is an identity table, not a tenant table. Sign-in happens
-- before a workspace is known, so the phone number must be resolvable without
-- a tenant GUC. It carries no workspace id, no student id, and no permission;
-- the tenant link remains in `portal_grant`, and the password remains in
-- Better Auth's `account` table as a scrypt hash.
--
-- The QR token stored here is a short-lived prefill token, not an
-- authentication secret. The student still has to type the teacher-generated
-- password. Revoking access clears the hash, which invalidates the printed QR.

-- PostgreSQL enum for the sign-in account state.
CREATE TYPE "portal_login_status" AS ENUM ('active', 'disabled');

-- New grantable resource. Assistants receive no grant by default.
ALTER TYPE "permission_resource" ADD VALUE IF NOT EXISTS 'portal_access';

CREATE TABLE "portal_login" (
    "id"                  UUID                 NOT NULL DEFAULT gen_random_uuid(),
    "portal_user_id"      TEXT                 NOT NULL,
    "username_phone"      TEXT                 NOT NULL,
    "status"              "portal_login_status" NOT NULL DEFAULT 'active',
    "password_set_at"     TIMESTAMPTZ(6)       NOT NULL,
    "qr_token_hash"       TEXT,
    "qr_token_expires_at" TIMESTAMPTZ(6),
    "created_at"          TIMESTAMPTZ(6)       NOT NULL DEFAULT now(),
    "updated_at"          TIMESTAMPTZ(6)       NOT NULL DEFAULT now(),

    CONSTRAINT "portal_login_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portal_login_portal_user_id_key"
  ON "portal_login"("portal_user_id");
CREATE UNIQUE INDEX "portal_login_qr_token_hash_key"
  ON "portal_login"("qr_token_hash");
CREATE INDEX "portal_login_username_phone_idx"
  ON "portal_login"("username_phone");

ALTER TABLE "portal_login"
  ADD CONSTRAINT "portal_login_portal_user_id_fkey"
  FOREIGN KEY ("portal_user_id")
  REFERENCES "user" ("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- Application role privileges. The table has no RLS because authentication
-- must resolve a phone number before a tenant is known; no route outside the
-- portal identity module may query it, and it stores no tenant identifier.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      "portal_login"
    TO kashkol_app;
  END IF;
END $$;
