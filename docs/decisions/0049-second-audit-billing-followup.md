# ADR-0049: Second-audit billing follow-up

- **Status:** Accepted (follow-up remediation decision, 2026-11-28)
- **Date:** 2026-11-28
- **Product owner approval:** Explicitly approved on 2026-11-28 under `OQ-25`; recorded in `ADR-0051`.
- **Deciders:** Engineering, under the product owner's instruction to fix all second-audit findings
- **Scope:** M3b platform billing
- **Serves:** `F-P3-04`, `F28`, `R-01`, `R-15`, `NF-1`, `NF-5`, `NF-7`, `NF-8`, `NF-9`, `NF-13`
- **Supersedes in part:** `ADR-0048` only where retroactive compensation credits did not cap against the current outstanding invoice, where config appends had no replay key, and where admin list/view metadata was incomplete

---

## Context

A second independent read-only audit of the uncommitted billing implementation verified that most F1–F21 remediations held, but returned **BLOCK**. It confirmed two high-severity problems: a retroactive exemption could create an `invoice_credit` for the full line amount even when the invoice was already paid or credited, inflating available credit; and several billing error keys thrown by the repository and schemas were missing from both message catalogues. It also identified silent admin-list truncation, inaccurate `tenantScoped` metadata on two cross-workspace platform routes, a missing config-append replay key, and incomplete money-label/i18n consistency.

The immutable-ledger promise from `ADR-0048` still stands. The follow-up must not rewrite invoices, weaken a test, or claim payment that did not occur.

## Decision

A retroactive exemption credit is capped at the invoice's **current outstanding balance**, computed from the same verified-payment and existing-credit rule used by manual credit allocation. A settled invoice receives no new credit; a partially settled invoice receives only the remainder. The compensation still appends signed, keyed, audited rows and never changes the invoice or its line items.

A logical billing-config change has a server-derived SHA-256 key covering the supplied content and coded reason. The append-only `billing_config_idempotency` table maps that key to one immutable version. A retry after an ambiguous outcome returns the original version; different content appends a new version. The highest version remains authoritative.

Bounded platform-admin exemption and submission lists return an explicit `truncated` signal. Every visible workspace is queried through its own tenant scope, so an older workspace is never silently omitted. The workspace selector remains complete.

The route registry declares `tenantScoped: false` for the cross-workspace platform overview and cycle routes; they fan out into one scoped transaction per workspace rather than running inside a single tenant transaction. Tenant-targeted billing routes remain `tenantScoped: true`.

Every thrown billing error key exists in both message catalogues. Server-provided money labels carry the currency from `Intl`; components no longer append a literal `EGP` suffix. High-impact admin confirmations name the resolved workspace, and review/release confirmations also name the invoice and decision. A scheduled exemption revoked before its start date covers no day and no month, and exemption status is synchronised before an update so an expired record cannot be extended into billable days.

## Consequences

### Positive

- A correction cannot manufacture available credit from an already-settled invoice.
- An ambiguous config retry cannot append duplicate versions.
- Platform admins are told when a history view is bounded instead of seeing a misleadingly complete list.
- Route metadata matches how handlers actually use scoped transactions.
- Users receive localized error messages and self-contained, locale-aware money labels.

### Negative

- Compensation now reads current payment and credit state inside the same transaction; the credit amount depends on the state at correction time.
- One additional global append-only table and migration are required, advancing the readiness marker to `20261128040000_billing_second_audit_followup`.

### Neutral

- Teacher access remains free and unlimited, and collected session receipts remain separate.
- No payment gateway, provider webhook, automatic transfer detection, or legal-invoice claim is added.
- At the time of this ADR, `OQ-23`–`OQ-25` remained unresolved pending legal, product or accounting review. They were closed by the product owner in `ADR-0051`, which did not change this ADR's credit/reference policy.

## Alternatives considered

- **Crediting the full line amount as before.** Rejected: it can inflate available credit and makes reconciliation ambiguous.
- **Rewriting the invoice total.** Rejected: it falsifies immutable financial history.
- **Accepting a client-supplied config idempotency key.** Rejected: a client could block or replay arbitrary changes; the key is derived from server-parsed content.
- **Returning every admin row unbounded.** Rejected: unbounded platform reads are unsafe; the list is bounded but honest.
- **Marking fan-out routes tenant-scoped because they touch tenant rows.** Rejected: the registry field means "runs inside a tenant transaction", and the audit showed that wording must be accurate.

## Revisit when

- Accounting requires a different order or rule for applying credits to partially paid invoices.
- Product requires unbounded platform-admin history views or a paginated cursor instead of a bounded, explicitly truncated view.
- A request-level idempotency key is introduced across all mutating APIs, replacing server-derived content keys.
- The product owner changes the closed `OQ-23`–`OQ-25` decisions recorded in `ADR-0051` with different financial or reference rules.
