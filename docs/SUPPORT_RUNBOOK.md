# Kashkol — Platform Administration & Support Runbook

**Requirements:** `F-P3-03` (Platform administration console), `F-P3-04` (Subscription, plan, and limits — manual pilot mode), `NF-1`–`NF-13`.

This runbook documents the non-public operational procedures for provisioning SaaS platform administrators, inspecting workspace health and usage, managing pilot plans and quotas, and handling time-limited break-glass diagnostics.

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
  - Plan tier (`pilot`, `standard`, `expanded`), plan status (`pilot_active`, `active`, `past_due`, `suspended`, `cancelled`), effective numeric quotas, feature flags, and per-workspace quota overrides.
  - Aggregate counts only: active/archived students, active/archived groups, owners/assistants/pending invitations, active files and exact byte usage, active videos and estimated bandwidth, outbox message states, and online exam counts.
  - System-wide integration readiness (`email`, `fileStorage`, `malwareScanner`, `videoProvider`, `webPush`, `whatsappMessaging`, `saasBilling`).
- **Never exposed in the platform console:**
  - Student names, student phone numbers, guardian names, or guardian phone numbers.
  - Private teacher notes (`student_note`) or follow-up notes.
  - Individual student grades, exam responses, or attendance marks.
  - Individual payment ledger entries or fee rules.
  - Bulk cross-tenant data exports (`F-P3-03` AC-4).

---

## 3. Manual Plan Assignment, Quotas & Billing Policy (`F-P3-04`)

### Centralized definitions
All plan tiers, statuses, feature flags, and default numeric limits live in `src/modules/platform-admin/plans.ts` (`WORKSPACE_PLAN_DEFINITIONS`):

| Tier | Max Active Students | Max Active Groups | Max Assistant Seats | Max File Storage | Max Videos | Max Video Storage | Est. Video Bandwidth / Month |
|---|---|---|---|---|---|---|---|
| `pilot` | 150 | 12 | 3 | 500 MB | 25 | 2 GB | 20 GB |
| `standard` | 400 | 30 | 8 | 2 GB | 100 | 10 GB | 100 GB |
| `expanded` | 1,200 | 80 | 20 | 10 GB | 300 | 30 GB | 300 GB |

- **No card charging or hardcoded prices:** `billingMode` is `"manual_pilot"`. No credit cards are charged, no payment gateway is invoked for SaaS subscriptions, and no retail currency prices are hardcoded (`F-P3-04` AC-5).
- **Server-side enforcement (`src/modules/platform-admin/enforcement.ts`):**
  - Every mutating service path (`createStudent`, `commitStudentImport`, `createGroup`, `inviteMember`, `createMaterial`, `createVideoLesson`, `createOnlineExam`) checks `assertWorkspaceWriteAllowedTx` inside the database transaction.
  - Setting `planStatus` to `past_due`, `suspended`, or `cancelled` restricts new writes on the server while keeping existing workspace data readable (`F-P3-04` AC-2).
  - Lowering a workspace's plan or quota override below its current usage **never deletes existing records** (`F-P3-04` AC-3); existing records remain intact and readable, and new additions above the cap are blocked with a clear conflict error.

### Changing a workspace's plan or account status
1. Open `/[locale]/platform-admin` and click **Inspect & Manage** on the target workspace.
2. Select the target `planTier`, `planStatus`, optional numeric overrides, and feature flags (`onlineExamsEnabled`, `recordedVideosEnabled`, `reportExportsEnabled`).
3. Enter the mandatory **Audit Reason / Ticket Reference**, type the exact **Workspace Slug** to confirm, check the confirmation box, and submit.
4. Both `platform_audit_event` and the workspace's own `audit_event` (`actor_type = 'platform_admin'`) record the before/after diff and reason.

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
3. **Teacher visibility:** An active `break_glass_grant` is immediately visible to the workspace owner via `/api/workspace/subscription` (`activeBreakGlass` banner) and writes `platform.break_glass.granted` (and `platform.break_glass.revoked`) into the workspace's `audit_event` log.
4. **Revocation:** Grants expire automatically at `expires_at` (max 60 minutes) or can be revoked immediately from the console.
