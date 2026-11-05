# ADR-0021: Relational forms foundation with server-side conditional logic

- **Status:** Accepted (partially superseded by ADR-0022)
- **Date:** 2026-11-04
- **Deciders:** Engineering
- **Scope:** M3a forms and surveys foundation (`F-P3-09`)
- **Serves:** `F-P3-09`, `R-01` (tenant isolation), `R-02` (derived-state drift), `R-15` (permissive defaults), `NF-1` (no fabricated statistics), `NF-8` (no UI-only authorisation), `NF-9` (no fake tenant isolation), `NF-13` (no silent data loss)

## Context

The teacher workspace needs to collect structured answers from students or parents. The product brief
asks for the full range of Google-Forms-style question types, sections and page breaks, required
questions, conditional logic, public links, and both identified and anonymous responses. It does not
ask for a visual builder yet, and the repository already has a `student` record, a `user` record, a
scanned `file` record, and a server-enforced permission model.

The expensive decisions are the storage shape for questions and logic, the relationship between a
response and an existing identity, and how far the public surface may go before it is specified. A
JSON document per form would be quick to write but would make ordering, tenant scoping, conditional
targets, and per-answer validation hard to enforce in the database. A separate respondent table would
duplicate the student system the product already owns. A public submission endpoint without a
specified abuse, quota, and identity policy would ship a capability that is not yet defined.

## Decision

- A form is stored relationally in eight tenant tables: `form`, `form_section`, `form_question`,
  `form_question_option`, `form_question_logic`, `form_submission`, `form_answer`, and
  `form_answer_file`.
- Questions have a global `order_index` within the form; sections also have an `order_index` and a
  `page_break_before` flag. A question may belong to a section or to none.
- Conditional logic is a first-class row: a source question, an operator, an optional comparison
  value, an action (`show`, `hide`, `require`), and exactly one target (question or section), enforced
  by a check constraint. Reordering a question therefore does not break a rule.
- Answers are stored one row per question with a validated `value_json`. A file-upload answer links to
  an existing clean `file` row through `form_answer_file`; there is no separate file store.
- A submission references the existing `student` and `submitted_by_user_id` columns when the form is
  identified, and leaves both null when it is anonymous. A mismatch between the form's mode and the
  supplied identity is rejected. No parallel student or user table is introduced.
- The definition lifecycle is `draft` → `published` → `archived`. Only a draft is editable; a form
  needs at least one question to publish; an archived form accepts no responses.
- Public forms carry `is_public` plus a globally unique `public_slug`. The slug is generated from
  `randomBytes(9)` when the teacher does not supply one. **The public submission route is not part of
  this decision and is not exposed.**
- Conditional visibility and requiredness are evaluated on the server for every submission. Answers to
  hidden questions are discarded and counted, never stored. A required question is required only while
  it is visible.
- A new `forms` permission resource with `read` and `write` is grantable to assistants and marked
  sensitive. Every read requires `forms:read`; every definition or lifecycle write requires
  `forms:write`.
- Every mutation writes an audit event in the same transaction.

## Consequences

### Positive

- Tenant isolation, ordering, conditional targets, and answer uniqueness are enforced by the schema
  and RLS rather than by application convention alone.
- Reusing `student`, `user`, and `file` keeps the roster and the learning-materials pipeline as the
  single source of truth.
- Server-side validation means a future public route can reuse the same rules without trusting a
  client.
- The public surface stays honest: the schema can hold a public form, but no endpoint claims to serve
  one until a later flow defines it.

### Negative

- Editing a draft replaces its children instead of diffing them. That is acceptable while a draft has
  no submissions, and the service refuses to edit once any submission exists.
- Each submission evaluates every logic rule in memory after loading the form definition. Forms are
  bounded at 500 questions and 500 rules, so this remains a small, deterministic operation.
- File answers depend on the existing scan pipeline; a pending file cannot be submitted.

### Neutral

- Sections double as pages through `page_break_before`; a separate page entity is not introduced.
- `submitted_by_user_id` is stored as a string without a foreign key, matching the existing
  `created_by_user_id` convention for actor identifiers.
- Responses are read-only in this milestone. Editing or deleting a response is a later, separately
  specified capability.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Store the whole form definition as one JSON document | Ordering, uniqueness, conditional targets, and per-answer validation would all move into ad-hoc application code, and a malformed document could reach the database. |
| One `form_response` row with a JSON answer map | Per-question validation and file linking would be opaque; a missing or duplicate answer would be hard to detect. |
| A new `form_respondent` table | Duplicates the existing student/user identity model and creates a second source of truth. |
| Expose the public submission route now | Abuse controls, quotas, retention, and the anonymous-identity policy are not specified; shipping the endpoint would claim a capability the product has not defined. |
| Store file uploads in a forms-specific table | Duplicates the scan pipeline and the `file` tenant boundary. |
| Put conditional logic in `settings_json` | It would not be queryable, could reference deleted targets, and could not be constrained by the database. |

## Revisit when

- The product defines a public response flow, including abuse controls, quotas, retention, and the
  anonymous-identity policy.
- A visual builder needs a stable draft-revision model, or response editing/deletion becomes a
  requirement.
- A form needs question types beyond the eleven implemented here, or cross-form/question libraries.
