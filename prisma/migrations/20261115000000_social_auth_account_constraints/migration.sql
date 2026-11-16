-- Migration: 20261115000000_social_auth_account_constraints
--
-- Social authentication (Google / Facebook) is added this milestone. Better
-- Auth stores each identity on the existing `account` table (providerId +
-- accountId). Two unique constraints are added:
--
--   1. (providerId, accountId) -- one OAuth identity can exist as at most one
--      account row in the whole database. Without this, a race between two
--      concurrent first sign-ins could create duplicate rows for the same
--      Google/Facebook subject.
--   2. (userId, providerId)    -- one user can hold at most one account per
--      provider. This is the database-level half of the explicit
--      linking-only policy: `linkSocial()` can never create a second Google
--      row for the same user, and a provider identity cannot be attached to
--      two users.
--
-- No new table and no column changes are required: `account` already carries
-- providerId/accountId (+ OAuth token columns) used by Better Auth.
--
-- Pre-check: before applying, duplicates on both column pairs were verified
-- to be zero (see docs/STATUS.md, social auth milestone). The live table
-- contains only `credential` rows.

CREATE UNIQUE INDEX "account_provider_id_account_id_key"
  ON "account" ("providerId", "accountId");

CREATE UNIQUE INDEX "account_user_id_provider_id_key"
  ON "account" ("userId", "providerId");
