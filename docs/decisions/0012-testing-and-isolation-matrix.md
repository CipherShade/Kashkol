# ADR-0012: Generated testing and isolation matrices

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Engineering
- **Scope:** M0–M3
- **Serves:** `R-01` (tenant isolation), `R-15` (permissive defaults), `NF-9` (no fake tenant isolation), `F-P0-01`, `F-P2-01`

## Context

The requirements make automated verification a release gate, not a nicety:

- `F-P0-01` AC-6: a continuous automated isolation suite that verifies no cross-tenant data access
  and blocks a merge.
- `F-P2-01` AC-3: role-based permissions enforced server-side, verified for each role.
- `NF-9`: isolation is enforced in the data layer **and** verified by tests that run on every
  build — the verification is part of the requirement, not a practice.
- `NF-8`: a hidden button is not a permission, so the check has to happen at the endpoint, not in
  the UI.

A hand-written test per endpoint does not scale: it is written once, and the next endpoint is
uncovered. Worse, hand-written isolation tests tend to test the endpoints someone was worried about,
not the ones where a mistake is easy.

The tenant isolation matrix has an additional property: it must be **complete**. A test suite that
covers 80% of the routes is silently wrong about the other 20%.

## Decision

**Generate the isolation and permission matrices from a registry, and make the generated tests
block a merge.**

**Route registry.**

- `src/lib/routes/registry.ts` is the single declarative list of every route: its path, the
  HTTP method, the required permission, the actor kinds allowed, and the tenant-scoped resource it
  touches.
- A CI check fails if a route handler exists that is not in the registry. New routes are therefore
  covered by construction, not by remembering to write a test. **[CI]**

**Generated tests.**

- `scripts/generate-tenancy-matrix.ts` reads the registry and emits a Vitest suite with one case per
  route × actor kind.
- Each case runs against a **real database with real RLS policies** — two workspaces seeded with
  distinguishable data — and asserts that workspace A cannot read or write workspace B's resource.
- `scripts/generate-permission-matrix.ts` emits one case per role × permission, asserting that a
  role denied a permission receives `403` from the API, not merely a hidden menu item.
- The generated files are committed so a reviewer can read the diff, and CI regenerates them and
  fails if the committed output differs from the registry. A stale matrix is a build failure.

**Layered test suite.**

| Layer | Tool | Scope | Gate |
|---|---|---|---|
| Unit | Vitest | Pure domain logic, aggregates, formatters, token helpers | Blocks merge |
| Integration | Vitest + real Postgres | Repositories, services, RLS, outbox, adapters | Blocks merge |
| Generated isolation | Vitest (generated) | Every route × actor kind | Blocks merge |
| Generated permissions | Vitest (generated) | Every role × permission | Blocks merge |
| Contract | Vitest | Each adapter against a recorded expectation; a fake adapter in unit tests | Blocks merge |
| E2E | Playwright | Critical user journeys, both locales, light and dark | Blocks merge |
| Accessibility | axe | Every E2E page | Blocks merge |
| Static | ESLint + TypeScript | Import boundaries, forbidden patterns, type safety | Blocks merge |

**Rules.**

- A failing isolation or permission test is never disabled or skipped. If a test is wrong, it is
  fixed in the same commit that changes the behaviour.
- Tests are deterministic: no network, no wall-clock dependence (the clock is injected), no shared
  mutable fixtures, no ordering assumptions.
- Each test gets an isolated transaction or a rolled-back fixture, so a failing test does not poison
  the next one.
- The clock, the UUID generator, and the adapters are injected, so time-based rules (session
  expiry, QR rotation, daily reminders) are testable without sleeping.

## Consequences

### Positive

- Coverage is complete by construction: a new route without a registry entry fails CI, and a
  registered route automatically gets an isolation test.
- The isolation guarantee is verified against the real database, so it tests the actual RLS
  behaviour rather than a mock of it.
- The matrix is readable by a non-engineer, which makes the security posture reviewable.
- Permission enforcement is tested at the API boundary, catching a UI-only guard.
- Deterministic tests run fast enough to run on every push.

### Negative

- The registry is a second place to declare a route, and the CI check exists because a stale
  registry is a real risk.
- Generation adds a build step and a committed artefact to maintain.
- A real database is required for the test suite, so CI needs a Postgres service.
- Generated test names can be long and repetitive, which makes a failure message noisy until the
  registry entry is read.
- Writing a good registry entry requires thought; it is not free, and it forces the permission
  model to be explicit at design time.

### Neutral

- The registry doubles as documentation of the permission model and as input to the security
  controls matrix in `SECURITY_AND_PRIVACY.md` §11.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Hand-written tests per endpoint** | Incomplete by default and does not scale past a small number of routes. The requirement is a *continuous* suite. |
| **Snapshot testing of API responses** | Detects change but not authorisation defects, and produces brittle, low-signal snapshots. |
| **Contract testing against a schema** | Useful for the adapters, insufficient for isolation: it cannot express "actor A must not see actor B's data". |
| **A SaaS tool for tenancy penetration testing** | Adds a vendor, cannot run per pull request, and cannot know the permission model. |
| **Manual QA matrices** | Not automatable, not a merge gate, and immediately stale. |

## Revisit when

- The number of routes makes a single generated file unwieldy and needs splitting by module.
- The permission model becomes conditional enough (per-resource overrides, field-level grants) that
  a static matrix cannot express it.
- Test runtime becomes a bottleneck that blocks the merge gate from being fast enough to be useful.
