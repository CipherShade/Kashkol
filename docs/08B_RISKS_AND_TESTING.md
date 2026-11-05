# Risks and testing requirements — Forms visual builder (08B)

## Technical risks

| Risk | Severity | Mitigation (ADR-0022) |
|---|---|---|
| Partial save with bad definition reaches server | High | Client-side `parseFormInput`; explicit save (no autosave); server validates again |
| Concurrent edit loses previous work | Medium | Explicit save reduces simultaneous writes; last-write-wins acceptable for small-form use case; no concurrent-edit claim |
| User accidentally deletes all questions | High | Undo in component state (before save); save disabled if definition invalid; read-only mode after submissions |
| Visual editor claims capability server lacks (NF-11 / NF-13) | High | Preview mode uses only existing `getForm`; no fake submission endpoint; no mocked delivery |
| Cross-workspace data leak from edited form | High | All API calls use `requireStaffSession` + workspace-scoped transactions (08A verified) |
| RTL / theme / mobile layout broken | Medium | Design-system primitives (Tailwind v4, tokens.css) + existing responsive gate (RELEASE_PLAN M0 §2.3 AC-4) |
| New dependency without ADR / pin | Low | ADR-0022 exists; no new runtime dependency planned for Phase 2/3; if needed (e.g., dnd library), add ADR entry + pin |

## Testing matrix (must pass before declaring 08B done)

1. All 11 question types in editor → save → retrieve → preview renders correctly.
2. Drag/reorder questions → save → order preserved in `getForm` results (check `order_index`).
3. Duplicate form → new `draft` created; original unchanged; submissions not copied.
4. Publish → status `published`; archive → `archived`; submit blocked after archive.
5. Settings update (`isPublic`, `publicSlug`) → reflected in retrieval.
6. Cross-workspace isolation: user from workspace B cannot access/edit workspace A form (404 identical body).
7. Unauthenticated / assistant without `forms:read` / `forms:write` → `FORBIDDEN`.
8. Dark / light / Arabic / English / mobile (320 px) / empty / loading / error states all render.
9. Audit event exists after save (`audit` table has `formDraftUpdated` row).
10. No fabricated statistics, no mocked delivery, no UI-only authorization.

## Blockers before implementation starts

- User approval of ADR-0022 (this proposal).
- User approval of `RELEASE_PLAN_AMENDMENT_08B.md`.
- Confirmation whether the editor needs partial-update API support (`PATCH` with partial definition) or whether the client must reconstruct full definition from current `GET` response before any edit.
