# Release-plan amendment proposal (awaiting approval)

- **Status:** Proposed amendment — does not modify `RELEASE_PLAN.md` until approved.
- **Reason:** M3 (`F-P3-01` through `F-P3-09`) is unaltered. The visual builder is a new milestone extension, not a change to M3 scope.

## Amendment to `RELEASE_PLAN.md`

Insert after the M3 section (§3) as a new subsection:

### M4 — Forms visual builder and public response (extension / new milestone)

| Package | Delivers | Requirements / flows | Notes |
|---|---|---|---|
| 4.1 | Visual form editor | Drag/drop question reorder, 11 types, sections, logic UI, preview, theme settings | Builds on 08A service/API; uses explicit-save design to avoid concurrent-write loss (ADR-0022) |
| 4.2 | Form management dashboard | List/draft/published/archived, search, duplication, response counts | Consumes `/api/forms` (08A) |
| 4.3 | Public form submission | Anonymous + identified submission, file upload validation, confirmation message | Deferred per ADR-0021; requires abuse/quota/retention specification (ADR-0021 §Revisit when) before exposure |

**M3 scope is unchanged.** No M3 exit criteria are modified.

## Scope-discipline guardrails (per AGENTS.md §2.5)

- No M3 feature is removed or deferred to make room.
- No dependency added without ADR entry and pin (ADR-0022 already exists).
- Visual builder does not introduce a new form data model (uses existing 8 tables).
- Public submission remains disabled until 4.3 is specified, per ADR-0021.

## Milestone entry criteria

- ADR-0022 approved (this proposal).
- 08A gates all pass (confirmed: lint, typecheck, test, integration, build).
- Draft-revision guard accepted: explicit-save design + pre-save validation + audit recovery trail (ADR-0022 §Smallest safe approach).
