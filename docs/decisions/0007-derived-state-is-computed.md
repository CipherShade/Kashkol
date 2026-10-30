# ADR-0007: Derived state is computed, not stored

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Engineering
- **Scope:** M0–M3
- **Serves:** `R-02` (derived statistics drift), `NF-1` (no fabricated statistics), `F-P1-06`, `F-P1-07`, `F-P1-09`

## Context

Kashkol computes several kinds of derived values:

- **Attendance rate** per student, per group, per month.
- **Homework completion rate** and per-student submission status.
- **Assessment averages** per student, per assessment, per group.
- **Assessment trends** and follow-up flags from attendance, homework, and graded assessment records.
- **Class-level aggregates** for a group over a period.
- **Outstanding balances** for a student.
- **"Needs grading"** counters for a teacher.

Each of these could be stored and incrementally updated, or computed on demand from the source rows.

The product's promise is that the teacher always sees the truth (`NF-1`). A cached counter that
drifts is a lie. The data volumes are small: a private teacher has tens to low hundreds of students
and tens of sessions a month. At this scale, computing is fast.

## Decision

**All derived measures are computed from source rows at read time.** No stored aggregate, no
incrementally maintained counter, and no cached rollup column.

- Source rows are the only durable facts: `attendance_mark`, `attendance_revision`, `homework`,
  `homework_submission`, `assessment`, `assessment_score`, `student_follow_up`,
  `student_follow_up_event`, `payment`, `charge`.
- Assessment averages use arithmetic means of graded percentages only; `missing`, `excused`, and
  `not_taken` results are excluded rather than counted as zero.
- Follow-up flags are recalculated from tenant-scoped source records and include the rule and source
  record references; they are not stored labels or predictions.
- Every derived measure is a single SQL aggregate over a tenant-scoped query, implemented as a
  named function in the owning module's repository.
- The aggregation SQL is written to be index-assisted (`DATA_MODEL.md` §8); a composite index on
  `(workspace_id, session_id, student_id)` or `(workspace_id, assessment_id, student_id)` supports
  the access pattern.
- Computations are deterministic: the same source rows and the same filters always produce the same
  result. There is no time-dependent or randomised logic in an aggregate.
- A **complexity budget** applies: an aggregate whose plan would scan more than a bounded number of
  rows is a design smell. At the expected scale, an aggregate is bounded by the rows of one student
  or one group over one period.
- **Materialised views are not used.** They are a cached aggregate with a refresh problem, which is
  the exact failure this decision avoids.
- Where a value is expensive enough to warrant caching, the first resort is an HTTP cache or a
  request-scoped memo, not a durable column.

**The exception that proves the rule.** The `attendance_revision` table and the
`homework_submission` row's `status` are **not** derived state in this sense. They are the
*record of an event* — what the teacher did, when, and whether they later changed it. The
`attendance_mark` row stores the current value; the revision history stores how it got there. That
is history, not a rollup, and `F-P1-06` AC-6 requires it.

## Consequences

### Positive

- There is exactly one source of truth per fact, so no reconciliation job is needed and no drift is
  possible.
- A bug in an aggregate cannot corrupt data; at worst it computes the wrong number for one
  request.
- Adding a new measure is a query, not a migration plus a backfill plus a trigger.
- The financial and attendance numbers always agree with the underlying rows.
- The deletion and export jobs have nothing to keep consistent, which simplifies the privacy
  requirements (`F-P0-08`).

### Negative

- Aggregates cost more CPU per request than a cached counter.
- A dashboard that shows many measures for many students issues many aggregates, which is the
  pressure that usually forces a cache. Mitigation: one grouped query per measure with a
  `GROUP BY` rather than one query per student, and a bounded date range.
- Complex SQL written by hand is not type-safe, so these queries need focused unit tests.
- A high-traffic read-heavy product would eventually need a cache. That is a future problem with a
  known solution (ADR-0013 defers Redis deliberately).

### Neutral

- The write path stays simple: writes are inserts and updates of facts, never counter updates.
  This makes the transactional outbox the only cross-cutting write concern.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Stored aggregate columns updated in the same transaction** | Correctness depends on every write path remembering to update the counter. A new write path silently desynchronises it, and the drift is invisible until a teacher complains. This is the drift the product promises never to have. |
| **Materialised views with periodic refresh** | The same drift, with a refresh window on top, and a refresh job that must run and be monitored. |
| **An application-level cache (Redis) of computed aggregates** | Deferred deliberately (ADR-0013). Adds an invalidation problem in exchange for performance the current scale does not need. |
| **A read replica for reporting** | Premature. Reporting load does not justify replica lag, which is a different kind of drift. |
| **A data warehouse / OLAP engine** | Grossly disproportionate to a single teacher's dataset. |

## Revisit when

- Measured query volume shows aggregates dominating the database load (an index and a `GROUP BY`
  are not enough).
- The customer base grows into a multi-teacher or school setting where an individual teacher's
  dataset is no longer small.
- A leaderboard or a cross-workspace benchmark feature is added, which changes the aggregation
  shape.
