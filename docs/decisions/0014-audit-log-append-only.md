# ADR-0014: Append-only audit log

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Engineering
- **Scope:** M0–M3
- **Serves:** `F-P0-07` (audit log), `R-08` (corrections must not rewrite history), `NF-7` (no fake audit trail)

## Context

`F-P0-07` requires an Activity Log: every significant action is recorded with the actor, the
action, the target, the timestamp, and — for edits — the before and after values. The log is
visible to the workspace owner. The requirements also require that the log be trustworthy, that
secrets and sensitive content never appear in it, and that it be exportable with the workspace.

This is a product feature and a security control at the same time. A teacher must be able to
answer "who changed this attendance mark, and what did it say before?" months later.

## Decision

Implement a **dedicated append-only `audit_event` table**, written **in the same transaction** as the
mutation it records.

**Schema**

- `id`, `workspace_id`, `actor_user_id`, `actor_role`, `action`, `entity_type`, `entity_id`,
  `before` (JSONB, nullable), `after` (JSONB, nullable), `ip_hash`, `user_agent`, `created_at`.
- `before` and `after` are snapshots of the changed fields only, not whole rows.

**Rules**

1. **Append-only.** `UPDATE` and `DELETE` are revoked from the application role on `audit_event`.
   There is no API, service, or script that mutates or deletes an audit row.
2. **Atomic with the mutation.** The audit insert and the domain write commit together. A
   fault-injection test asserts that the domain write rolls back when the audit insert fails, and
   vice versa (`NF-7`). An action without an audit row is a defect, not a tolerated state.
3. **The actor is snapshotted.** `actor_user_id`, `actor_role`, and the display name are copied into
   the event, so a later rename or a deleted account does not rewrite history.
4. **The action vocabulary is a single constant.** Every auditable action has one identifier, and a
   CI check asserts that each identifier is produced by at least one service and that each
   service-produced action is in the vocabulary. A new action cannot be introduced silently.
5. **No secrets, no free text.** Passwords, tokens, keys, file contents, note bodies, and message
   bodies never appear in `before`/`after`. Sensitive values are replaced with a redaction marker.
   A redaction test asserts this against a seeded fixture.
6. **The audit write goes through a dedicated service**, `src/modules/audit/service.ts`, so the
   shape of an event is consistent and the redaction rules are applied in one place.
7. **Tenant-scoped.** `audit_event` carries `workspace_id` and RLS (ADR-0006). The owner and the
   workspace export read it through the same tenant-scoped layer.
8. **Retention.** Events live for the workspace lifetime. An aggregate view covers the last 24
   months (`OQ-18`).

**Platform access.** The platform administrator cannot read tenant audit content through the
console. A break-glass read of tenant content is itself recorded in a platform-level log and is
surfaced in the tenant's Activity Log, so the owner can see that it happened.

## Consequences

### Positive

- The history is authoritative: it cannot be edited after the fact, by the application or by an
  operator.
- The atomicity guarantee means an unrecorded action is impossible, which is what makes the log
  useful as evidence.
- The single action vocabulary makes the log consistent and reviewable.
- The redaction rules live in one module instead of being re-implemented at each call site.
- The audit table supports the export requirement (`F-P0-08` AC-2) with no extra work.

### Negative

- Every audited write is now two writes, and the transaction is slightly longer.
- Revoking `UPDATE`/`DELETE` on the table means a legitimate correction is impossible by design;
  the correction is a new event.
- The audit table grows indefinitely and needs pruning or partitioning over a long horizon.
- The fault-injection test and the action-coverage check are extra CI work.
- JSONB snapshots are schema-less, so a reader must interpret the shape per action.

### Neutral

- The audit event is a first-class table with the same tenant rules as everything else; it does not
  need a special storage path.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Application logs as the audit trail** | Logs are not durable per record, are not queryable by tenant, are redacted aggressively, and can be rotated away. They cannot satisfy "what changed, and what was it before". |
| **A database trigger that writes the audit row** | Guarantees coverage even for a direct SQL write, which is attractive. Rejected because it moves the event shape into the database, makes the "before" value awkward, duplicates logic between trigger and application, and makes the actor context (which is a session fact) unavailable in the trigger. Application-level auditing with a CI coverage check is sufficient and far more flexible. |
| **An external audit service** | An extra vendor and an extra failure mode in the write path — a new way for the core write to fail. |
| **Mutating audit rows** | Defeats the purpose. |
| **Version columns on each domain table** | Closely related and complementary: a `version` column answers "was this changed?"; the audit table answers "who changed it, when, and from what to what". The requirements ask the latter, so the audit table is the requirement and the version column is optional extra. |

## Revisit when

- The action vocabulary changes shape (for example, a new entity type with a different snapshot
  requirement).
- Audit volume requires partitioning or a separate store.
- A requirement needs an *editable* audit record, which would be a requirement change, not a
  technical one.
