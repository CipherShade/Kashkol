# ADR-0051: Final billing decisions for OQ-23, OQ-24 and OQ-25

- **Status:** Accepted (final product-owner decisions, 2026-11-28)
- **Date:** 2026-11-28
- **Deciders:** Product owner (explicit final decisions); legal approval reported by the product owner; engineering records and implements
- **Scope:** M3b platform billing
- **Serves:** `F-P3-04`, `F28`, `R-01`, `R-02`, `R-15`, `NF-1`, `NF-5`, `NF-7`, `NF-8`, `NF-9`
- **Supersedes in part:** `ADR-0045` only where that ADR required two marks inside one Cairo calendar month and rejected rolling 30-day qualification periods; the rest of `ADR-0045` remains in force
- **Records explicit approval of:** `ADR-0048` and `ADR-0049` under `OQ-25` without changing their policies

---

## Context

`OQ-23`, `OQ-24` and `OQ-25` carried conservative defaults while billing was built and audited. The
product owner has now supplied final decisions. They close those questions.

The product owner reports that a lawyer reviewed and approved the proposed payment process. This
record deliberately captures only that reported approval. It does not invent a lawyer's name, legal
opinion, licence details, advice text, or a legal-invoice/tax conclusion. Where a detail was not
specified — bank-specific reference normalization, an evidence retention term, or external
accountant involvement — it remains explicitly undecided. No specific legal requirement is asserted
by engineering.

## Decision

### 1. `OQ-23` — payment process and evidence

The operational flow is fixed:

1. Kashkol generates an invoice showing the amount owed by the teacher.
2. The teacher transfers that amount through InstaPay.
3. The teacher sends a screenshot of the transaction to the designated WhatsApp number
   **`+201004574178`**.
4. The teacher waits for manual verification.
5. An authorized platform administrator reviews the transaction and the evidence.
6. The administrator explicitly approves or rejects the payment.
7. On approval only, the payment is recorded in the append-only billing ledger and the invoice
   balance is updated.

Screenshots are supporting review evidence, never automatic proof of payment. There is no payment
gateway, webhook, automatic detection, or automatic approval. Internal invoices remain immutable
records with snapshots and line items; they are not described as government-issued tax invoices.
Existing bank-reference normalization and validation protections, evidence access restrictions, and
audit logging are preserved. The designated number is documented consistently in the teacher
billing UI and the operational runbooks.

Invoice numbering stays internal. Evidence retention and external-accountant involvement are not
specified by this decision and remain open technical/operational details, not invented legal facts.

### 2. `OQ-24` — billable student qualification

A student becomes billable after attending at least **two qualifying sessions within a rolling
30-day period** that includes at least one session in the billed `Africa/Cairo` calendar month.
A qualifying session is a real `present` or `late` attendance mark on a non-cancelled session;
`absent`, `excused`, and cancelled-session marks do not qualify. The window is measured as 30 × 24
elapsed hours so Cairo daylight-saving transitions cannot change it. Attendance from
the preceding 30 days may establish the pair; attendance before workspace activation is never used.
A student is charged at most once per month, at 99 integer piastres.

Deleting or archiving a student does not erase historical attendance or billing eligibility and
does not retroactively remove an earned charge. A student with linked attendance cannot be
hard-deleted; such a student must be archived. Qualification is read from attendance history, not
from current student status. Billing rule changes remain forward-only: earlier invoices, snapshots,
and months are never rewritten or re-billed.

### 3. `OQ-25` — credits and disputed references

The product owner explicitly approves the policy recorded in `ADR-0048` and hardened in
`ADR-0049`, with no redesign:

- retroactive exemptions append compensating ledger entries and never rewrite an issued invoice;
- an already-invoiced exempt student receives an audited `invoice_credit` naming the original
  immutable invoice;
- credits reduce outstanding invoices oldest-first and respect the `ADR-0049` outstanding-balance
  cap, with any remaining eligible credit recorded as available credit;
- a disputed reference may be released with a signed `payment_reversal` and append-only reference
  events, and a later approved payment may reclaim it;
- raw transaction references are never exposed globally.

## Consequences

### Positive

- The implemented qualification now matches the owner's exact two-in-30-days rule and is stable
  across DST boundaries.
- Historical attendance remains the billing source of truth through archival and deletion attempts.
- The teacher sees the same payment instructions that the support process uses.
- The approved credit/reference policy is explicit and unchanged from the audited implementation.

### Negative

- A 30-day lookback requires reading attendance from the preceding Cairo month for each cycle.
- Manual verification still depends on human review and cannot prove a bank transfer by itself.
- Evidence retention, bank-specific normalization, invoice numbering for legal/tax purposes, and
  external-accountant involvement remain unspecified; no claim is made about them.

### Neutral

- Internal invoice numbers, snapshots, and line items remain immutable platform records.
- Teacher session receipts at `/app/payments` remain a separate money domain (`ADR-0041`,
  `ADR-0043`).

## Alternatives considered

- **Keeping two marks in one Cairo calendar month.** Rejected: the product owner chose a rolling
  30-day window, so `ADR-0045` is superseded only on that point.
- **Treating a screenshot as proof or using a gateway.** Rejected: no gateway exists and the
  approved process requires explicit administrator approval.
- **Rewriting invoices for retroactive exemptions.** Rejected: `ADR-0048` and `ADR-0049` use
  append-only compensation and were explicitly approved.
- **Inventing a retention term or legal-invoice claim.** Rejected: those details were not provided.

## Revisit when

- The product owner changes the qualification window or rate.
- A legally issued external invoice process is explicitly specified and established.
- A retention term, bank-specific normalization rule, or external accountant is formally assigned.
- A real payment provider is contracted; that requires a new ADR, not an inferred capability.
