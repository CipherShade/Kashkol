# ADR-0039 — Workspace JSON backup and validated in-app restore

**Date:** 2026-11-24

**Status:** Accepted

**Deciders:** Engineering

**Related:** `F-P2-11`, `F22`, `F-P0-08`, `F-P0-07`, `F-P0-09`, `ADR-0006`, `ADR-0008`, `ADR-0009`, `ADR-0014`, `ADR-0024`, `NF-13`

---

## Context

`F-P2-11` requires a full workspace JSON export with a schema version and generated-at timestamp,
and an owner-only restore that runs as a background job after a pre-flight report and a typed
confirmation. The restore must append a `workspace.restored` audit event and must not erase audit
history. The prototype replaced live client state wholesale with no validation and cannot be used
as a behavioural reference.

The tenant registry (`ADR-0006`) already defines the complete set of tenant tables, including
`audit_event`. Several tables are intentionally append-only for financial and attendance evidence
(`payment`, `payment_revision`, `payment_adjustment`, `fee_rule`, `session_revision`,
`attendance_revision`, `student_note`, and `audit_event`); the application role has no `DELETE`
grant on them and triggers reject rewrites of financial rows. Published `assessment` and
`assessment_score` rows are also locked by a trigger once marks are published. Stored file objects
live outside the database behind a private storage adapter (`ADR-0009`).

## Decision

1. **Archive format.** An export is a versioned JSON envelope:
   `format`, `schemaVersion`, `generatedAt`, `workspaceId`, `tables` (an object keyed by an
   allowlisted tenant-table name, each value an array of row objects), and `fileObjectKeys`.
   `schemaVersion` is an exact application constant; a preview rejects any other value. The export
   includes the audit log. It does not embed file bytes: file rows carry their private storage keys,
   and the manifest lists those keys for pre-flight verification.
2. **Export execution.** `POST /api/workspace/backup` creates an owner-only job with the same
   claim/complete pattern as report exports (`ADR-0008`). The worker reads every registered tenant
   table inside one scoped transaction, writes the JSON archive to private object storage outside
   that transaction, then records the storage key, audit events (`workspace.export_requested` and
   `workspace.exported`), and a `backup_ready` staff notification atomically. The download uses a
   short-lived signed URL. No identity table, queue table, secret, or other workspace's row is ever
   read.
3. **Pre-flight.** `POST /api/workspace/restore/preview` parses the envelope under a size cap,
   rejects an unknown table, a foreign workspace id, an incompatible schema version, or a malformed
   row, verifies that every referenced storage object still exists, and returns entity counts plus
   explicit "retained" and "unapplicable" lists. It stages the archive in private storage and
   returns an `uploadId`. Nothing is mutated.
4. **Restore execution.** `POST /api/workspace/restore` accepts the `uploadId`, the exact typed
   phrase `RESTORE`, and the preview fingerprint. It creates a background job; the worker re-runs
   validation before touching data, then performs the replacement inside **one** tenant transaction:
   mutable rows are deleted in foreign-key order, archive rows are inserted in parent-first order,
   and no row that is referenced by retained append-only history or by a locked assessment is
   deleted or overwritten. Conflict rows are reported, never silently discarded. The audit log is
   not deleted; the `workspace.restored` event is appended in the same transaction as the final data
   state.
5. **Integrity.** Before commit, the worker compares per-table row counts against the applied
   report and runs a tenant-scoped orphan scan across registered foreign keys. Any mismatch aborts
   the transaction, leaving the workspace unchanged, and the failure code is shown in the UI.
6. **Boundaries.** Network calls (storage upload/download, signing) happen outside transactions.
   Restore never touches `user`, `session`, `account`, `portal_login`, `report_export_queue`, or
   the workspace root row. A restore of an archive from another workspace is rejected at pre-flight.
   A failed staging upload that is never confirmed leaves a private unreferenced object; a
   bounded cleanup job may remove those objects later, but no identifier or content is logged.

## Consequences

**Positive**

- The teacher can port data without depending on the platform; the archive is machine-readable and
  includes the audit log.
- Destructive work is never a request-handler side effect: preview, confirmation, job, and result
  are separate and visible.
- Append-only financial, attendance, and published-assessment evidence survives a restore, as the
  audit log does.
- A failed or incompatible archive cannot partially change the workspace.

**Negative / trade-offs**

- "This replaces current data" is narrowed to **mutable** tenant data; the confirmation copy and the
  preview report say explicitly that audit, append-only evidence, and locked assessment marks are
  retained, and that conflicting rows are reported.
- File bytes are not embedded, so an archive whose storage objects have been purged cannot be
  restored; pre-flight reports this instead of producing broken references.
- A new tenant job table and migration are required, and the worker gains one more drain.

## Alternatives considered

- **Embedding file bytes as base64** — rejected: a single allowed file is 25 MB and a workspace has
  many files; the JSON would be unbounded and would duplicate private objects.
- **Restoring through the owner connection with RLS disabled** — rejected: it creates a bypass that
  can be reused to cross tenant boundaries and would let a restore rewrite append-only evidence.
- **Deleting the audit log and re-importing it from the archive** — rejected: `ADR-0014` requires
  append-only history; a restore is a new event, not a rewrite of the past.
- **Reusing `report_export` and its queue for restores** — rejected: the queue is deliberately
  non-tenant and report-specific; a destructive job needs its own status, preview, and failure
  vocabulary.

## Revisit when

- A legal decision changes the audit or minors'-data retention window (`A-14`).
- The product requires restoring purged file objects, in which case a separate object-archive
  pipeline with its own retention decision is needed.
- A bulk drain with a cross-tenant claim queue replaces per-workspace worker enumeration.
