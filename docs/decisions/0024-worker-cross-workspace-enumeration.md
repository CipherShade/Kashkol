# ADR-0024: Worker workspace enumeration via a SECURITY DEFINER function

- **Status:** Accepted
- **Date:** 2026-11-08
- **Deciders:** Engineering
- **Scope:** M0–M3
- **Serves:** `F-P0-03` (i18n is client-side, nothing in the persistence layer needs access), `F-P2-07`/`F-P2-10` (asynchronous report export and messaging delivery need fan-out across workspaces), and the rule in `AGENTS.md` §2.2 that tenant data never leaks through a worker log.

## Context

The background worker (`npm run worker`) drains the message outbox *per workspace* and processes queued
report exports *across all workspaces*. Tenant tables, including `workspace`, are row-security filtered,
so neither path can enumerate the active workspaces directly without widening the tenant read policy.

The whole point of using the dedicated outbox token rather than a staff session is security isolation
(ADR-0009): the same credential must not reach two unrelated worker powers. Because the worker has no
session, it needs its own, cross-tenant identifier supply for fan-out — a role it cannot trust any more
than the web application.

## Decision

A `SECURITY DEFINER` function, `list_active_workspace_ids_for_worker()`, returns only the ids of active
non-deleted workspaces. It returns no name, member, student, or any other tenant field, and it does not
write. It is `STABLE` so it may be cached within a transaction; it is not `LEAKPROOF`, because the
caller is a trusted authenticated process — a tenant caller is not granted `EXECUTE`.

```sql
CREATE OR REPLACE FUNCTION list_active_workspace_ids_for_worker()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id
  FROM workspace
  WHERE status = 'active' AND deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION list_active_workspace_ids_for_worker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_active_workspace_ids_for_worker() TO kashkol_app;
```

`workerPollIntervalMs()` reads `WORKER_POLL_INTERVAL_SECONDS` (default 30 s) once per poll cycle, which is
a wide enough window that caching the id set for the cycle costs almost nothing. The polling cadence itself
bounds how many times the `FOR UPDATE SKIP LOCKED` claim can be attempted within a clean idle interval.

## Consequences

### Positive

- The worker fetches only `uuid` identifiers, never tenant rows — the data-leak prohibition applies to the
  whole traversal and the error envelope, not just JSON fields.
- No schema change to the tenant tables is needed to allow the cross-workspace fan-out; RLS stays focused
  on data scope, and `workspace` exposes no raw PII through this function anyway.
- A new workspace appears between cycles with at most one missed drain; the next pass picks it up.

### Negative

- Migration drift is slightly harder to reason about: the newest migration (`REQUIRED_MIGRATION_NAME`)
  must own both the function creation and its grant. Update `migration-state.ts` whenever the function name
  or grant changes (as did today).
- The cross-workspace enumeration is a deliberate trust boundary: only the `kashkol_app` role is granted
  `EXECUTE`; no admin role, no superuser, and no public caller.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **A dedicated `active_workspaces` view owned by `kashkol_app`** | Adds a whole read-only projection just to answer "which workspaces has a pending outbox?"; the function already answers the question and avoids widening the RLS policy surface. |
| **The worker re-implements authorization bypass** | Violates the security model that the messaging outbox worker token is dedicated and system-actor only (ADR-0009). A bypass is precisely what the dedicated token exists to prevent. |
| **Raw `SELECT DISTINCT workspace_id FROM workspace_member WHERE status='active'`** | Reuses a different table than the global-status query; duplicated logic, different policy surface (member vs. workspace status), and the simpler, narrower query is clearly better. |
