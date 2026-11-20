# ADR-0034: Performance intelligence is computed, evidence-backed, and rule-based

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** Engineering
- **Scope:** M3b
- **Serves:** `F-P3-10`, `F27`, `R-02` (derived statistics drift), `NF-1` (no fabricated statistics),
  `NF-6` (no UI-only authorisation), `NF-10` (no fake analytics), `NF-12` (no placeholder capability)

## Context

Kashkol already computes assessment averages, trends, attendance risk, and follow-up flags from
source rows (`ADR-0007`). The product now needs a deeper Student Performance Intelligence surface:
student trends, topic weaknesses, class intelligence, configurable risks, bulk grade entry, and
parent reports.

Three failure modes must be designed out:

1. **Fabricated insight.** An overall paper-exam mark cannot identify a weak topic. Only real
   question responses or topic counts the teacher explicitly entered can support that claim.
2. **Cached or invented risk.** A stored label would drift from the underlying records and could
   survive a changed evidence set. A free-text "AI" conclusion could state a cause that no record
   supports.
3. **Misleading absence.** A missing, excused, not-taken, or absent assessment is not a zero and is
   not a failure. Insufficient data is a distinct, visible state.

The stack already has deterministic calculations, a scoped-transaction repository pattern, forced
RLS, an append-only audit writer, and an adapter-backed PDF renderer (`ADR-0032`). No charting or AI
dependency is present, and adding one is unnecessary.

## Decision

1. **All intelligence is computed from source rows at read time.** The module never stores an
   average, trend, topic score, risk verdict, or class aggregate. This extends `ADR-0007` to
   `assessment_score`, `online_exam_response`, `online_exam_question`, `assessment_topic_result`,
   `workspace_settings`, and `student_follow_up`.

2. **Topic evidence has exactly two sources.**
   - Online: `online_exam_response.isCorrect` joined to `online_exam_question.topic`. Only a
     non-null correctness value contributes; essay/manual responses remain unclassified until graded.
   - Paper: `assessment_topic_result.correct_count` and `incorrect_count`, explicitly entered by the
     teacher. These are labelled as teacher-entered observations, never as answer-level records.
   A manual overall grade alone never creates a topic conclusion.

3. **Trends publish their rule.** A trend requires at least three graded results in the selected
   window. It compares the mean percentage of the most recent half with the preceding half; the
   threshold, sample size, and evidence ids are returned with the label. Two or fewer results are
   `insufficient_data`.

4. **Risks are rule evaluations over an evidence snapshot.** Rules are deterministic functions of
   real records and workspace thresholds. Each result contains a stable rule id, detected-at time,
   threshold, evidence ids, and a suggested action phrased as an observation. No rule diagnoses a
   cause, predicts intent, or treats an absent/missing assessment as failure.

5. **Only the teacher response is durable.** `performance_risk_state` stores acknowledgement,
   optional note, optional linked follow-up, and a deterministic `risk_key` derived from rule id,
   period, student, and source record ids. A changed evidence set produces a different key and does
   not inherit the old acknowledgement. `ADR-0014` remains the audit rule: mutations write an audit
   event in the same tenant transaction, with note bodies redacted.

6. **Bulk grades are transactional but report partial validation truthfully.** The request is one
   scoped transaction. Rows that fail validation are skipped with explicit reasons; valid rows are
   saved. An untouched existing score is never deleted. A duplicate `(group, title, date)` assessment
   is rejected rather than silently reused. The response reports every row's outcome.

7. **Parent reports are a separate privacy boundary.** They use the parent portal's linked-child
   authorization, published grades only, shareable `performance_report_note` rows only, and no group
   aggregate. `student_note` remains teacher-only. Arabic output is RTL and English output is LTR;
   PDF uses the configured `ADR-0032` adapter and fails closed when absent.

8. **No external AI in V1.** No AI client, key, network call, or UI claim is introduced. A later AI
   feature may only render an explanation of an already-computed, already-authorized evidence set; it
   may not create, alter, or classify a result.

## Consequences

- Positive: every number, trend, topic, and risk is reproducible from records and filters; a changed
  source row changes the result on the next read.
- Positive: no new dependency, no stored rollup, no materialised view, and no cache invalidation
  problem.
- Positive: privacy-sensitive notes and parent reports stay behind existing portal authorization.
- Negative: complex reads do more work per request. Queries are bounded by date/group/student, use
  grouped fetches, and rely on composite `(workspace_id, …)` indexes.
- Negative: a risk acknowledgement is tied to an evidence snapshot; teachers may need to acknowledge
  a recurring risk again after new results arrive. This is deliberate.
- Negative: PDF parent export is unavailable until `ADR-0032` is configured in the deployment, and
  the UI says so instead of pretending to export.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Store computed averages, risks, and topic scores on the student | Drift from source rows; directly violates `ADR-0007` and `NF-1`. |
| Infer topics from an overall manual mark | Unsupported conclusion; the mark contains no topic evidence. |
| Treat missing assessments as zero | Invents failure and corrupts averages; explicitly prohibited by the requirement. |
| Use an AI API to classify students | Creates unverifiable claims, sends minors' data off-service, and adds an unapproved dependency in V1. |
| Add Recharts/Chart.js | Existing hand-built SVG/CSS charts already satisfy the visual and accessibility needs; a dependency is unnecessary. |
| Reuse `student_note` for parent notes | It is teacher-only by design and deliberately excluded from portal projections. |
| Queue parent reports through `report_export` | Its type constraint and export permissions are staff-oriented; direct generation keeps the parent privacy boundary explicit. |

## Revisit when

- Measured aggregate latency exceeds the budgets in `docs/ARCHITECTURE.md` §21 and no index or grouped
  query can bring it back under budget.
- A product requirement defines canonical topic identifiers across subjects and exams.
- A legal review approves a specific AI processing path for minors' data and the product accepts AI
  explanations as a separate, explicitly labelled feature.
- The parent report must become a reproducible generated artifact with legal sign-off, in which case
  `F-P3-07` AC-3/AC-4 and this ADR must be revisited together.
