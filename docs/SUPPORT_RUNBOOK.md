# Kashkol — Platform Administration & Support Runbook

**Requirements:** `F-P3-03` (Platform administration console), `F-P3-04` (usage-based platform billing; free and unlimited teacher access), `NF-1`–`NF-13`.
**Decisions:** `ADR-0045` (usage-based billing), `ADR-0046` (free/unlimited access), `ADR-0047` (exemptions and narrow admin verification), `ADR-0048` (remediation credits and reference recovery).

This runbook documents the non-public operational procedures for provisioning SaaS platform administrators, inspecting workspace health and usage, reviewing manual InstaPay submissions, managing billing exemptions and configuration, and handling time-limited break-glass diagnostics. Legacy workspace subscription billing is superseded and retired; there is no subscription payment page and no provider webhook.

---

## 1. Non-Public Platform-Admin Provisioning (`F-P3-03` AC-5)

### Security invariants
1. **No automatic first-user promotion:** The first registered user in Kashkol is never automatically promoted to a platform administrator in any environment.
2. **No hardcoded emails:** No email address or domain is hardcoded in application code or environment variables for super-admin access.
3. **No public UI or API self-promotion:** Platform-admin records can only be granted or revoked via the server-side CLI runbook script (`scripts/platform-admin.ts`) executed by an operator with direct shell/database access.
4. **Verified email required:** The target user must already have a registered account with `email_verified = true`.

### Commands

List all provisioned platform administrators (active and revoked):

```bash
npm run platform-admin -- list
```

Grant platform-admin access to a verified account (requires a ticket reference / audit reason of at least 8 characters):

```bash
npm run platform-admin -- grant \
  --email="ops@example.com" \
  --reason="OPS-2026-01: Provision primary on-call SaaS operator"
```

Revoke platform-admin access immediately (also deletes all active sessions for that user so access terminates immediately):

```bash
npm run platform-admin -- revoke \
  --email="ops@example.com" \
  --reason="OPS-2026-09: Operator rotation completed"
```

Every `grant` and `revoke` operation writes an immutable record to `platform_audit_event`.

---

## 2. Default Privacy Boundary (`F-P3-03` AC-1)

When a platform administrator opens `/[locale]/platform-admin` (or calls `/api/platform-admin/overview` and `/api/platform-admin/workspaces/[workspaceId]`):

- **Visible by default:**
  - Workspace ID, name, slug, teaching name, primary subject, grades taught, account status (`active`, `suspended`, `deleted`), created timestamp, and last activity timestamp.
  - Legacy plan metadata (`pilot`, `standard`, `expanded`; `pilot_active`, `active`, `past_due`, `suspended`, `cancelled`) and effective limits. All workspaces are free and unlimited; these values are descriptive only and never gate a write (`ADR-0046`).
  - Aggregate counts only: active/archived students, active/archived groups, owners/assistants/pending invitations, active files and exact byte usage, active videos and estimated bandwidth, outbox message states, and online exam counts.
  - System-wide integration readiness (`email`, `fileStorage`, `malwareScanner`, `videoProvider`, `webPush`, `whatsappMessaging`, `saasBilling`). `saasBilling` reports `manual_instapay_ledger`; there is no gateway credential to configure.
  - In the dedicated `/[locale]/platform-admin/billing` console: billing config versions, exemptions, submission verification metadata, evidence status, review state, and signed adjustment history. Teacher billing data remains owner-only (`/app/billing`).
- **Never exposed in the platform console:**
  - Student names, student phone numbers, guardian names, or guardian phone numbers.
  - Private teacher notes (`student_note`) or follow-up notes.
  - Individual student grades, exam responses, or attendance marks.
  - Individual workspace money receipts or fee rules (`ADR-0041`, `ADR-0043`).
  - Student names, phone numbers, notes, grades, guardian contacts, or session receipt data through the billing console. Verification uses billing metadata only (`ADR-0047`).
  - Bulk cross-tenant data exports (`F-P3-03` AC-4).

---

## 3. Free Access, Plan Metadata & Usage Billing (`F-P3-04`)

### Centralized definitions
Legacy plan metadata lives in `src/modules/platform-admin/plans.ts` (`WORKSPACE_PLAN_DEFINITIONS`).
All three tiers carry `billingMode: "usage_billing"`, unlimited limits, and all features enabled:

| Tier | Max Active Students | Max Active Groups | Max Assistant Seats | Max File Storage | Max Videos | Max Video Storage | Est. Video Bandwidth / Month |
|---|---|---|---|---|---|---|---|
| `pilot` | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |
| `standard` | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |
| `expanded` | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |

- **Free and unlimited:** account creation, students, groups, assistants, files, videos, exams,
  reports, and forms are not limited by a tier or feature flag (`ADR-0046`). An unpaid invoice never
  blocks educational writes. The external video provider's configured count, storage, and monthly
  bandwidth caps remain real operational limits shown in the Videos screen; they are not plan quotas,
  do not gate other features, and are never described as unlimited video storage.
- **Server-side enforcement (`src/modules/platform-admin/enforcement.ts`):**
  - `assertWorkspaceWriteAllowedTx` still checks the genuine workspace account states `suspended`
    and `deleted` before a write.
  - It no longer enforces numeric quotas or feature flags, and it no longer blocks writes for
    `past_due`, `suspended`, or `cancelled` plan status.
  - Legacy overrides are accepted as metadata for existing agreements, but resolving the effective
    plan never applies them to access control. No record is deleted or blocked by lowering a plan
    value.

### Billing policy (`ADR-0045`, `ADR-0051`)
- The charge is **99 piastres (0.99 EGP)** per distinct qualifying student per `Africa/Cairo`
  calendar month. A student qualifies with at least two qualifying `present` or `late` marks on
  non-cancelled sessions inside a **rolling 30-day window** (30 × 24 elapsed hours) that includes
  a session in that billed month; the preceding 30 days may establish the pair. `absent`, `excused`,
  cancelled sessions, and duplicates are excluded. Archiving or deleting a student never erases
  historical attendance or an earned charge.
- Billing starts at the workspace's recorded activation month. Earlier attendance is never billed.
  Amounts below the **5000-piastre default threshold** carry forward; at or above the threshold the
  full balance is invoiced once. The rate and threshold are versioned, admin-configurable values in
  `billing_config` — not hardcoded retail prices or secret environment variables.
- Payment is a **manual InstaPay transfer**: Kashkol issues an internal invoice, the teacher transfers
  the amount and sends the screenshot to **`+201004574178`** on WhatsApp, then submits the reference,
  exact amount, and transfer date/time. An authorized platform administrator reviews the evidence and
  explicitly approves or rejects it; only approval writes the ledger entry. Optional evidence is
  scanned, streamed by the authenticated admin route, and is never proof. No card is charged, no
  gateway is called, no webhook exists, no automatic approval occurs, and no transfer is detected
  automatically. Internal invoices are not claimed to be government-issued tax invoices.
- Teacher billing is owner-only at `/[locale]/app/billing`; assistants are denied. The session-receipt
  Payment screen at `/app/payments` is a different money domain and is unchanged.

### Changing a workspace's plan or account status
1. Open `/[locale]/platform-admin` and click **Inspect & Manage** on the target workspace.
2. Legacy `planTier`, `planStatus`, numeric overrides, and feature flags may be recorded as metadata
   for history or exports. They do not change the workspace's access or billing.
3. Enter the mandatory **Audit Reason / Ticket Reference**, type the exact **Workspace Slug** to confirm, check the confirmation box, and submit.
4. Both `platform_audit_event` and the workspace's own `audit_event` (`actor_type = 'platform_admin'`) record the before/after diff and reason.
5. To change actual access, use the genuine account status (`active`, `suspended`, `deleted`); a
   billing state is never a substitute.

### Platform billing procedures (`ADR-0045`–`ADR-0048`)
- **Configuration:** open `/[locale]/platform-admin/billing` to append a new `billing_config`
  version (rate, threshold, currency, Cairo timezone, InstaPay handle/link, optional QR key). The
  old version is never rewritten and the highest version is authoritative. Never put a rate, a
  threshold, or an InstaPay credential in an environment variable.
- **Exemptions:** create a time-bounded exemption with a required reason
  (`internal_testing` / `beta_tester` / `testimonial` / `promotional` / `partner` / `custom`), an
  optional internal note, a start date, and an optional expiry. An exempt workspace stays fully
  functional and non-billable. Expiry and revocation take effect from the first uncovered Cairo
  month; past exempt months are never billed retroactively. Every lifecycle event is audited. A
  retroactive exemption that overlaps issued usage appends a signed reversal or invoice credit;
  it never rewrites an invoice (`ADR-0048`).
- **Submission review:** a submission stays `submitted` or `under_review` until an active platform
  administrator approves, rejects, or flags it. Check the current reference fingerprint is unique
  and the amount exactly matches the invoice. `under_review` grants no credit. Approve writes an
  append-only payment-credit ledger entry in the same transaction as the audit event; a wrong amount
  is rejected, not partially allocated. Review keys are action-specific, and admin status is
  rechecked inside the mutation. Optional evidence is scanned and streamed by the authenticated
  admin route only during review and is never proof of a transfer; the view audit event is written
  only after the stored bytes are read successfully (`ADR-0050`).
- **Reference release:** if a reference is disputed, an active platform administrator releases it
  with a coded reason. The fingerprint is revoked, the linked payment credit is cancelled by a
  signed `payment_reversal`, and a later approved submission may reclaim it. The global registry
  holds only fingerprints and append-only events; never expose the raw reference outside the
  tenant-scoped submission (`ADR-0048`).
- **Adjustments and credits:** a signed platform-admin adjustment appends a ledger entry. Credits
  reduce outstanding invoices oldest-first and a remainder is available credit, never a verified
  payment. Invoices, line items, snapshots, and earlier ledger entries are never rewritten.
- **Cycle trigger:** an authenticated platform administrator triggers the cycle from the billing
  console. There is no dedicated billing worker token, cron secret, or provider webhook to manage.
- **Privacy limit:** verification and exemption screens expose billing metadata only. Do not use
  them to read student names, phones, notes, grades, guardian contacts, or session receipts.

---

## 4. Usage Visibility & Measurement Basis (`NF-1`)

Platform usage displays distinguish exact internal counts from estimates:

- **File storage (`isEstimate: false`):** Exact sum of `size_bytes` across non-deleted `file` rows in PostgreSQL.
- **Video bandwidth (`isEstimate: true`):** Computed as `size_bytes × playback_count` from internal records when external provider billing telemetry is unavailable. Explicitly badged as an estimate in the UI.
- **Message counts (`isEstimate: true`):** Internal `outbox_event` state counts (`pending`, `sent`, `failed`) and `notification` rows. WhatsApp links (`wa.me`) are prepared deep links only and are never counted as "sent" or "delivered" (`NF-2`).

---

## 5. Time-Limited Break-Glass Support Diagnostics (`F-P3-03` AC-2)

Break-glass access should be avoided unless strictly required to diagnose an active teacher support ticket.

1. **Preconditions:** Requires an active support ticket reference (`ticketRef`), a duration between 5 and 60 minutes, a detailed `reason`, the exact `confirmationSlug`, and explicit confirmation.
2. **Scope of break-glass diagnostics:** Even with an active break-glass grant, the console exposes only operational metadata:
   - Recent workspace `audit_event` action codes and timestamps (without PII payloads).
   - Recent failed `report_export` jobs and their `failure_code`.
   - Recent failed `outbox_event` rows, attempt counts, and `last_error_code`.
   - Private student notes, grades, and guardian contact details remain inaccessible.
3. **Teacher visibility:** An active `break_glass_grant` is immediately visible to the workspace owner through the plan-and-support status endpoint `/api/workspace/subscription` (`activeBreakGlass` banner) and writes `platform.break_glass.granted` (and `platform.break_glass.revoked`) into the workspace's `audit_event` log. That endpoint is a truthful support-status read only; it is not a subscription, plan-payment, or billing-charge endpoint. Teacher billing lives at `/app/billing` and platform billing verification at `/platform-admin/billing` (`ADR-0045`).
4. **Revocation:** Grants expire automatically at `expires_at` (max 60 minutes) or can be revoked immediately from the console.
