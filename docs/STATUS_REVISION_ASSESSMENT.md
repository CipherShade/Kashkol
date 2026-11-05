# Assessment: Draft persistence and visual-editor safety

## Evidence from service code (`src/modules/forms/service.ts`)

### Current `updateFormDraft` mechanism (L383–459)

1. `authorize(scope, "forms", "write")`
2. `withScope` transaction
3. `assertWorkspaceWriteAllowedTx`
4. `findFormDetailTx` → must exist and `status === "draft"`
5. `submissionCount > 0` → `AppError("CONFLICT", { messageKey: "errors.formNotEditable" })`
6. `deleteFormChildrenTx` deletes all child rows (`form_section`, `form_question`, `form_question_option`, `form_question_logic`, `form_answer` — though answers should be none at draft stage)
7. `createFormChildrenTx` creates new rows from `buildFormChildren(input, ...)`
8. Updates parent `form` row (`title`, `description`, `publicSlug`, etc.)
9. Writes audit event (`formAuditActions.formDraftUpdated`) with `sectionCount`, `questionCount`, `logicRuleCount`

### What is safe today

- **Atomic replacement**: child deletion + recreation + parent update are inside one DB transaction. Partial failure rolls back.
- **Submission guard**: once a submission exists, edit is blocked. Prevents corruption of submitted data.
- **Audit trail**: audit event captures counts of changed children; `updatedAt` is updated.

### What is NOT safe for a visual editor (autosave / concurrent edits / partial states)

- **No revision history**: `deleteFormChildrenTx` removes rows permanently. A bad save (e.g., user accidentally deletes all questions, saves, then closes browser) requires manual reconstruction.
- **No point-in-time restore**: there is no `form_revision` or `form_snapshot` table. The audit event records counts, not the full child definition, so full restoration from audit alone is impossible.
- **No diff / merge**: `updateFormDraft` takes a complete `FormDefinitionInput`. If two users edit concurrently, the second save overwrites the first completely (last-write-wins). No conflict detection or merge logic exists.
- **Partial-state risk**: a visual editor with drag-and-drop could temporarily have an inconsistent state (e.g., question references non-existent `sectionIndex`). If the editor auto-saves, that partial state reaches the server; `parseFormInput` catches some errors (via schemas), but complex cross-reference errors (e.g., logic target points to deleted question) may not be caught by the current schema alone.
- **No lock / no optimistic concurrency**: the transaction does not check `updatedAt`; concurrent saves are uncoordinated. For manual batch edits this is acceptable; for a real-time visual editor it is risky.

## Proposed revision-safety approach (ADR-0022)

Given the assessment above, the smallest safe approach for the visual builder is:

1. **Explicit save** (not autosave). The editor holds working state in React component memory. Only a deliberate user action (`Ctrl+S` / button click) sends PATCH/POST. This eliminates concurrent-write collision from rapid edits.

2. **Client-side pre-save validation** using existing schemas (`formDefinitionSchema`, `formSettingsUpdateSchema`, `duplicateFormSchema`) before calling the server. Invalid definitions never reach `deleteFormChildrenTx`.

3. **Read-only mode for submitted forms**. Once `submissionCount > 0`, the UI renders the form definition but disables editing, duplicating, and archiving (or restricts archive). The existing service guard protects data; the UI reinforces it.

4. **Audit-based manual recovery trail**. The audit table (`audit` module) records `formDraftUpdated` with section/question/logic counts. While not a full snapshot, it allows a support engineer to detect when a bad save occurred and to manually rebuild the form from a user description. This is sufficient for a small-form use case (bounded at 500 questions, 500 rules per ADR-0021).

5. **No new DB table for revision history** in this milestone. If the product requires full history or concurrent editing later, a `form_revision` table referencing `form.id` can be added without changing the 8-table design (ADR-0022). The proposal defers that work.
