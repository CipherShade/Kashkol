# ADR-0002: PostgreSQL with Prisma 7

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Engineering
- **Scope:** M0–M3
- **Serves:** `R-01` (tenant isolation), `R-02` (derived statistics drift), `F-P0-09` (platform baseline)

## Context

The application needs relational data with strong integrity guarantees: a student belongs to exactly
one workspace and one group; an attendance mark belongs to exactly one session and one student; a
payment belongs to exactly one workspace. Multi-tenant isolation must be enforceable at the data
layer, not only in application code.

Two constraints shape the ORM choice:

1. Prisma 7 is a major release with real breaking changes (ESM-only, explicit generator output,
   a required driver adapter, `prisma.config.ts` replacing implicit `.env` loading and package.json
   configuration, and the removal of `$use` middleware).
2. Prisma 8 exists only as a release candidate. Pinning `prisma@latest` today would silently move
   the project onto an RC.

## Decision

Use **PostgreSQL** as the single datastore, accessed through **Prisma 7.10.1** with
`@prisma/adapter-pg`.

- Pinned exactly: `prisma`, `@prisma/client`, `@prisma/adapter-pg` at `7.10.1`. Never `latest`
  while v8 remains a release candidate.
- The `prisma-client` generator is used with an explicit `output` path (`src/generated/prisma`), so
  the client is a normal source artefact and the engine is not resolved at runtime from a hidden
  location.
- The project is ESM. `package.json` declares `"type": "module"`.
- `prisma.config.ts` holds the schema path, the migration seed, and the adapter. It imports
  `dotenv/config` explicitly, because Prisma 7 no longer loads `.env` implicitly.
- Migrations run through `prisma migrate deploy` in the release phase. The schema is never pushed
  directly to a shared environment.
- `prisma generate` runs explicitly as a build step.
- The seed script is explicit (`prisma db seed` via the config), not a side effect of a migration.
- `$use` middleware is **not used**; it was removed in Prisma 7. Cross-cutting concerns are handled
  by explicit repository functions and by PostgreSQL RLS (ADR-0006).
- The application connects with a driver adapter over `pg`, using a pooled URL; migrations use a
  direct URL.
- The database role used by the application is **not** the table owner, which is a precondition for
  `FORCE ROW LEVEL SECURITY`.

## Consequences

### Positive

- A single datastore for all modules, with real foreign keys and constraints. Integrity is
  enforced by the database, not only by the ORM.
- RLS is available as the third isolation layer (ADR-0006).
- Prisma 7's generated client is fully typed and tree-shakeable, which keeps the client bundle small.
- PostgreSQL full-text search covers the scoped search requirement (`F-P2-08`) without an
  additional service.
- Explicit generator output means the client is committed-adjacent and reviewable rather than
  opaque.

### Negative

- Prisma 7's ESM-only requirement means the project cannot use CommonJS tooling without
  interop work.
- The driver adapter is one more layer between the ORM and the socket.
- Prisma's type generation slows the edit-compile loop compared with a thin query builder.
- The raw SQL required for `set_config` and for full-text search escapes the ORM's type safety and
  must be parameterised by hand and reviewed.

### Neutral

- Migrating away from Prisma later is possible; the SQL schema is the durable artefact.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Drizzle ORM** | Genuinely good — SQL-like, typed, small. Rejected because Prisma's schema-as-source-of-truth, migration tooling, and ecosystem integration are more mature, and the team knows Prisma. Recorded here so the choice is revisited if the ergonomics gap grows. |
| **Prisma 6** | Avoids the migration cost but is an older major with a shorter support window. No strong reason to stay behind. |
| **Prisma 8 RC** | A release candidate is not a foundation. Revisit when v8 is stable. |
| **Raw SQL with a query builder (Kysely / Slonik)** | Maximum control, maximum risk of hand-written errors across a large schema. Prisma's typed model is worth more here. |
| **MongoDB / a document store** | Rejected by `R-02`: the domain is strongly relational, and the integrity requirements are stated as database constraints. |
| **Prisma with SQLite for local development** | Divergence between local and production schemas is a defect generator, and SQLite cannot exercise RLS. |

## Revisit when

- Prisma 8 reaches a stable release.
- The Prisma 7 upgrade friction proves to be a recurring drag rather than a one-time cost.
- A workload emerges that PostgreSQL cannot serve (a specialised search or geospatial need of real
  scale).
