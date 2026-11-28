# ADR-0048: Billing remediation credits and reference recovery

- **Status:** Accepted (remediation decision, 2026-11-28)
- **Date:** 2026-11-28
- **Product owner approval:** Explicitly approved on 2026-11-28 under `OQ-25`; recorded in `ADR-0051`.
- **Deciders:** Engineering, under the product owner's stated remediation options
- **Scope:** M3b platform billing
- **Serves:** `F-P3-04`, `F28`, `R-01`, `R-15`, `NF-1`, `NF-5`, `NF-8`, `NF-9`
- **Supersedes in part:** `ADR-0047` only where a retroactive exemption overlaps an issued invoice
- **Superseded in part by:** `ADR-0049` where retroactive credits were uncapped, config appends had no replay key, or platform-admin list/route metadata was incomplete

---

## Context

An independent audit of the uncommitted billing implementation found that a retroactive exemption could not be represented truthfully: issued invoices and ledger rows are immutable, but the exemption could cover a month that had already been charged. A second defect made transaction-reference fingerprints permanently unusable after a disputed submission, even though a reference can be released and later verified. Other findings concerned stale admin checks, replay keys shared across review actions, unsafe URL validation, unformatted piastre displays, and an evidence-view audit event written before a download URL was actually signed.

The product owner allowed either rejecting an overlapping exemption until an explicit credit, or implementing an audited credit adjustment that references the affected invoices. Rejecting all retroactive exemptions would make legitimate corrections impossible; silently rewriting history would violate the immutable-ledger promise.

## Decision

A retroactive exemption is a compensation, not an erasure. Where usage is still unbilled, the system appends a signed `exemption_reversal` ledger entry. Where usage has already been allocated to an immutable invoice, the system appends an `invoice_credit` ledger entry and an `billing_invoice_credit` application that names that invoice. The invoice total and line items never change; outstanding is derived from credits and verified payments. The audit event is written in the same transaction and names the exemption and the amount.

A credit reduces outstanding invoices oldest-first. Each application is keyed by ledger entry and invoice, so a retry cannot apply it twice. Any amount left after all outstanding invoices is reported as available credit. It is never reported as a verified payment.

A disputed transaction reference may be released by a platform administrator. The current fingerprint row moves to `revoked`; a full append-only `billing_reference_event` history records claim, release, and reclamation. A payment credit linked to the released submission is cancelled by a signed `payment_reversal`. The raw reference is never exposed through the global registry. A later approved submission may reclaim the released fingerprint, and both events are audited.

Review idempotency is action-specific: the same key may be replayed only for the same submission and the same decision. Platform-admin status is rechecked inside the transaction that mutates billing state. High-impact admin forms use a server-backed workspace selector showing name, slug, ID and owner name, and their confirmation names the target workspace. Configuration links accept only absolute HTTPS URLs on write and are revalidated when a stored version is projected for display. Every displayed money value is formatted from integer piastres through `Intl`; no component divides minor units by 100. Evidence uses the `billing_evidence` file scope; its database check constraint is repaired forward-only because the earlier enum migration did not update the constraint. Billing credit rows are append-only and are therefore retained, not overwritten, by workspace restore. Evidence viewed is audited only after a download URL has been signed successfully.

## Consequences

### Positive

- Historical charges, invoices, and tenant data are never rewritten.
- A correction is explainable: the credit names the exemption, invoice, amount, and actor.
- Released references can be recovered without deleting audit history or exposing raw references.
- Evidence upload is accepted by the database, and workspace restore cannot silently drop credit history.
- Admin authorization and evidence-view claims are made at the moment the action actually occurs.

### Negative

- Outstanding amounts are derived rather than stored, so all display reads must include every credit.
- Credit allocation is ordered by invoice issue time; the order is part of the product rule.
- Three forward-only migrations are required before the readiness marker advances: the remediation schema, the exemption revocation/review state, and the `file_scope_check` repair.

### Neutral

- Teacher access remains free and unlimited, and teacher-to-student session receipts remain separate.
- No payment gateway, provider webhook, automatic transfer detection, or legal-invoice claim is added.

## Alternatives considered

- **Rewriting or deleting issued invoices.** Rejected: it falsifies history and breaks the audit promise.
- **Rejecting every retroactive exemption.** Rejected: it prevents truthful corrections; the owner allowed an explicit credit adjustment instead.
- **Deleting the fingerprint row on release.** Rejected: it loses history and allows an unaudited reuse.
- **A global idempotency key for all review actions.** Rejected: it makes a different decision replay stale data.
- **Free-text audit notes and links.** Rejected: coded reasons keep audit records stable and non-sensitive.

## Revisit when

- Legal or accounting review requires sequential legal invoice numbers or a defined evidence-retention window.
- Product requires overlapping exemptions to be blocked until a separate credit workflow is run.
- Platform billing moves to a real payment provider with its own correction and reference model.
