# ADR-0041: Owner-only collected session earnings

- **Status:** Superseded in part by `ADR-0043` (approved 2026-11-25) — clause 6 on legacy preservation no longer applies
- **Date:** 2026-11-25
- **Deciders:** Product owner (user direction) and engineering
- **Scope:** M2 workspace finance
- **Supersedes:** `ADR-0028` (expected revenue, assistant payment grants, fee rules, and adjustments), `ADR-0038` (the unreceipted-session alert)
- **Related:** `D-14`, `F-P2-04`, `A-04`, `OQ-17`, `NF-1`–`NF-13`, `DM-4`

---

## Context

`ADR-0028` made money session-scoped, but it kept three things the product owner does not want:

1. An **expected revenue** figure computed as `price × present/late marks`. This is a projected
   amount, not money the teacher actually received.
2. An `payments` **permission** that an owner may grant to an assistant.
3. **Adjustments** (refund, discount, correction) and **fee rules** carrying group-level prices,
   so a session price could be inherited rather than set on the session itself.

The product owner directed on 2026-11-25:

> No money tracking from anyone or anything. Only the money made from the session. Only visible in
> the teacher's account. The price is variable and belongs to the session every time the session is
> opened — not to the group.

Platform subscription and billing (`ADR-0036`, `A-10`, `OQ-04`) are outside this decision and are
unchanged. The decision covers money between the teacher and the students only.

---

## Decision

1. **Only collected money is shown.** A receipt records money the teacher received for a session:
   session, amount in integer EGP piastres, method, date, optional note, and authenticated operator.
   No expected revenue, no outstanding, no balance, no credit, no gap, and no unreceipted-session
   alert is computed or displayed anywhere — not on the dashboard, in reports, in exports, in
   notifications, or in a portal.
2. **The workspace owner is the only viewer and recorder.** `payments` is removed as a grantable
   permission resource. Assistant grants cannot include it; the service and the route registry
   enforce owner-only access. Parents and students have no money surface of any kind.
3. **Adjustments are removed.** There is no refund, discount, or correction route, service,
   report column, or UI. A receipt is append-only and is never amended or voided by a later record.
4. **Fee rules and group prices are removed.** There is no fee-rule route, service, or UI, and group
   records carry no default price. The price lives on `teaching_session.price_per_student_minor`,
   is variable, and is entered/edited whenever the session is opened. It is session metadata; it is
   never multiplied by attendance to produce a financial figure.
5. **No stored or computed financial aggregate.** Every displayed total is the sum of real receipt
   rows for the sessions returned by the query, scoped by the session's workspace from the
   authenticated owner's context.
6. **Legacy rows are preserved, not silently deleted** (`DM-4`). Tables that existed for the
   removed concepts (`fee_rule`, `payment_adjustment`, `payment_revision`) may remain in the
   physical schema with their existing rows, but the product never reads or writes them. Columns
   that carried removed values (`payment.student_id`, `payment.period`, `payment.voided_at`,
   `payment.void_reason`, `group.default_price_per_student_minor`) stay only as legacy storage and
   are never populated by new code.

   > Superseded by `ADR-0043`: the owner later approved physical deletion of this legacy storage.
   > Clauses 1–5 and the owner-only rule remain in force.

---

## Consequences

**Positive**

- The teacher sees exactly one truthful money figure: what they recorded receiving.
- No other role — assistant, parent, student, or platform administrator — can see a workspace's money.
- A session price can change every time the session is opened, with no group-level default to
  override it.
- No screen can imply debt, delay, or projected income; this removes the risk behind `NF-1`.

**Negative / trade-offs**

- The teacher loses the expected-vs-collected comparison and the unreceipted-session reminder.
- Refunds and discounts can no longer be represented. A correction requires a new receipt with an
  explanatory note; the prior receipt stays unchanged.
- Historical per-student and adjustment rows remain physically stored but become unreachable.
  They are not deleted because history is never destroyed (`DM-4`).

**Neutral**

- Platform subscription payments are unaffected; this decision does not touch `ADR-0036`.
- EGP-only integer-piastre storage stays (`A-04`).

---

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Keep expected revenue but hide it behind a toggle | A hidden projected figure still claims money was expected, which the product owner does not want tracked at all. |
| Let assistants view receipts through an explicit grant | The owner requested teacher-account-only visibility; a grant would make the rule configurable and therefore not a rule. |
| Keep group default prices as a convenience | The owner stated the price is variable per session and must not come from the group. |
| Delete the legacy tables and their rows | `DM-4` forbids destroying history; making the tables unreachable removes the tracking without data loss. |

---

## Revisit when

- The product owner asks for refunds, discounts, or a per-session expected figure again.
- A legal or accounting requirement makes a retained financial record necessary.
- A role other than the owner must record or view money; that needs a new decision with an explicit
  threat model, not a permission flag.
