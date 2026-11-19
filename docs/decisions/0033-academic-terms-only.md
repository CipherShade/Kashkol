# ADR-0033: Academic-year handling ships terms only

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** Product scope decision carried into engineering; Engineering
- **Scope:** M3a
- **Serves:** `F-P3-07` AC-1 and AC-2, `NF-1` (no fabricated capability), `NF-13` (no silent data loss)

## Context

`F-P3-07` asks for four things: academic terms with start/end dates per workspace and per grade
(AC-1), reports defaulting to the current term with a previous-term comparison (AC-2), a printable
Arabic report card per student per term (AC-3), and reproducible generated report cards (AC-4). The
agreed scope is **"terms only for now"**: AC-1 and AC-2 are implemented, while AC-3 and AC-4 are
explicitly out of scope because AC-4 depends on AC-3. Rollover/copy of prior-year data is also
excluded from this scope; it is not a separate acceptance criterion in `F-P3-07`, so no control or
claim for it is shipped. None of these exclusions may be simulated, implied by a UI control, or
shipped as a placeholder.

The schema has no canonical grade id. `Workspace.grades_taught`, `Student.grade`,
`Group.grade`, and `TeachingSession.grade_label` are free text (`F-P3-07` analysis). A term therefore
cannot foreign-key to a grade row; it must carry the same free-text grade label. No migration or
report-export query may assume a grade enum exists.

## Decision

1. **One tenant table.** `academic_term` stores `name`, nullable `grade`, `start_date`, and
   `end_date`. A null grade means workspace-wide; a term with a grade overrides workspace-wide
   dates for that grade. Overlap is rejected inside the same `withScope` transaction, in the same
   scope only. The table carries forced RLS, a tenant policy, indexes, and grants (`ADR-0006`).
2. **Grade-scoped resolution is pure and explicit.** `src/modules/terms/resolution.ts` resolves the
   current and previous term from a term list, a workspace-local "today", and an optional grade.
   If a grade has any terms, those terms govern that grade completely; there is no silent fallback
   to workspace-wide dates. "Previous" is the same-scope term with the latest end date strictly
   before the current term's start date.
3. **Reports use real dates, not a fake period mode.** The reports page derives default bounds from
   the current term when one exists; otherwise it keeps the existing last-30-days default. The
   period selector can choose a term or a custom range. Comparison fetches the same authorized
   report a second time with the previous term's dates and shows it as a separate computed table.
   The server filters by the resulting dates; no report schema, export format, or worker contract
   changes. Exports contain the selected primary period only, and the UI says so.
4. **Permissions are reused.** Term reads use `settings:read` in management; mutations use
   `settings:write`. The reports page reads term metadata through a dedicated read-only path
   because it is already gated by report permissions and the metadata contains no personal data.
   No new permission resource is introduced.
5. **Explicitly not built:** the per-student Arabic report-card PDF and its reproducibility
   (AC-3 and AC-4), rollover/copy of students, grades, or sessions, and any control that implies
   those capabilities. `F-P3-07` remains incomplete until AC-3 and AC-4 are decided and
   implemented.

## Consequences

- Positive: teachers can define real term boundaries for the whole workspace and per grade; reports
  open on the current term and show a truthful previous-term comparison computed from records.
- Positive: no new dependency, no change to export schemas, and no new permission surface.
- Negative: grade is free text, so a renamed grade label does not follow students between grades.
  This matches the rest of the schema and is not a term-specific regression.
- Negative: `F-P3-07` cannot be marked complete while AC-3 and AC-4 are excluded. `docs/STATUS.md`
  keeps item 3.7 open with a terms-only note.

## Alternatives considered

- **Add a canonical grade table and migrate every grade reference.** Rejected: large cross-module
  migration, no requirement for it, and a decision about grade identity that the specification has
  not made.
- **Store selected term id in the report query and resolve it in the server.** Rejected for this
  milestone: it changes report schemas, stored export jobs, and the worker contract for behaviour
  the date-range filter already provides truthfully.
- **Build the report-card PDF now with the ADR-0032 renderer.** Rejected: out of the agreed scope;
  shipping it would also require per-student layout and legal review of what a report card states.

## Revisit when

- AC-3 (printable Arabic report card), AC-4 (its reproducibility), or an explicit rollover/copy
  requirement is brought into scope, or
- the product introduces a canonical grade identifier, or
- a requirement appears for term-bound report exports that must survive a term rename.
