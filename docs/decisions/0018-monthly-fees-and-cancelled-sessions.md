# ADR-0018: Period-based fees and session cancellation

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** Product and Engineering
- **Scope:** M2 manual payment tracking
- **Serves:** `F-P2-04`, `R-02` (derived-state drift), `NF-1` (no fabricated statistics)

## Context

The manual ledger supports a monthly fee for a student or group. A cancelled session or a make-up
session must not silently change a family's balance, and the workspace has not opted into attendance-
based or per-session billing. The product requirements do not define a per-session pricing policy.

## Decision

- Monthly student/group fees accrue by active enrollment period and are independent of session
  attendance and session status.
- Cancelling a session does not reduce a monthly fee. A make-up session does not add a fee.
- No charge is created from attendance, cancelled sessions, or make-up sessions.
- An agreed exception is recorded as a separately audited discount or correction with a required
  reason. A past payment, fee rule, or adjustment is never rewritten or deleted.
- Per-session fees and automatic attendance-based charging are out of scope until an explicit,
  workspace-configurable policy is specified and implemented.

## Consequences

### Positive

- A cancelled or rescheduled teaching session cannot unexpectedly alter the ledger.
- Monthly balances remain deterministic from enrollment, fee rules, payment records, and adjustments.
- Teachers can apply an agreed exception without erasing the original financial history.

### Negative

- A teacher must record an exception manually; the system does not infer a credit from a cancelled
  class.
- Per-session pricing is not represented by this fee model.

### Neutral

- Attendance reports continue to apply their own session-cancellation rules, independently of
  financial balances.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Automatically credit cancelled sessions | The amount and eligibility are not specified and can differ by teacher agreement. |
| Automatically charge make-up sessions | This would invent per-session billing and could double-charge monthly-fee students. |
| Derive charges from attendance | The user requires no attendance billing without explicit workspace opt-in; no such opt-in rule exists yet. |

## Revisit when

- Product requirements define an explicit per-session or attendance-based fee convention, including
  cancellation, reschedule, and make-up treatment.
