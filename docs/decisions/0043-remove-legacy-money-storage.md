# ADR-0043: Physical removal of legacy workspace money storage

- **Status:** Accepted (approved 2026-11-25)
- **Date:** 2026-11-25
- **Deciders:** Product owner (explicit approval) and engineering
- **Scope:** M2 workspace finance
- **Supersedes:** `ADR-0041` clause 6 (legacy preservation), the legacy money parts of `ADR-0025`, `ADR-0028`, `ADR-0038`, and `ADR-0039`
- **Related:** `D-14`, `F-P2-04`, `F-P2-11`, `NF-1`, `NF-5`, `NF-7`, `NF-13`, `ADR-0014`, `ADR-0041`

> **Annotation (2026-11-27):** Superseded in part by `ADR-0045` and `ADR-0046` for platform billing
> only. The workspace-money removal below remains in force. The exclusion of platform subscription
> and billing is historical: platform billing is now a separate usage-based ledger with manual
> InstaPay verification (`ADR-0045`), and no paid tier restricts teacher access (`ADR-0046`). The
> historical reasoning below is retained.

---

## Context

`ADR-0041` removed every money surface except collected session receipts and made those receipts
owner-only. It deliberately left the old tables, columns, enum values, and rows in the physical
schema so that history was not destroyed (`DM-4`). Those records are unreachable but still describe
concepts the product owner rejected: per-student fees, monthly fee rules, discounts, refunds,
corrections, voided receipts, outstanding balances, and a payment permission.

The product owner explicitly approved on 2026-11-25 the **permanent removal of that legacy
workspace money storage**. Platform subscription and billing (`ADR-0036`) were explicitly excluded
and remain unchanged.

`DM-4` normally protects history. Here the owner made a narrower, explicit decision: records that
only represented removed workspace money concepts must be deleted, not retained invisibly. The
append-only audit log (`ADR-0014`) is outside this deletion and continues to record owner-only
financial actions in redacted form.

---

## Decision

1. **Drop the removed-money tables.** `payment_adjustment`, `fee_rule`, and `payment_revision` and
   their rows are dropped. The `payment_adjustment_kind` enum is dropped with them. No code reads,
   writes, exports, or restores these tables.
2. **Reduce `payment` to collected session receipts.** Rows without a `session_id` and rows marked
   void are deleted in the same migration. `session_id` becomes non-null. The columns `student_id`,
   `period`, `purpose`, `reference_number`, `voided_at`, and `void_reason`, and their constraints and
   indexes, are dropped. The append-only trigger on `payment` stays: a receipt is still never
   amended or voided.
3. **Remove group price storage.** `group.default_price_per_student_minor` is dropped. A session
   price exists only on `teaching_session.price_per_student_minor`, is variable, and is edited on the
   session screen.
4. **Remove money notification storage.** `payment_overdue` notifications are deleted and the value
   is removed from `notification_type`. Legacy `paymentOverdueEnabled` and `paymentOverdueDays` keys
   are stripped from stored rule JSON. The four remaining rules are at-risk attendance, unrecorded
   attendance, homework due soon, and pending assessment grades.
5. **Remove the money grant resource.** `payments` is removed from `permission_resource` after
   deleting any grant rows. Owner-only money access is enforced with `assertOwner(scope)` before a
   tenant query; it is never a configurable permission. Money reports still use an existing generic
   resource for the non-money report-read check, but the owner assertion is the controlling gate.
6. **Remove the stale export type.** The `report_export` type check is rewritten to allow the four
   non-money reports plus `payments` and `sessionRevenue` owner-only collected reports; `balances`
   is removed and any stale `balances` job is deleted.
7. **Reconcile every registry.** The tenant table registry, workspace-backup retained tables,
   permission grant script, route registry, message catalogues, specification documents, and tests
   are updated in the same change. Platform subscription and billing are untouched.
   Annotation (2026-11-27): superseded in part by `ADR-0045` and `ADR-0046`; the new
   `src/modules/billing` domain, its routes, and its tables are separate from the removed
   workspace-money storage.

---

## Consequences

**Positive**

- The physical workspace schema contains no fee rules, adjustments, refunds, discounts, revisions,
  voided receipts, per-student payment records, group default prices, money alerts, or money grants.
- The only money rows left are real receipts linked to a session and visible only to the owner.
- A future restore cannot resurrect a removed money concept from an old archive table name.
- No screen, report, export, or permission editor can claim a capability that no longer has storage.

**Negative / trade-offs**

- This is a destructive, approved migration. Legacy workspace money rows cannot be recovered from
  the application after it runs; the operator must take the normal provider snapshot before deploy.
- Historical audit events may still contain an entity type of `payment`, but the audit reader hides
  those events from assistants and shows a redacted projection to the owner.
- An old workspace archive containing the removed table names will be rejected at pre-flight, as
  required by the updated tenant registry.

**Neutral**

- `ADR-0036` platform billing and `/api/workspace/subscription` are unchanged.
  Annotation (2026-11-27): superseded in part by `ADR-0045`/`ADR-0046`. Platform billing now lives in
  `src/modules/billing` with `/app/billing` and `/api/platform-admin/billing*`.
  `/api/workspace/subscription` remains a truthful plan-and-support status endpoint only.
- EGP integer-piastre storage and timezone handling for receipts are unchanged.

---

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Keep the tables unreachable as in `ADR-0041` | The owner reviewed that boundary and explicitly approved physical removal instead. |
| Move legacy rows to a new archive table | That would still store the rejected money concepts and could be restored or exposed later. |
| Only hide the enum values and columns | Hidden storage is still storage; the requirement is that the concepts no longer exist in the workspace schema. |
| Delete the audit events that mention payments | `ADR-0014` requires an append-only audit log; the owner-only redacted reader is the correct boundary. |

---

## Revisit when

- A legal or accounting requirement makes retained financial records necessary; that needs a new
  decision with an explicit retention window and owner approval.
- The product owner asks to reintroduce refunds, discounts, or a money grant; that needs a new ADR
  with a fresh threat model, not a reverted migration.
