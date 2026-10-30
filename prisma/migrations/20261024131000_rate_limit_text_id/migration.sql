-- Better Auth's database rate limiter generates an opaque 32-character id for
-- each counter. The original UUID column rejected it, so the storage failed
-- closed on the first rate-limited request. The id is an internal bucket key,
-- never a tenant identifier.
ALTER TABLE "rate_limit" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
