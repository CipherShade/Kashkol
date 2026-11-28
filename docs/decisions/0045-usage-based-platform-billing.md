# ADR-0045: Usage-based platform billing with a manual InstaPay ledger

- **Status:** Accepted (approved 2026-11-27)
- **Date:** 2026-11-27
- **Deciders:** Product owner (explicit approval) and engineering
- **Scope:** M3b platform billing
- **Serves:** `F-P3-04`, `R-02`, `NF-1`, `NF-5`, `NF-7`, `NF-8`, `NF-9`
- **Supersedes:** the commercial-model default in `A-10` and `OQ-04`; the provider-webhook-only path in `ADR-0036`
- **Superseded in part by:** `ADR-0051` only for the qualification rule (two qualifying sessions within a rolling 30 days, not two marks in one Cairo month)

---

## Context

`F-P3-04` describes subscription and billing as a real payment-provider flow, and `RELEASE_PLAN.md` gates that path on a provider contract. `OQ-04` leaves the commercial model undecided with the conservative default that no billing code ships before M3b. `ADR-0036` implements a truthful manual-pilot sign-up payment page that writes no payment state.

The product owner has now made an explicit decision that replaces that default. Teachers may create accounts free, with unlimited students and all features. Kashkol charges a metered platform fee derived from real attendance records, and payment is confirmed manually by a platform administrator after a teacher submits an InstaPay transfer reference. No payment provider, webhook, card data, or automatic transfer detection exists or is planned for this release.

The existing `Payment` model is an owner-only, append-only, session-linked receipt for teacher-to-student money. ADR-0041 and ADR-0043 deliberately removed balances, adjustments, fee rules, refunds, and money grants from that model. Platform billing is a different money domain and must not be implemented by extending `Payment`.

## Decision

Kashkol implements a separate `billing` domain with these rules:

1. Account creation is free. Students, groups, assistants, files, videos, exams, reports, and forms are not limited by a paid tier, and an unpaid invoice never blocks educational writes.
2. The unit of usage is a distinct student with at least two valid attendance marks in a calendar month attributed by the session's `startsAt` timestamp in `Africa/Cairo`. **Annotation:** this qualification rule was superseded in part by `ADR-0051`, which the product owner decided on 2026-11-28; the billed unit remains the Cairo calendar month, but the qualifying pair may span a rolling 30 days that includes that month.
3. `present` and `late` marks count. `absent` and `excused` marks do not count. Marks on cancelled sessions do not count. A student counts at most once per workspace per month. Group and independent sessions both count. The existing unique attendance mark per session and student prevents duplicate QR check-ins from creating duplicate usage.
4. The charge is `unique_qualifying_students * 99`, stored as integer piastres. Currency is `EGP`. No floating-point money value is stored.
5. Billing starts from a workspace's recorded activation month. Attendance before that month is never charged.
6. The append-only ledger records usage charges, audited adjustments, invoice allocations, and payment credits. Issued invoices and line items are immutable. Corrections after an invoice produce a new ledger adjustment; they never rewrite an invoice or a previous snapshot.
7. The default invoice threshold is `5000` piastres. A platform administrator may change the threshold in a versioned, audited platform configuration. Balances below the threshold carry forward and are never discarded. At or above the threshold, the full accumulated balance is invoiced once.
8. Teachers pay by manual InstaPay transfer. A payment submission records a normalized transaction reference, amount, transfer date/time, and optional evidence file. Submission never means payment confirmed.
9. A platform administrator approves, rejects, or flags a submission. Approval requires exact amount equality, a unique reference, an unpaid invoice, and no prior credit for the submission. Partial payments and overpayments are not allocated. Rejection never deletes an invoice.
10. All billing mutations are transactional, idempotent, tenant-isolated with forced RLS, audited in the same transaction, and owner-only for workspace financial data. Platform-administrator billing access is narrow and audited.

## Consequences

### Positive

- Every displayed number is computed from stored attendance, ledger, invoice, and submission records (`NF-1`).
- The system never claims a transfer was detected, sent, delivered, or settled (`NF-5`).
- Tenant financial data stays owner-only and RLS-protected (`NF-8`, `NF-9`).
- Corrections and reschedules are traceable without silently rewriting history (`NF-7`).
- Teachers keep all educational access regardless of invoice status.

### Negative

- Manual verification requires human work and cannot prove a bank transfer by itself.
- A billing worker must compute monthly snapshots; corrections can create adjustments that need clear UI copy.
- Platform administrators need a deliberately narrow exception to the metadata-only default for verification and exemption management.
- Manual reference uniqueness is only as reliable as the normalized reference submitted by the teacher.

### Neutral

- The existing plan columns remain for compatibility and platform metadata, but they no longer restrict product access.
- No new dependency or external provider is introduced.

## Alternatives considered

- **Provider webhooks as the source of truth.** Rejected: no contract, gateway, or webhook exists; implementing one would simulate a capability the product does not have.
- **Reusing `Payment`.** Rejected: `Payment` requires a session, is teacher-to-student money, and has no invoice, settlement, or platform state. ADR-0041/0043 forbid reintroducing the removed ledger concepts into it.
- **Flat paid tiers or per-seat limits.** Rejected by the product owner: education must remain free and unlimited.
- **Rolling 30-day billing periods.** Rejected when this ADR was made; the approved billed period remained the calendar month in `Africa/Cairo`. **Annotation:** this specific rejection was later superseded in part by `ADR-0051`, where the product owner chose rolling 30-day qualification inside that billed month.
- **Crediting historical attendance at launch.** Rejected by the product owner: billing starts from activation.

## Revisit when

- A real payment provider contract is signed and the owner asks for automated settlement.
- The per-qualifying-student rate or threshold policy changes.
- Legal or accounting requirements change invoice numbering, retention, tax, or evidence handling.
- The product owner asks to make educational access depend on payment; that would require a new ADR and must not be inferred from this one.
