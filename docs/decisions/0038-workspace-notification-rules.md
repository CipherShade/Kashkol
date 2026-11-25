# ADR-0038 — Workspace notification rules and a session-scoped overdue alert

**Date:** 2026-11-24

**Status:** Accepted

**Deciders:** Engineering

**Related:** `F-P2-07`, `F-P0-10`, `ADR-0028` (session-scoped finance), `NF-1`, `NF-13`

---

## Context

`F-P2-07` requires five rule-generated staff alerts, workspace configuration, a cooldown with no
duplicate alerts for the same condition, deep links, and an optional opt-in email digest. The
requirement says "outstanding payment beyond N days", but `ADR-0028` removed per-student balances,
debts, and outstanding amounts. The two documents disagree on the word "outstanding".

## Decision

1. `workspace_settings.notification_rule_config` stores five independent rule switches, a cooldown
   in hours, and an `N`-day threshold for the overdue-receipt rule. Missing or malformed JSON falls
   back to safe defaults; strict Zod validation is shared with the settings UI. The existing
   `email_digest_enabled` column is the explicit opt-in.
2. Rule evaluation creates a notification only when no notification for the same
   `conditionKey` exists inside the cooldown window. The key is stored in the notification's
   `metadata` and a window bucket is included in the database dedupe key, so RLS and the existing
   unique constraint enforce the rule without a distributed lock.
3. The "outstanding payment" alert is reinterpreted under `ADR-0028` as a **session-scoped unreceipted
   revenue alert**: a past, non-cancelled session with chargeable attendance, a positive session or
   group price, and no non-voided receipt after `N` days. No per-student debt, balance, phone number,
   or note body is inferred, stored, or sent.
4. The email digest is sent only when a provider is configured and the workspace has opted in.
   It contains localized alert-type labels and counts only. When no provider is configured the
   digest is skipped — it is never simulated. The last successful digest time is a private field in
   the same JSON column and cannot be set by a client.
5. The capstone worker evaluates rules hourly and calls the digest drain on the same cadence; the
   existing worker HTTP route remains available for manual/on-demand evaluation.

## Consequences

**Positive**

- Every alert is computed from real workspace records; no number or condition is invented.
- The cooldown is enforced in the tenant transaction and by the database unique constraint.
- The finance alert respects `ADR-0028`: it reports an uncollected session, not a person's debt.
- Nothing is sent unless an email transport is actually configured.

**Negative / trade-offs**

- The wording of `F-P2-07` AC-1 is narrower in practice than the literal phrase "outstanding
  payment"; the product requirement is amended in the same change to record the interpretation.
- A cooldown key is retained in notification metadata for the lifetime of the row.
- Adding a new column and an enum value requires a migration and a readiness gate bump.

## Alternatives considered

- **Per-student balance alerts** — rejected: `ADR-0028` removes per-student balances and the
  product explicitly promises no debt tracking.
- **Evaluating rules on every notification-bell request** — rejected: it couples a read to a write
  and re-scans the workspace for every open. The existing call is retained only as a best-effort
  fallback; the worker owns periodic evaluation.
- **Storing cooldown timestamps only in application memory** — rejected: workers restart and the
  constraint must survive a redeploy.

## Revisit when

- `ADR-0028` is superseded by a decision that reintroduces per-student balances.
- A product decision requires re-notification on every evaluation rather than once per cooldown.
- An email provider is selected for production and the digest needs provider-specific formatting.
