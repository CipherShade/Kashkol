# ADR-0025: Per-session attendance-based billing

- **Status:** Accepted (supersedes ADR-0018's per-session prohibition)
- **Date:** 2026-11-10
- **Deciders:** Product and Engineering
- **Scope:** `F-P2-04` manual payment tracking, revised M2 wave
- **Serves:** `F-P2-04`, `R-02` (derived-state drift), `NF-1` (no fabricated statistics)

## Context

ADR-0018 decided that attendance and cancelled sessions must not create charges, and that per-session
billing is out of scope until an explicit, workspace-configurable policy is specified. That decision was
defensible given no such policy existed in the brief.

The requirement has now changed direction: the user's rule is explicit — for each session, expected
payments equal the number of attended students (`present` or `late`) times the session's per-student
price — and the manual ledger can record real payment facts. The rest of the brief does not contradict
this: payments are still teacher-recorded facts (NF-5), history is never rewritten (NF-7), and amounts
are integer piastres computed from stored records (NF-1). Cancellation and make-up sessions remain
excluded from accrual; monthly fee rules do not accrue for session-priced groups.

The decision does not invent a new workflow; it wires existing tables (`group`, `teaching_session`,
`payment`, `fee_rule`, `attendance_mark`) to existing computation paths in a truthful way, with RLS,
tenant scoping, append-only audit, and advisory locks on every session-ledger mutation.

## Decision

Per-session billing is supported as of 2026-11, with these rules:

1. **Price source.** A group carries `default_price_per_student_minor`. Any teaching session whose
   `price_per_student_minor` is null inherits the group's default for every mark it carries. The
   effective per-student per-session price is therefore either the session price or the group default.

2. **Accrual.** For each non-cancelled session, expected session charges = price × (present count + late
   count), where present/late marks are those with `mark IN ('present', 'late')`. Cancelled sessions and
   make-up sessions contribute zero charges.

3. **Group-level guard.** Groups whose `default_price_per_student_minor > 0` do not accrue their
   monthly `fee_rule` rows to enrolled students — those students instead generate only session charges.
   Other groups and students are unaffected by this change.

4. **Payment verification.** `attendance_mark.payment_verified` is a UI affordance that writes or
   reuses a real, session-linked `payment` row, in the same transaction and with the same advisory lock.
   The server re-verifies when no session price is configured (rejecting via `Payment.errors.sessionPriceMissing`),
   so there is no path where the ledger and the UI disagree about whether a charge exists. Verified and
   unverified states are both real `Payment` rows; voided rows are additional real rows, never inferred
   balance.

5. **Outstanding balances.** Expected revenue = sum of all eligible session charges for each
   student/workspace. Collected revenue = non-voided session-linked payments for that student.
   Outstanding = expected − collected. Zero-attendance sessions produce expected charges of zero,
   which is reported honestly rather than skipped.

6. **Append-only ledger.** `payment`, `payment_adjustment`, and `fee_rule` are append-only by database
   design (migration `20261029150000_manual_payment_ledger`); rows are created, never updated or deleted.
   TRUNCATE is the honest reset mechanism for local-only demo rebuilds, never used elsewhere. Revisions
   (`attendance_revision`, `payment_revision`) are appended, never amended or deleted. Audit events are
   written in the same transaction as every relevant mutation.

7. **Nothing is fabricated.** Every displayed number is computed from records. Sessions with no
   configured price produce expected revenue of 0; students enrolled in session-priced groups but with
   no paid payments are shown as “outstanding” for the historical marked sessions — an amount that is a
   real committed future payment, not a fabricated statistic.

## Consequences

### Positive

- A cancelled or rescheduled teaching session cannot silently reduce a family's balance.
- Monthly balances stay deterministic from enrollment, fee rules, and payments, and additionally reflect
  the documented session-pricing convention.
- Teachers explicitly opt into per-session billing through group pricing config rather than through ad-hoc
  UI deduction.
- The demo is fully consistent: one real session-linked payment per marked attendance, a voided mistaken
  entry on the ledger, a revision chain, and two separately-reasoned adjustments.

### Negative

- Accepting per-session billing changes the meaning of the monthly `fee_rule` table for session-priced
  groups. A group priced at the session level instead of per-month no longer accrues monthly fees for
  its students. This is a deliberate policy decision, not a data quality loss; the change is
  intentional and audited.
- Zero-attendance sessions are explicitly charged at zero, which surfaces students who would otherwise
  have empty owed-lists. The demo treats this as a truthful edge case, not as confusing data.

### Neutral

- Attendance reports continue to apply their own cancellation and revision rules, independently of
  financial balances.
- Assistant-only teachers on a session screen see no revenue card unless they hold `payments:read`.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Skip zero-attendance sessions so nobody shows an owed amount | A credit for absence is itself a fabricated claim; the system should report 0 expected rather than skipping the row entirely. |
| Charge absent students too | This would double-count when a session also has a monthly fee rule, and implies Kashkol "caught" students who were not present. |
| Derive charges purely from `fee_rule.amount × enrollment periods` | Inconsistent with the user's explicit per-session rule; collapses when months are partial. |
| Suppress all session-linked payments until first verified | Creates a two-class ledger where fees and per-session payments diverge; breaks the equality the user specified between `paymentVerified` state and the ledger. |

## Revisit when

Product requirements define an explicit, workspace-configurable policy for: attendance-based charging
vs. period-based fees; cancellation credits; reschedule/make-up treatment; and any rule where a session
charge should not apply to a student enrolled in both a period-fee group and a session-priced group.
Until then, the rule is per-group pricing derived from attendance records, with no credit for absence.

---

ADR-0018's lines "No charge is created from attendance, cancelled sessions, or make-up sessions" and "Per-session fees and automatic attendance-based charging are out of scope" are rescinded by this ADR. ADR-0018's other lines — monthly fee accrual by enrollment period, cancellation does not adjust monthly fees, exceptions require a separately reasoned adjustment, and history is never rewritten — remain in force.
