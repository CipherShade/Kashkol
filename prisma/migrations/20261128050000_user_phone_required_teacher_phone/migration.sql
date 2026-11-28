-- Global identity-support table for the required teacher phone.
-- No workspace id and no RLS, like `user_preference` and `portal_login`:
-- the row belongs to the Better Auth user, not to a tenant.

CREATE TABLE "user_phone" (
    "user_id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "user_phone_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_phone_phone_e164_check"
      CHECK ("phone_e164" ~ '^\+[1-9][0-9]{6,14}$')
);

-- Deliberately non-unique: one phone may belong to several teachers.
CREATE INDEX "user_phone_phone_e164_idx" ON "user_phone" ("phone_e164");

ALTER TABLE "user_phone"
    ADD CONSTRAINT "user_phone_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kashkol_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "user_phone" TO kashkol_app;
  END IF;
END $$;
