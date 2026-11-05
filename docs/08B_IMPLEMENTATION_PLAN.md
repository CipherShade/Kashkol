# Phased implementation plan — Forms visual builder (08B)

## No DB changes required

The existing 8 forms tables are sufficient. No new tables, no new migrations. The visual builder uses the 08A API (`POST /api/forms`, `PATCH /api/forms/[formId]`, `POST /api/forms/[formId]/publish`, etc.).

## API verification needed before UI starts

- Confirm `/api/forms/[formId]` PATCH accepts partial `formDefinitionSchema` (title only) without requiring full sections/questions. Currently `formDefinitionSchema` requires full definition; partial updates may need a separate schema or the full definition must be reconstructed from existing state on the client.
- Confirm `GET /api/forms/[formId]` returns full definition (it does, per `findFormDetail` in repository).
- Confirm audit events (`audit` table query endpoint) exist and can be read for recovery trails (there is `/api/audit` route in registry, but form audit filtering may need enhancement).

## Phase 1 — Foundation (before any builder screen)

- [x] `formDefinitionSchema` requires the full definition. The editor loads the full definition via `GET /api/forms/[formId]` before any PATCH and always sends the complete definition.
- [x] Audit query capability: `formDraftUpdated` is written in the same transaction as the mutation and records counts only. It is an activity log, **not** a draft-recovery mechanism.
- [x] Route registry includes all 8 form routes (verified from 08A).
- [x] `STATUS.md` records the M4 extension (item `3.11`), with the release gate renumbered to `3.12`.

## Phase 2 — Forms dashboard

- [x] `src/app/[locale]/forms/page.tsx` — list all forms (table/card layout) with status badges (`draft` / `published` / `archived`), response counts, dates.
- [x] Search input filtering the list client-side (or via `/api/forms` query if needed).
- [x] Create button → navigate to new form editor.
- [x] Actions: edit (always available; the editor is read-only when the form is not a draft), duplicate (always), archive (only published; `POST /archive`), publish (`POST /publish` only if at least 1 question exists — service guard).
- [x] Empty/loading/error states; RTL; light/dark; responsive.

## Phase 3 — Form editor (core visual experience)

- [x] `src/app/[locale]/forms/[formId]/edit/page.tsx` — editor layout.
- [x] Form title/description input (connected to PATCH settings or full PATCH).
- [x] Question list: add, reorder (up/down buttons — drag/drop deferred, see below), duplicate, delete.
- [x] All 11 question types: use existing `formQuestionTypeSchema` to render the correct input component per type.
- [x] Sections: add, rename, set `page_break_before`.
- [x] Required / optional toggle per question (maps to `required` or `logic` rules).
- [x] Conditional logic UI: source question, operator, comparison value, target, action (`show` / `hide` / `require`). Must use existing `formLogicInputSchema`.
- [x] Preview mode: render the form as a respondent sees it (read-only), without submission endpoint (public submission deferred to 08C).
- [x] Settings panel: `isPublic`, `publicSlug`, `submissionMode` (`identified` / `anonymous`), `acceptingResponses`, `confirmationMessage`.
- [ ] Theme/customization: cover image (file upload reference), colour/theme selection. Deferred: `formSettingsSchema` does not define presentation fields and adding them is a schema change outside 08B scope.

## Phase 4 — Safety and interaction design

- [x] Explicit save: `Ctrl+S` / `Cmd+S` and save button; no autosave. Before save, validate with `validateFormState` then `parseFormInput(formDefinitionSchema, …)`.
- [x] Unsaved-changes warning (`beforeunload` event) when the editor has unsaved state; the header also shows an "Unsaved changes" indicator.
- [x] Error states: server errors (`AppError`) display in UI with `messageKey` translated via `messages/ar.json` / `en.json`.
- [x] Loading skeletons; empty form state.
- [x] Read-only mode when the form is not a draft or has submissions (service blocks edit; the editor reflects this before calling the API).
- [x] Success toasts after save/publish/archive/duplicate.

## Phase 5 — Testing requirements

- [ ] Unit: component tests for drag/drop, conditional logic rendering, schema parsing.
- [ ] Integration: form lifecycle (create → edit → publish → archive → duplicate) through the UI or through the API with simulated user interactions.
- [ ] Isolation: verify cross-workspace access blocked (404 with same body as 404 for own workspace).
- [ ] RTL: `dir="rtl"` / `dir="ltr"` verified; text direction of question titles and labels; drag direction.
- [ ] Theme: dark/light verified on editor, preview, and dashboard.
- [ ] Mobile responsive: editor on 320 px width; no horizontal scroll.
- [ ] All 11 question types render correctly and submit data that passes server validation.
- [ ] Audit events present after save.

## Phase 6 — Documentation updates

- [x] `docs/STATUS.md`: M4 / extension entry added (item `3.11`).
- [x] `docs/RELEASE_PLAN.md`: amendment recorded in `docs/RELEASE_PLAN_AMENDMENT_08B.md`.
- [x] `docs/decisions/0022-forms-visual-builder.md`: Accepted.
