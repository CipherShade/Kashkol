# ADR-0028 — Session-scoped finance (replaces per-student ledger)

**Date:** 2026-11-13  
**Status:** Accepted  
**Supersedes:** `D-14`, `F-P2-04` (manual payment tracking)  
**Related:** `ADR-0025` (session-priced billing), `NF-1`–`NF-13`

---

## Context

The current specification (`docs/PRODUCT_REQUIREMENTS.md` `D-14`, `F-P2-04`) defines the manual ledger as **per-student**:

- A monthly fee per student or per group; outstanding balance computed per student.
- Payments recorded per student; a partial payment leaves a remaining balance outstanding per student.
- The balances report computes expected/received/adjustment/outstanding per student.

A teacher in the Egyptian market asked for a simpler model:

> "I don't want to count each student as own. I don't want to link the money collected or any delay (there is no delay in this market for money). I want it to be collected for each session as (no. of students in the session × price of the session). Nothing related to the students for the money."

This means:

- Expected revenue for a session = **session price × number of present/late students** (absent/excused do not charge).
- Collected revenue = what the teacher records **against that session** (a single receipt per session, not per student).
- No per-student outstanding, no credit, no carry-forward, no per-student fee rules.
- The UI should show, for each session: price, expected, collected. No gap/outstanding figure.

---

## Decision

**Money is now session-scoped.** The per-student ledger is removed from the product.

### Schema changes

1. `Payment.studentId` becomes **nullable** (`String?`). New payments **must** reference a `sessionId` (made non-nullable for new rows; existing rows keep their data).
2. `PaymentAdjustment.studentId` becomes **nullable**. Adjustments still link to a `paymentId` (and thus indirectly to a session).
3. `FeeRule.studentId` is **deprecated**: fee rules can only be attached to a group (`groupId`). Direct student-level fee rules are no longer creatable (existing ones remain readable but are ignored by balance calculations).
4. The `balances` and `outstanding` concepts per student are removed from the query layer. The dashboard shows **session revenue** (expected = present × price, collected from session-linked payments, no outstanding column).
5. The `paymentVerified` flag on `AttendanceMark` is **removed** (it was the per-student link between a mark and a payment row). Attendance marking no longer toggles a payment; session revenue is recorded explicitly by the teacher.

### UI changes

- The **Payments** page becomes **Session Receipts**: a list grouped by session (session name, group, price, expected, collected, date, method, note). The form records a receipt for a **session** (mandatory session selector, no student selector).
- The **Student profile → Payments tab** is removed.
- The **Dashboard Financial Overview** shows:
  - Total collected (sum of session receipts).
  - Expected per session (card per session or trend).
  - Revenue by group / trend (unchanged, sourced from session receipts).
  - "Outstanding payments" alert removed.
- The **Parent/Student Portal** `showPayments` permission is ignored; payment ledger never exposed to portals.

### Behaviour

- `recordPayment(scope, input)` → requires `sessionId`, `studentId` optional (defaults to `null`). Validation: the session must exist, be non-cancelled, have a positive `pricePerStudentMinor` (or group default). The amount recorded is free-form (teacher may record any amount; no automatic `expected` enforcement).
- `getPayments(scope, query)` → returns session-scoped rows (joined with session, group). Pagination by receipt.
- `getSessionRevenueSummary(scope, sessionId)` → computes expected from present/late marks, collected from session-linked payments. **No outstanding column** (per user request). Returns `{ pricePerStudentMinor, presentCount, expectedRevenueMinor, collectedRevenueMinor }`.
- Dashboard's `financialOverview` → `totalRevenueMinor` = collected, `expectedRevenueMinor` = sum of session expected (only for sessions with price), `revenueByGroup` / `revenueTrend` sourced from session receipts.

### Migration path (as shipped in `20261113000002_session_scoped_finance`)

1. `payment.student_id` and `payment_adjustment.student_id` become nullable. New receipts reference `session_id`; legacy per-student rows keep `student_id`.
2. A CHECK constraint `payment_session_required_check` (`student_id IS NOT NULL OR session_id IS NOT NULL`) guarantees a receipt always carries at least one anchor — new rows always a session. (`session_id` itself stays nullable so legacy rows remain valid.)
3. A **non-unique** partial index `payment(workspace_id, session_id) WHERE session_id IS NOT NULL` supports session-scoped lookups. Uniqueness was deliberately not imposed: a workspace may legitimately record several receipts for the same session (split collections), and duplicates are flagged by the audited flows, not by the database.
4. `npm run db:migrate` applied locally; local demo reseeded (`npm run db:seed && npm run db:seed:demo`).
5. The demo seed (`seedPayments`) creates session-linked receipts (one per qualifying session; the most recent completed session per group is deliberately left unreceipted); no per-student fee rules are created for new rows.

### Tests

- Update unit tests in `tests/unit/payments.test.ts` to expect session-scoped behaviour.
- Add integration tests for session receipt flow (record receipt per session, query by session, revenue summary).
- Remove per-student balance tests; replace with per-session revenue tests.
- Tenant isolation matrix and permission matrix regenerated (no new routes).

---

## Consequences

**Positive:**
- Matches the teacher's mental model: one receipt per class, money collected at the end of the session.
- Eliminates per-student debt tracking, partial payments, credits, carry-forward — all of which do not exist in this market.
- Simplifies the UI: no student selector on the payments page, no outstanding/credit columns, no balances table.
- Keeps `NF-1`–`NF-13`: every number is computed from real rows (session marks → expected; payment rows → collected).

**Negative / trade-offs:**
- Loss of per-student payment history (which parent paid for which child). If a parent pays for multiple children, the teacher records one receipt for the session; they can note the student names in the `note` field if they wish.
- Existing per-student payments in production (if any) would need a one-time migration; this decision is for the local demo and future workspaces.
- `OQ-20` (direct student fee vs group fee) becomes moot for the new model; it stays in `OPEN_QUESTIONS_AND_ASSUMPTIONS.md` as "superseded by ADR-0028".

---

## Rollback

If the session-scoped model proves wrong, a new ADR supersedes this one. The nullable `studentId` columns allow the old model to be reinstated without data loss.

---

## Implementation checklist (for this commit)

- [x] ADR file created at `docs/decisions/0028-session-scoped-finance.md`.
- [x] `docs/decisions/README.md` updated with entry 0028.
- [x] `docs/PRODUCT_REQUIREMENTS.md`: `D-14` and `F-P2-04` marked superseded by ADR-0028.
- [x] `docs/DATA_MODEL.md`: payment model updated, new indexes, per-student balance section removed.
- [x] `docs/OPEN_QUESTIONS_AND_ASSUMPTIONS.md`: `OQ-20` status → superseded.
- [x] `docs/STATUS.md`: new section §5.19 recording this change and gate results.
- [x] Prisma migration `20261113000002_session_scoped_finance` (applied; verified in `_prisma_migrations`).
- [x] Schema changes (nullable studentId, `payment_session_required_check`, `paymentVerified` dropped, feeRule group-only for new rules).
- [x] Repository/service layer updates (`payments/*`, `dashboard/*`, `reports/*`, `portals/*`).
- [x] UI updates: Payments screen shows collected/expected and a per-session revenue table (no student selector, no outstanding/credit columns), student-profile Payments tab removed, dashboard shows session-scoped revenue, parent portal carries no payments key.
- [x] Demo seed updates (session receipts seeded; no per-student balances).
- [x] Unit + integration tests updated; full gate passes. Unit 423/423 + UI 21/21 pass; build passes; integration 19/19 files, 123/123 tests pass (2026-11-13, after the fixture-isolation change in `docs/STATUS.md` §5.9).