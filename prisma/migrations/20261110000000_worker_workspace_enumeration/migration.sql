-- Worker workspace enumeration (`ADR-0024`).
--
-- The background worker (`npm run worker`) drains the message outbox per
-- workspace. Tenant tables, including `workspace`, are row-security filtered,
-- so the worker cannot enumerate the active workspaces directly.
--
-- This function returns the identifiers of active, non-deleted workspaces
-- only. It returns no name, member, student, or any other tenant field. It
-- never writes. The function is STABLE so it may be cached within a
-- transaction; it is not LEAKPROOF because the caller is a trusted,
-- authenticated process — a tenant caller is not granted EXECUTE.

CREATE OR REPLACE FUNCTION "list_active_workspace_ids_for_worker"()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT "id"
  FROM "workspace"
  WHERE "status" = 'active'
    AND "deleted_at" IS NULL;
$$;

REVOKE ALL ON FUNCTION "list_active_workspace_ids_for_worker"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "list_active_workspace_ids_for_worker"() TO kashkol_app;
