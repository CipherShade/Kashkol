# ADR-0040 — Computed per-student progress series

**Date:** 2026-11-25

**Status:** Accepted

**Deciders:** Engineering

**Related:** `F-P2-06`, `ADR-0006`, `ADR-0007`, `ADR-0034`, `R-10`, `NF-1`

---

## Context

`F-P2-06` AC-1 replaces the prototype's randomly seeded `trend` field with three series computed from
real records: attendance rate, assessment average, and homework completion over time. AC-2 forbids a
stored, un-recomputed trend. The existing performance module already computes assessment summaries
and rules at read time (`ADR-0034`), but it has no attendance or homework series and its assessment
trend alone does not satisfy the requirement.

The specification does not define the time bucket, the direction threshold, or which recorded states
count as completed. It also requires that source data be omitted when the viewer lacks the matching
read permission (AC-4).

## Decision

1. **No persisted series.** Each series is recomputed on every read from tenant-scoped records inside
   `withScope` (`ADR-0006`, `ADR-0007`). No new table or column stores a rate, average, completion,
   direction, or cached rollup.
2. **Monthly buckets.** Observations are grouped by calendar month (`YYYY-MM`) using the session
   date for attendance, the assessment date for scores, and the homework due date for completion.
   A bucket's value is the mean of its real observations, rounded to one decimal place. Months with
   no observations are not invented.
3. **Attendance.** A mark counts as attended when it is `present` or `late`; `absent` counts as not
   attended. `excused` marks and cancelled sessions are excluded, matching the existing student
   profile calculation. The bucket value is the attended percentage of eligible marks.
4. **Assessment.** Only `graded` scores with a positive maximum are included. `missing`, `excused`,
   and `not_taken` results are excluded and never treated as zero, as required by AC-3 and
   `ADR-0034`.
5. **Homework.** A homework item counts as completed when a completion mark is `completed` or a
   submission is `submitted`/`late`; it counts as not completed for `not_completed`/`not_submitted`.
   `excused` and `not_applicable` rows are excluded. A completion mark wins over a submission row
   for the same homework so the single source is deterministic.
6. **Direction.** A series with fewer than three populated buckets is `insufficient_data`. For three
   or more buckets, the rule is `mean(latest half) - mean(previous half)`: `>= +5` is `improving`,
   `<= -5` is `declining`, and the 5-point band between them is `steady`. This is the same explicit
   rule already used for the assessment trend; it is returned with the series and shown in the UI.
7. **Permission filtering.** The progress service requires `students:read` to identify the student.
   The attendance, assessment, and homework series are loaded and returned only when the viewer also
   holds `attendance:read`, `grades:read`, and `homework:read` respectively. An omitted series is
   represented as `null`, never as a fabricated empty series. Owners have every grant.

## Consequences

**Positive**

- AC-1 and AC-2 are met without any stored derived state; every point can be traced to real records.
- A viewer without a source permission cannot infer that source's values from the response.
- The direction rule is explicit and identical across the three series.

**Negative / trade-offs**

- Monthly bucketing can hide short-term changes; a shorter bucket would be noisy for a small
  teacher's roster and is not specified by the requirement.
- Homework and assessment series can cover different sets of months; the UI must not imply that an
  absent bucket is a zero.

## Alternatives considered

- **Storing a nightly rollup** — rejected: `ADR-0007` forbids cached derived state and the rollup
  could drift from audited corrections.
- **Reusing the assessment trend as the progress direction** — rejected: `F-P2-06` requires three
  independent series.
- **Counting missing or excused results as zero** — rejected: it fabricates a performance event and
  contradicts `ADR-0034`.

## Revisit when

- The product defines a different bucket or direction threshold, in which case this ADR is
  superseded rather than silently changed.
- A permission is added for a new progress source.
