# ADR-0003: Better Auth instead of Auth.js v5

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Engineering
- **Scope:** M0–M3
- **Serves:** `F-P0-02`

## Context

Authentication is a hard requirement with explicit acceptance criteria (`F-P0-02`): a 10-character
minimum password, email verification, server-side sessions in an `HttpOnly`/`Secure`/`SameSite`
cookie, a 30-day sliding expiry with a 90-day absolute cap and a 12-hour idle timeout, immediate
sign-out, sign-out-everywhere, rate limiting, single-use reset links, and an auth audit.

The application also needs **roles** (owner / assistant / parent / student) and **workspace
membership**, plus a portal session type that is fundamentally different from a staff session — a
portal session must never be able to call a teacher endpoint.

Two candidate libraries were evaluated against those criteria.

## Decision

Use **Better Auth `1.7.12`** with `@better-auth/prisma-adapter`, as the authentication and
session layer, behind a thin internal `identity` module.

- Sessions are stored server-side in the database via the Prisma adapter.
- The session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefixed. No token is
  placed in `localStorage`, a URL, or a query string.
- Better Auth's built-in rate limiting is enabled in production, with limits stored in the
  database so they survive a restart and work across instances.
- Better Auth's **organization plugin** is used for workspace membership and roles, so the library
  owns the membership model rather than the application hand-rolling it.
- The product's session policy is **not** delegated to library defaults. `session.expiresIn`,
  `session.updateAge`, the 12-hour idle timeout, the 90-day absolute cap, and the
  sign-out-everywhere path are enforced by the `identity` module and covered by a session-policy
  test. Better Auth's default 7-day expiry with a 1-day refresh does not satisfy `F-P0-02` AC-4.
- Portal (parent/student) sessions use a separate session kind. The route groups are separate, and
  a shared guard rejects a portal actor on a teacher route with `403`.
- The auth tables are owned by the `identity` module; other modules read identity through its
  public API.

## Consequences

### Positive

- Sessions are server-side by default, which satisfies `F-P0-02` AC-3 without custom token
  plumbing.
- Rate limiting is built in and configurable, covering the sign-up throttle and the failed-attempt
  lockout.
- The organization plugin removes a large amount of hand-written membership and invitation code.
- The Prisma adapter keeps the schema in the same migration history as the rest of the application.
- Better Auth is stable and actively released, unlike Auth.js v5.

### Negative

- The library's opinionated defaults must be overridden explicitly, and a library upgrade can
  change a default silently. Mitigated by the session-policy test, which fails if a default
  drifts.
- The organization plugin introduces its own membership tables alongside the application schema,
  which is one more thing to understand when debugging.
- Better Auth's API surface is broad; the application must constrain it to a small internal
  `identity` surface so business code cannot couple to the library.
- Rate limiting backed by the database adds write volume on the auth path.

### Neutral

- The `identity` module is a thin anti-corruption layer. Replacing the library later is a
  contained change.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Auth.js (NextAuth) v5** | Auth.js v5 has remained in beta for years, and its session and organization model does not match the product's needs as closely. Using a beta in the authentication path of a system holding minors' data is an unacceptable risk. |
| **Lucia** | The author deprecated the library, recommending that applications implement sessions directly. Rejected: session security is not a good place for a from-scratch implementation. |
| **Clerk / Auth0 / Supabase Auth** | Hosted identity services. Rejected because the portal session model and the workspace membership model need custom behaviour, which a hosted provider would force us to reimplement outside the provider anyway, while adding a vendor dependency and a per-user cost for a product whose users are individual private teachers. |
| **Hand-rolled sessions with `iron-session` / `jose`** | Full control and no lock-in, but session issuance, rotation, revocation, rate limiting, and reset-link handling are exactly the areas where subtle defects leak accounts. The cost of writing them well exceeds the cost of configuring a library. |
| **Supabase (full stack)** | Attractive: Postgres, auth, storage, and RLS together. Rejected because it replaces the deployment and data-layer decisions (ADR-0002, ADR-0011) with a vendor platform, and the product's constraint is self-hosted-in-the-cloud control with a predictable cost. |

## Revisit when

- Better Auth's organization plugin cannot express the owner/assistant/parent/student model with
  the required portal isolation.
- A major Better Auth release changes the session defaults or the adapter contract in a way the
  override layer cannot absorb.
- Multi-factor authentication becomes a stated requirement — Better Auth supports it, and this ADR
  would be revisited to confirm the approach rather than to replace the library.
