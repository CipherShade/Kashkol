# ADR-0046: Free, unlimited teacher access

- **Status:** Accepted (approved 2026-11-27)
- **Date:** 2026-11-27
- **Deciders:** Product owner (explicit approval) and engineering
- **Scope:** M1–M3 platform access
- **Serves:** `F-P2-01`, `F-P3-03`, `F-P3-04`, `R-15`, `NF-8`
- **Supersedes:** the quota, feature-gate, and payment-status write restrictions in `WORKSPACE_PLAN_DEFINITIONS` and `assertWorkspaceWriteAllowedTx`

---

## Context

The current plan engine has three tiers (`pilot`, `standard`, `expanded`), seven numeric quotas, feature gates, and write restrictions for `past_due`, `suspended`, and `cancelled` plan statuses. Those rules belong to a paid-tier model. The product owner has approved a different model: every teacher account is free, has unlimited students, and can use every product feature. Unpaid platform invoices must not block educational operations.

This decision applies to platform access. It does not change the owner-only boundary for teacher-to-student session receipts in ADR-0041/0043.

## Decision

All teacher workspaces receive unlimited limits and all features regardless of `planTier`, `planStatus`, `planLimitOverrides`, or unpaid platform invoices.

`assertWorkspaceWriteAllowedTx` still checks the genuine workspace account states `suspended` and `deleted`, because those are trust and lifecycle controls, not billing controls. It no longer enforces student, group, assistant, file, video, exam, report, or form quotas, and it no longer blocks writes for `past_due`, `suspended`, or `cancelled` plan status. Billing exemptions are enforced independently by the billing domain, not by the plan engine.

The plan fields remain in the schema for existing platform metadata, exports, and admin history. They are not a source of access control in this release.

## Consequences

### Positive

- Teachers cannot lose educational access because of a billing state.
- The UI cannot accidentally advertise a paid-tier restriction that the server does not enforce.
- Existing workspaces and metadata are preserved; no destructive data change is required.

### Negative

- Platform administrators can no longer use plan status to restrict writes.
- Quota utilization in the admin console becomes descriptive only, not a gate.
- Tests that asserted plan-driven write restrictions must be replaced with tests for the free/unlimited model.

### Neutral

- Workspace `suspended` and `deleted` account states continue to block writes through the same server hook.
- Billing exemptions remain a separate billing-domain concept with their own lifecycle and audit trail.

## Alternatives considered

- **Keep quotas but raise them.** Rejected: the owner asked for unlimited students and no feature restrictions, not a larger arbitrary number.
- **Block writes for unpaid invoices.** Rejected: the owner explicitly requires that unpaid invoices never block educational operations.
- **Delete plan columns.** Rejected as unnecessary scope and a destructive change to existing metadata.

## Revisit when

- The product owner introduces a new paid access model.
- Legal or safety requirements require suspending a workspace; that must remain an account-status decision, not a billing-status side effect.
