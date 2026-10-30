# ADR-0001: Modular monolith on Next.js App Router

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Engineering
- **Scope:** M0–M3
- **Serves:** `R-04` (feature creep), `R-11` (data growth against the infrastructure budget)

## Context

Kashkol must ship a multi-tenant SaaS with authentication, tenant isolation, students, attendance,
homework, assessments, files, messaging, and payments — for private Egyptian teachers, on a budget,
with a small team, while supporting Arabic RTL.

The system has genuine transactional boundaries (an attendance session and its marks must commit
atomically) and genuine asynchronous work (email, file scanning, exports, retention). It does
**not** have independent scaling requirements: no module needs a different scale factor from the
others, and no team boundary exists.

The deployment target is a single Railway service. Splitting into microservices would add network
latency to every call, distributed transactions to every write, and an operational surface that a
small team cannot maintain — all to solve a problem the product does not have.

## Decision

Build a **modular monolith** on the Next.js App Router, deployed as a single application plus a
single worker process running the same codebase.

- One deployable unit. One database. One migration history.
- The codebase is organised into **domain modules** under `src/modules/<module>/`, each with an
  explicit public surface (`index.ts` barrel) and private internals. Cross-module access goes
  through the barrel; internal files are not imported across module boundaries.
- Modules do not share tables: each module owns its tables and exposes repository functions.
- A module may not import another module's repository directly; it calls the other module's
  service or its public API.
- The job worker is a second entrypoint into the same application, not a separate codebase.
- Server Components are used for reads; Server Actions are used for mutations that originate in a
  form, with a route handler used where a URL must be bookmarkable, shareable, or callable by a
  third party.

Module boundaries are the mechanism that keeps a monolith from becoming a ball of mud. They are
enforced by an ESLint `no-restricted-imports` rule: importing `src/modules/<other>/repository`
from a different module is a lint error. **[CI]**

## Consequences

### Positive

- One deployment, one database, one migration pipeline. Operational cost stays proportional to a
  small team.
- Cross-module transactions are ordinary local transactions — exactly what the attendance flow
  needs.
- Refactoring across a module boundary is a local change because the dependency direction is
  explicit.
- The stack is one language and one framework: TypeScript, React, and the server runtime.
- Local development needs one process and one database.

### Negative

- A single deployment means a single blast radius: a bad deploy affects every module.
- The module boundaries are conventions plus lint rules, not a compiler-enforced boundary.
- A hot module cannot scale independently; the whole app scales as one unit.
- Running the app as a Next.js server means the request runtime and the job runtime share a
  codebase; the entrypoint split must be maintained.

### Neutral

- The product remains deployable on any Node-compatible platform, so the Railway decision is not
  permanent.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Next.js + a separate Express/Fastify API** | Two runtimes, two deployment units, duplicated type definitions, and an extra network hop for every call, for no current benefit. |
| **Microservices** | Requires independent scaling or team autonomy, neither of which exists. Adds distributed transactions to core flows and multiplies the deployment surface. Deferred by ADR-0013. |
| **A non-Next.js backend (NestJS / Fastify) + Next.js frontend** | Attractive for clean layering, but duplicates the framework, complicates SSR data access, and adds a second build and deploy pipeline. |
| **TanStack Start / Remix / other routers** | Next.js has the strongest React ecosystem alignment and a stable App Router. The team knows it. |
| **A single-file "vertical slice" architecture with no module structure** | Fastest to start, and it is how monoliths rot. Rejected: module boundaries are the whole value of the modular monolith. |

## Revisit when

- A module needs to scale independently of the rest (measured, not assumed).
- A second team takes ownership of a module and needs an independent release cadence.
- The job workload saturates the application host and the separate worker process no longer
  isolates it.
- The legal review requires data residency in a region that a single deployment cannot satisfy.
