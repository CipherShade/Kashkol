# ADR-0047: Billing exemptions and narrow platform-admin billing access

> **Annotation (2026-11-28):** Superseded in part by `ADR-0048`. A retroactive exemption that overlaps an issued invoice is now represented by an audited invoice credit; no invoice is rewritten. Reference fingerprints can be released and reclaimed with an append-only event history.

- **Status:** Accepted (approved 2026-11-27)
- **Date:** 2026-11-27
- **Deciders:** Product owner (explicit approval) and engineering
- **Scope:** M3b platform billing and platform administration
- **Serves:** `F-P3-03`, `F-P3-04`, `R-01`, `R-15`, `NF-5`, `NF-8`, `NF-9`
- **Narrows:** `A-12` for billing verification and exemption management only

---

## Context

Assumption `A-12` says platform administrators see operational metadata only by default, with explicit time-boxed break-glass access required for tenant content. The approved billing model requires platform administrators to verify manually submitted InstaPay proofs and to manage billing exemptions for individual workspaces.

These duties need access to billing records, but they do not require access to student names, notes, grades, guardian phones, or teacher-to-student session receipts. The access must be purpose-limited, audited, and represented in the billing domain rather than as a hardcoded bypass.

## Decision

A first-class `billing_exemption` record belongs to the billing domain, one active record per workspace at a time. It stores a reason from a fixed set (`internal_testing`, `beta_tester`, `testimonial`, `promotional`, `partner`, or `custom`), optional internal notes, a start date, an optional expiration date, a status (`scheduled`, `active`, `expired`, or `revoked`), and the platform administrator who created or last modified it.

An exempt workspace keeps all features and unlimited usage, continues recording attendance, and remains in platform-wide usage analytics with usage explicitly classified as non-billable. It does not create billable usage charges, invoice balances, invoices, or payment obligations. Exempt workspaces are excluded from invoice generation, collection jobs, paying-customer revenue, and outstanding-balance calculations.

Exempt usage never becomes billable retroactively. When an exemption expires or is revoked, standard billing starts from the first Cairo calendar month that is not covered by the exemption. Historical exempt months are never pulled into the first billable period. Expiration is detected by the billing worker and transitioned to `expired` with an audit event. Revocation is an explicit administrator action.

Every creation, modification, expiration, and revocation writes both a tenant `audit_event` and a `platform_audit_event` in the same transaction. Exemptions are not hardcoded workspace ids and are not a temporary bypass outside the data model.

Platform administrators may read only billing verification and exemption metadata needed for their duty: workspace id, invoice number and amount, submission reference, submitted amount, transfer time, evidence status, and review state. They do not receive student names, notes, grades, guardian phones, or session receipt data. Teacher financial data remains owner-only. Verification mutations run in the target workspace's scoped transaction with an active-admin assertion; no general cross-tenant billing bypass is added.

Screenshots are evidence submitted for manual review, never proof by themselves. An administrator must compare the transaction reference and exact amount before approving.

## Consequences

### Positive

- Exemptions are explainable, auditable, time-bounded, and reversible.
- Analytics remain complete while revenue calculations remain honest.
- Admin verification does not require exposing student data.

### Negative

- The billing worker must check exemption state before every calculation and invoice cycle.
- Expiration is eventual, based on the worker cycle, not instantaneous at midnight.
- Platform-admin code needs a narrow, well-tested metadata projection.

### Neutral

- Break-glass remains the path for non-billing tenant content access.
- No hardcoded list of workspace ids exists.

## Alternatives considered

- **A hardcoded exemption list in configuration.** Rejected: it is unauditable, not lifecycle-aware, and not a domain model.
- **Using plan status as exemption.** Rejected by ADR-0046; plan status no longer controls access or billing.
- **Granting platform admins full tenant access.** Rejected: unnecessary and contrary to `A-12`.
- **Treating a screenshot as proof.** Rejected: it does not verify the transaction and would violate `NF-5`.

## Revisit when

- Exemptions need approval by a second administrator.
- Legal requirements change retention of internal notes or evidence files.
- Platform billing moves to a real provider with its own exemption semantics.
