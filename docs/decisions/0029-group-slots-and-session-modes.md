# ADR-0029 — Multiple weekly slots per group, and sessions beyond a group

**Date:** 2026-11-14
**Status:** Accepted
**Supersedes:** `D-03` (a group carries one recurring weekly slot), `F-P1-04` AC-1 and `F-P1-05` AC-6 as written
**Related:** `F-P1-04`, `F-P1-05`, `F-P1-06`, `F-P1-07`, `F-P2-05` AC-4, `ADR-0006`, `ADR-0007`, `ADR-0014`, `NF-1`, `NF-5`, `NF-7`

---

## Context

Three requests came from the teacher using the product, and each exposed a gap between the
specification and how Egyptian private teachers actually run their week.

1. **Attendance is a record, not a phase.** The screens treated "close session" as a write lock and
   the wording implied attendance belongs to the start of the lesson. The specification never
   required a time window: `F-P1-06` requires an atomic save and revisions, `F-P1-07` requires
   corrections on recorded sessions, and `F-P2-05` AC-4 covers scanning outside the scheduled
   window. A teacher who remembers a mark at midnight, or teaches a second group in the same room,
   must be able to record the truth. Only a **cancelled** session is excluded everywhere
   (`F-P1-05` AC-5).

2. **A group often meets more than once a week.** `D-03` and `F-P1-04` AC-1 assumed one weekly slot
   and kept `weekday`, `start_time`, `end_time`, `room`, and `capacity` on `group`. Teachers run a
   Saturday/Monday group, or the same class in two rooms on different days. The schedule, the room,
   and the capacity are properties of a **meeting**, not of the group.

3. **Not every session belongs to a group.** Teachers give revision sessions open to the whole
   workspace, or a grade-wide session for every student in "Grade 5" regardless of their group.
   Forcing those into a fake group would fabricate a roster and pollute group reports. An
   independent session must start empty and gain students explicitly; a grade-level session must
   take its roster from the grade's current enrollments.

---

## Decision

### 1. Attendance and corrections are allowed at any time

- Any non-cancelled session accepts marks and corrections, whatever its date or status
  (`scheduled`, `started`, or `completed`).
- "Close session" sets `status = completed`. It is a **status marker**, not a write lock; the
  attendance screen keeps every mark control enabled afterwards.
- A cancelled session refuses attendance, QR check-in, and roster edits. It stays excluded from
  attendance denominators and reports.
- Every changed mark still appends an immutable revision in the same transaction (`ADR-0014`).

### 2. `group_schedule_slot` is the only scheduling source

- New table `group_schedule_slot`: `workspace_id`, `group_id`, `weekday` (0 = Saturday),
  `start_time`, nullable `end_time`, nullable `room`, nullable `capacity`, timestamps.
- `group.weekday`, `group.start_time`, `group.end_time`, `group.room`, and `group.capacity` are
  **dropped**. Keeping them would be duplicated truth (`ADR-0007`).
- A group has one or more slots, chosen when the group is created and editable afterwards.
  Sessions are generated per slot, not per group; a group with two slots produces two sessions in a
  week.
- The overlap warning (`F-P1-04` AC-7) compares slots within the workspace and remains a warning,
  not a block.
- Existing groups were migrated transparently: each old group received one slot carrying its former
  weekday, start/end time, room, and capacity
  (`20261113000003_group_schedule_slots`, `20261113000004_group_slot_drop_legacy_columns`).

### 3. Three session modes in one table

`teaching_session.group_id` becomes **nullable** and `teaching_session.grade_label` is added. A
new `session_attendee` table holds the roster of a group-less session:

| Mode | `group_id` | `grade_label` | Roster |
|---|---|---|---|
| **Group** (existing) | set | null | The group's active enrollments; unchanged |
| **Grade-level** | null | set | Snapshot of every student enrolled, at creation, in a non-archived group with that grade; origin `grade` |
| **Independent** | null | null | Empty at creation; origin `manual` |

Rules:

- `group_id` and `grade_label` are mutually exclusive (validated by a shared Zod schema and refused
  by the service before any write).
- A grade-level session materialises its roster **at creation** and does not follow later
  enrollments. The teacher may add or remove students by hand afterwards; a manual addition is
  origin `manual`. This is a snapshot, not a live query.
- The attendance roster of a group-less session is exactly its `session_attendee` rows. A student
  who is not on that roster cannot be marked; a student who is appears even if they later leave
  their group.
- `addSessionAttendee` and `removeSessionAttendee` are refused for group sessions (their roster is
  the group's enrollments) and for cancelled sessions. Adding an existing attendee is refused.
  Removing an attendee who already has an attendance mark is refused, so recorded truth is never
  silently discarded.
- The session conflict check applies only to sessions with a `group_id`, at creation and at
  reschedule. A group-less session has no single group to double-book.
- `session_attendee` uses composite tenant foreign keys with `ON DELETE RESTRICT`, RLS and
  application-role grants exactly like every other tenant table (`ADR-0006`), and is registered in
  `TENANT_TABLES`.
- Both roster edits write an audit event in the same transaction (`attendee.added`,
  `attendee.removed`), and session creation records `gradeLabel` and the snapshot size in its audit
  diff.

### 4. UI

- The group form edits a list of slots (weekday, start, end, room, capacity) instead of one slot.
- The session create dialog offers three modes: a group, an independent session, or a grade label.
- A group-less session's attendance screen shows a workspace student search and per-row add/remove.
  Group sessions keep the current roster and add no such controls.
- Everywhere a session is named (sessions list, attendance, payments, dashboard, reports, portals,
  student profile, exports) the fallback order is group name → grade label → "Independent session";
  no surface may assume a group exists.

---

## Consequences

**Positive**

- The schedule matches real timetables, including groups that meet twice a week in different rooms.
- The teacher can always record and correct the truth, which is the product's core promise; a
  completed status no longer hides a missing mark.
- Revision, attendance, and revenue reports can include independent and grade-level work without a
  fabricated group.
- Removing the legacy group columns removes a whole class of "which schedule is real?" bugs.

**Negative / trade-offs**

- More rows and joins: every session list and revenue query now handles a nullable group and a
  session-scoped roster.
- The grade-level roster is a snapshot. A student enrolled after the session exists is not included
  until the teacher adds them, and a student removed from every group after the session keeps their
  row. This is deliberate (see Alternatives) but must be confirmed with the beta cohort (`A-22`).
- Group sessions and group-less sessions have different roster rules. The UI must label the
  difference, and the API must keep refusing manual edits on group sessions rather than pretending
  uniformity.
- A grade label is free text. Two spellings of the same grade do not match, so the snapshot may miss
  a group. The product does not invent a grade taxonomy; the teacher controls the label.

**Neutral**

- Cancelled sessions remain immutable records for attendance purposes and keep their roster rows.
- No money or homework behaviour changes: session revenue still computes from present/late marks,
  and homework remains group-scoped.

---

## Alternatives considered

1. **Keep a single slot on the group and add a second "extra slot" column.** Rejected: two shapes
   for the same concept, with no path to three meetings and duplicated conflict logic.
2. **A separate `group_slot` plus a `session_slot` link, keeping `group_id` required.** Rejected: an
   independent session has no group, and a synthetic group would fabricate a roster and pollute
   group filters.
3. **Subtype tables (`group_session`, `grade_session`, `independent_session`).** Rejected: three
   tables for one lifecycle (cancel, reschedule, attendance, revenue) multiply every query and
   migration. Nullable columns plus a roster join keep one lifecycle.
4. **Derive a grade-level roster live from enrollments.** Rejected: editing a roster that silently
   changes with later enrollment would make recorded attendance unfalsifiable after the fact, and
   removing a student from a group would silently erase them from a past session. The snapshot plus
   explicit add/remove keeps every change a visible act.
5. **Keep "completed" as a write lock.** Rejected: it contradicts `F-P1-07` (corrections after
   recording) and forces a second "reopen" concept that the teacher did not ask for.
6. **Store `grade` on the session as a foreign key to a grade table.** Rejected: no grade taxonomy
   exists (`A-07`, `OQ-11`), and inventing one would block a teacher whose grades are named
   differently.

---

## Revisit when

- Beta teachers need a grade-level roster to follow enrollment changes live, or need to re-snapshot
  a session after creation.
- A session must span several grades, or a weekly slot must support alternating rooms or a
  fortnightly cadence.
- A real grade/curriculum taxonomy is introduced (`OQ-11`), which would replace the free-text
  `grade_label`.
- Multi-teacher workspaces need per-slot teacher assignment, which `group_schedule_slot` does not
  yet carry.

---

## Implementation checklist

- [x] Migration `20261113000003_group_schedule_slots`: new table, RLS, grants, copy of legacy slots.
- [x] Migration `20261113000004_group_slot_drop_legacy_columns`: drop `group.room` and
      `group.capacity`; the earlier migration drops `weekday`, `start_time`, `end_time`.
- [x] Migration `20261114000000_session_attendee`: nullable `teaching_session.group_id`,
      `grade_label`, `session_attendee` origin enum/table, composite FKs, RLS, grants.
- [x] `TENANT_TABLES` and the required-migration constant updated (`npm run lint:rules` passes).
- [x] Groups module: slot schemas, repository, service, slot editor, both locales.
- [x] Sessions module: three creation modes, grade snapshot, conflict gating, audit diff.
- [x] Attendance module: group-less roster, add/remove attendee, refusal rules, at-any-time writes.
- [x] UI: sessions list, attendance screen, payments, dashboard, reports, portals, student profile.
- [x] Arabic and English catalogues keep key parity.
- [x] Unit tests: `tests/unit/session-modes-schemas.test.ts`, `tests/unit/attendance-schemas.test.ts`.
- [x] Integration tests: `tests/integration/session-modes-attendance.test.ts`.
