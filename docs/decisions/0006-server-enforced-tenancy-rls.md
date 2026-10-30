# ADR-0006: Server-enforced tenancy with PostgreSQL RLS

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Engineering
- **Scope:** M0–M3
- **Serves:** `R-01`, `F-P0-01`, `F-P0-09`

## Context

Multi-tenant isolation is the product's core trust claim (`R-01`) and the highest-severity failure
mode. A single query that forgets a `workspace_id` filter exposes another teacher's students,
attendance, and notes. The requirements demand layered defence and continuous verification
(`F-P0-01`): session-derived scope, a repository layer, database-level enforcement, and an
automated isolation suite that blocks a merge.

Application-code filtering alone is one line away from a leak, and code review cannot catch every
instance across a large schema. PostgreSQL Row Level Security makes the isolation a property of the
database rather than of a developer's memory.

## Decision

Enforce tenancy at **three independent layers**, with PostgreSQL RLS as the final, non-bypassable
one.

1. **Session-derived scope.** The workspace id comes from the session and is never read from a URL
   parameter, a body field, or a client-controlled header.
2. **Repository scoping.** Every read and write goes through a repository function in
   `src/modules/<module>/repository.ts` that applies the workspace filter explicitly. Prisma is
   imported only in repository files and in `src/lib/db/`, enforced by an ESLint
   `no-restricted-imports` rule. **[CI]**
3. **PostgreSQL RLS.** Every tenant table carries:

   ```sql
   ALTER TABLE student ENABLE ROW LEVEL SECURITY;
   ALTER TABLE student FORCE ROW LEVEL SECURITY;
   CREATE POLICY student_tenant_isolation ON student
     USING (workspace_id = current_setting('app.workspace_id', true)::uuid)
     WITH CHECK (workspace_id = current_setting('app.workspace_id', true)::uuid);
   ```

   `FORCE ROW LEVEL SECURITY` applies the policy to the table owner as well, so a query issued by
   the migration role is not exempt.

**The scoping mechanism.** Every request that touches tenant data runs inside a transaction that
begins with:

```sql
SELECT set_config('app.workspace_id', $1, true);
```

The third argument `true` makes the setting **transaction-local**, so a pooled connection cannot
leak a tenant scope to the next request. A query executed outside such a transaction sees
`current_setting('app.workspace_id', true)` as empty and therefore matches **zero rows** — fail
closed, not open.

**Supporting rules.**

- The application connects as a role that is **not** the table owner, and it holds no `BYPASSRLS`
  attribute.
- Only `tenant`-prefixed tables carry RLS. Shared reference tables (a currency list, a country
  list) are explicitly exempt and are listed in the tenant-table registry.
- The tenant-table registry lives at `src/lib/db/tenant-tables.ts`. A CI check asserts that every
  table with a `workspace_id` column has an RLS policy and appears in the registry, and that every
  registered table actually has a `workspace_id`. **[CI]**
- A route registry drives a generated isolation matrix (`scripts/generate-tenancy-matrix.ts`,
  ADR-0012), so every registered route is exercised against a second workspace.
- A cross-tenant access returns `404` (resource not found) or `403` (no permission) with a
  **byte-identical body** in both cases, so the API never reveals that a resource exists elsewhere.

## Consequences

### Positive

- A forgotten `where` clause does not leak data: RLS filters the result set regardless.
- The failure mode is fail-closed. A missing scope yields an empty result, not a full one.
- The isolation suite tests the real database with real policies, not a mock.
- Layered defence means a defect in one layer is not sufficient to breach isolation.
- The isolation guarantee becomes a property of the schema, so it survives refactoring.

### Negative

- Every tenant query must run inside a scoped transaction. This is a discipline cost, and a
  transaction is longer-lived than a bare query.
- Prisma's interactive transactions are the natural fit, and an interactive transaction must not
  span a network call (ADR-0008).
- `set_config` cannot be used with a client-side transaction (`$transaction([])`) in a portable
  way, so the pattern is restricted to interactive transactions or raw SQL within one.
- Raw SQL is required for the scoping statement and for the full-text search, which reduces
  type safety at those two points.
- RLS policies make local debugging confusing: a query returning nothing usually means a missing
  scope rather than missing data.
- Migrations that touch tenant tables must keep the policy in sync; a migration that drops a policy
  is caught by the CI check rather than by review.

### Neutral

- The tenant-table registry is also the source of truth for the export scope and the deletion
  cascade, so it earns its keep beyond RLS.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Application-level filtering only** | One missing filter leaks data. This is the failure the product's core promise forbids. |
| **Separate database per tenant** | Strongest isolation, but per-tenant migrations, per-tenant connection pools, and a much higher cost for a product sold to individual teachers. Also incompatible with the planned single Railway service. |
| **Schema-per-tenant** | The same operational cost as database-per-tenant with a different shape. No. |
| **RLS without repository scoping** | Would work, but it hides the tenant boundary from application code and makes errors hard to diagnose. Layering is deliberate. |
| **Repository scoping without RLS** | Acceptable in a small system; not acceptable here, because the requirements demand continuous automated verification and defence in depth. |
| **An ORM-level tenant extension** | Prisma removed `$use` middleware in v7, and extension ecosystems do not provide database-level enforcement. |
| **CockroachDB / another distributed SQL** | Rejected: no requirement needs multi-region writes, and RLS support and portability are better with PostgreSQL. |

## Revisit when

- A tenant count or write volume makes separate databases or schemas operationally necessary.
- A requirement forces a cross-tenant query that RLS cannot express (for example, a platform-level
  aggregate). That aggregate must be computed by a dedicated role with a deliberate, audited policy
  exception rather than by weakening the tenant policy.
