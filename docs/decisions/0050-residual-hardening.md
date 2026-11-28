# ADR-0050: Residual hardening of origins, evidence downloads, audit diffs, and Cairo time

- **Status:** Accepted (hardening decision, 2026-11-28)
- **Date:** 2026-11-28
- **Deciders:** Engineering, under the instruction to finish the engineering-side items left after the billing audits
- **Scope:** Cross-cutting security and billing correctness hardening
- **Serves:** `F-P0-07`, `F-P3-03`, `F-P3-04`, `F28`, `R-01`, `R-08`, `R-15`, `NF-5`, `NF-7`, `NF-8`, `NF-9`
- **Related:** `ADR-0014`, `ADR-0045`, `ADR-0047`, `ADR-0048`, `ADR-0049`

---

## Context

The first billing audit listed several hardening concerns that were not confirmed exploitable but should not be left indefinite: a CSRF helper that trusted any `*.trycloudflare.com` origin, 180-second bearer URLs for billing evidence, a free-text reason pattern in platform-admin audit diffs outside billing, and a theoretical DST convergence edge in the Cairo month helper. The audit also noted a global billing-config table readable by every app connection, possible reference-normalization collisions, per-workspace invoice numbering, and one ledger row per student in very large workspaces. Those last items either need legal/product decisions or a production database-role/load-test change; they must not be silently redesigned here.

## Decision

The application-level origin guard accepts only the configured `BETTER_AUTH_URL` origin and exact origins explicitly listed in `BETTER_AUTH_TRUSTED_ORIGINS`. Wildcards, URL paths, and malformed values are ignored rather than trusted by both the guard and the Better Auth option, so an invalid operator entry cannot widen either check. A missing `Origin` header remains accepted only for non-browser callers, as before.

Billing evidence is no longer returned as a signed bearer URL. The authorised route re-authenticates the active platform administrator, resolves the submission inside the target workspace's scoped transaction, reads the stored object, and streams the bytes back with `private, no-store` headers. The `billing.evidence.viewed` audit event is appended only after the bytes were successfully read. Generic material downloads keep their existing scoped, short-lived signed URL flow.

Platform-admin audit diffs use the same deny-list redactor as tenant audit diffs and go through the single `writeAuditEvent` path. Typed `reason`, `statusReason`, and similar fields are stripped from structured diffs. The operator-facing `platform_audit_event.reason` column remains the explicit, ticket-referenced reason required by `F-P3-03`; it is not used as a free-text container for student data.

Cairo wall-clock conversion derives UTC offsets from `Intl` on both sides of the target. Ambiguous local times resolve to the earliest matching instant; nonexistent local times resolve to the first valid instant after the skipped interval. No fixed UTC offset or unbounded convergence loop is used.

The global config table remains a server-only platform table: no tenant-facing route returns the raw table, and Prisma access remains confined to repositories. `OQ-23`–`OQ-25` were subsequently closed by the product owner in `ADR-0051`; exact bank reference normalization, legal/tax invoice numbering, evidence retention, and external-accountant involvement were **not** specified by that decision and remain undocumented details. Archived-student inclusion is now decided in `ADR-0051`; large-workspace load characteristics still require a load test.

## Consequences

### Positive

- A third party cannot pass the origin check merely by hosting a tunnel on `trycloudflare.com`.
- An intercepted evidence link cannot be replayed by another principal, and the evidence response is never cached.
- A typed support reason can no longer become a repository of student names or phone numbers in a structured audit diff.
- Cairo month boundaries are deterministic across DST transitions.

### Negative

- A local tunnel URL must be configured explicitly in `BETTER_AUTH_TRUSTED_ORIGINS`; the old wildcard behaviour is gone.
- Billing evidence bytes now pass through the application route instead of a direct storage redirect.
- `writeAuditEvent` accepts an optional injected `createdAt` so repository callers keep deterministic audit timestamps.

### Neutral

- No migration, schema change, dependency, or production configuration/data change is introduced.
- The business model is unchanged: free and unlimited teacher access, 99 piastres per qualifying student per Cairo month, manual InstaPay ledger, and no gateway.
- At the time of this ADR, `OQ-23`–`OQ-25` remained open; they were closed by the product owner in `ADR-0051` without changing this ADR's hardening.

## Alternatives considered

- **Keeping the wildcard tunnel rule.** Rejected: it trusts every tunnel host, not the operator's tunnel.
- **Keeping short-lived bearer URLs for evidence.** Rejected: possession alone grants access, including to another principal.
- **Changing platform-admin schemas to coded reason keys.** Rejected: `F-P3-03` requires a stated reason ticket; redacting the structured diff preserves that requirement without storing personal data there.
- **Using a fixed UTC offset for Cairo.** Rejected: Egypt observes DST; a fixed offset can move a month boundary.
- **Redesigning global config access or invoice numbering.** Deferred: these require a production database-role change or a legal/product decision, not a quiet engineering choice.

## Revisit when

- A non-local deployment needs multiple exact origins and the operator supplies them explicitly.
- The product owner changes the closed `OQ-23`–`OQ-25` decisions recorded in `ADR-0051`, or a legal/accounting detail is formally assigned.
- A load test shows the per-student ledger design needs batching or a different granularity.
- A database-role strategy is adopted that restricts global config reads to a dedicated service connection.
