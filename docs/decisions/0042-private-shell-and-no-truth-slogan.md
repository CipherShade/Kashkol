# ADR-0042: Private readiness page and no truth slogan

- **Status:** Accepted (approved 2026-11-25)
- **Date:** 2026-11-25
- **Deciders:** Product owner (user direction) and engineering
- **Scope:** M0 public shell, M2 operations
- **Related:** `NF-1`–`NF-13`, `F-P0-04`, `ADR-0007`, `ADR-0030`

---

## Context

The removed tagline appeared in both message catalogues, the app shell, the landing footer, the
repository instructions, and two accepted ADRs. The product owner asked for it to be removed from
every place in the software entirely.

The readiness view at `/{locale}/status` was linked from the public landing footer. It shows the
application environment, migration state, and check details. The product owner directed that system
status is **private, not public**.

Nothing in this decision changes the prohibitions `NF-1`–`NF-13`; it changes only the words used to
describe them and who may see deployment status.

---

## Decision

1. The slogan is removed. `App.tagline` and `Landing.footer.tagline` are replaced in both locales
   with a neutral description of a private teaching workspace. The phrase does not appear in any
   source file, message catalogue, or document.
2. `/{locale}/status` is an **owner-only** page. Only an authenticated staff actor with the `owner`
   role can render it; anonymous, portal, and assistant actors receive the same `404` as an unknown
   page, so the route cannot be used to probe deployment internals.
3. The public landing footer no longer links to system status. The page keeps `noindex, nofollow`
   and stays out of the sitemap.
4. `/healthz` and `/readyz` remain unauthenticated infrastructure probes. They carry no tenant data
   and are required by the deployment platform; they are not the user-facing status page.
5. The two accepted ADRs that quoted the slogan (`ADR-0007`, `ADR-0030`) are amended in wording only.
   Their decisions and reasoning are unchanged; the editorial amendment is recorded here because
   accepted ADRs are otherwise immutable.

---

## Consequences

**Positive**

- No marketing claim states a product promise the owner wants reserved for internal engineering rules.
- Deployment details are not discoverable from the public site.
- `NF-1`–`NF-13` remain fully in force; the removal is cosmetic, not a weakening of truthfulness.

**Negative / trade-offs**

- Teachers and visitors can no longer check system status without signing in as the workspace owner.
- The shell tagline is now generic rather than a statement of product values.

**Neutral**

- Existing health and readiness probes are unaffected.
- No schema, permission, or route-registry change is needed: the page is an App Router page, not an
  API route.

---

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Keep the slogan in the landing page but remove it from the app shell | The owner asked for removal from every place, not a partial removal. |
| Keep a public status page with fewer details | Even reduced details expose deployment state; the owner asked for private status. |
| Delete `/status` entirely | An owner-only readiness view is useful during incidents and satisfies "private, not public" without losing it. |
| Leave historical ADR quotes as historical record | The owner asked for the phrase to disappear from the software entirely, and the quotes are not load-bearing for those decisions. |

---

## Revisit when

- The product owner asks for a public trust statement again; that needs a new ADR, not a reverted
  string.
- A support process requires non-owner access to deployment status; that needs an explicit private
  distribution mechanism, not a public page.
