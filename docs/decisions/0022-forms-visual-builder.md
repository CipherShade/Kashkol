# ADR-0022: Forms visual builder supersedes draft-revision deferral

- **Status:** Accepted (approved 2026-11-04)
- **Date:** 2026-11-04
- **Supersedes:** ADR-0021 — specifically the deferral statements (§Context line 14, §Revisit when lines 96–97) that state "no visual builder" and list "stable draft-revision model" as a prerequisite.
- **Deciders:** Engineering (proposed by user / product direction change)

## Why the direction changed

The product brief previously deferred the visual builder until a revision model existed because the server-side form was new and the draft-edit logic replaced all children atomically. The product direction has changed: the visual editor is now an intentional M4 / extension feature, not a deferred extra. The backend (08A) is stable: 8 tables, 11 question types, service-layer authorization, audit events, scoped transactions, RLS, and 10 HTTP routes all pass the full gate.

## Architectural implication

ADR-0021's relational draft design (delete + recreate) is acceptable for manual batch edits but not for an autosaving visual editor where partial saves, concurrent users, and accidental bad states are expected. Before implementing the builder, a minimal safe revision guard is required.

## Smallest safe approach (proposed — does not add new tables yet)

Rather than introducing a full `form_revision` history table (which would need migration, RLS policies, audit integration, and a merge/conflict resolution flow), the smallest safe approach is:

1. **In-memory draft buffer + explicit save** — the editor keeps the working definition in component state; save is explicit (not continuous autosave). This eliminates concurrent-write collision and reduces accidental partial-save risk.
- Implication: no new DB work for revision; only frontend state management.

2. **Pre-save validation on the client** — `parseFormInput(formDefinitionSchema, input)` runs before every POST/PATCH to `/api/forms/[formId]`. Invalid definitions never reach the server.

3. **Soft-gate: no edit once submissions exist** — already enforced by service (`submissionCount > 0` → `CONFLICT`). The visual editor displays a read-only mode for submitted forms; no revision needed because edit is prohibited.

4. **Undo / restore via server audit diff** — `audit` table already records `formDraftUpdated` with `sectionCount`, `questionCount`, `logicRuleCount`, and `submissionMode` changes (service.ts L446–452). If a bad save occurs, the audit row and the previous `updatedAt` timestamp allow manual reconstruction from the audit log. Full point-in-time restore requires new work; manual reconstruction is sufficient for the small-form use case.

5. **Future revision table (only if needed)** — if concurrent editing or history becomes a real requirement, a `form_revision` table referencing `form.id` can be added later without breaking the 8-table design. This ADR does not add it now to avoid unnecessary complexity.

## What this ADR does NOT do

- It does not change the 8-table schema.
- It does not add a `form_revision` table now.
- It does not change the API contract of 08A.
- It does not expose public submission (still deferred per ADR-0021 / 08C).

## Consequences

Positive: visual builder can proceed; minimal DB risk; existing audit provides a recovery trail.
Negative: no true point-in-time restore; concurrent edits are last-write-wins within a session (mitigated by explicit-save design).

## Confirmed findings (post-approval checks, 2026-11-04)

- Audit (`formAuditActions.formDraftUpdated`): `diff` field stores only `{ submissionMode, isPublic, sectionCount, questionCount, logicRuleCount }` (service.ts L446–452). Not a recovery mechanism.
- Concurrent edit: `form.updatedAt` exists; `updateFormDraft` never checks it. Risk: last-write-wins.
- PATCH (`/api/forms/[formId]`): requires full `formDefinitionSchema` (L305–318); partial updates not supported. Editor must load full definition from `GET` and submit complete state.
- Smallest concurrency guard: add optional `expectedUpdatedAt` to `updateFormDraft`; route loads `updatedAt` from `getForm` before calling update; mismatch throws `CONFLICT`. No new table, no schema change.
- Recovery without revision table: client-side working-copy state + explicit save + audit log as activity trace; manual reconstruction possible when audit counts indicate when change occurred.
