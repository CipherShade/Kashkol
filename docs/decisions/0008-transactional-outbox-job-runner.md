# ADR-0008: Transactional outbox and an in-deployment job runner

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Engineering
- **Scope:** M0–M3
- **Serves:** `F-P0-08` (deletion and export jobs), `F-P1-11` (file scan pipeline), `F-P2-10` (asynchronous export)

## Context

The application has real asynchronous work:

- Sending transactional email (verification, reset, invitation, digest).
- Scanning an uploaded file for malware.
- Generating a workspace export archive.
- Executing a workspace deletion cascade.
- Daily attendance reminders.
- Reconciliation: verifying that stored objects match their file rows, and that computed totals match
  the source rows.
- Retention and cleanup.

Two properties are non-negotiable. First, an email that must accompany a state change must not be
sent if the state change fails, and must not be lost if the state change succeeds. Second, the
product must never claim an action it has not actually performed (`NF-11`, `NF-13`) — the teacher must be
able to see that an export is still running.

## Decision

Use a **transactional outbox** in the application database, drained by an **in-deployment job
runner** — a second process running the same codebase.

**Outbox.**

- A `job` table holds the queue: `id`, `workspace_id`, `kind`, `payload` (JSONB), `status`,
  `attempts`, `run_at`, `locked_by`, `locked_at`, `last_error`, `created_at`.
- A job is inserted **in the same transaction** as the state change that caused it. Either both
  happen or neither does. This is the classic outbox pattern and it eliminates the dual-write
  problem entirely.
- `job` is a tenant table and carries RLS (ADR-0006), so a job is only visible within its
  workspace.
- A **job claim protocol** prevents duplicate execution: a worker claims a job with a conditional
  `UPDATE ... WHERE status = 'pending' AND run_at <= now() RETURNING *`, which is atomic in
  PostgreSQL. Only the claimer processes it.
- Retries use exponential backoff with a cap. `attempts` is incremented on failure; a job that
  exhausts its attempts moves to `failed` and is surfaced to the teacher rather than retried
  forever.
- **Dead-letter handling:** a failed job is visible in the UI with the reason, so a teacher is
  never told something happened when it did not.

**Runner.**

- The worker runs as `npm run worker` in the same repository and the same image as the web
  application. It is a separate Railway service.
- The worker polls with a short interval and claims jobs in batches. It sleeps when the queue is
  empty.
- Long-running jobs (export, deletion) expose **progress** on the job row, so the UI can show
  "exporting — 60%" rather than a spinner.
- Cron-style recurring work (daily reminders, reconciliation, retention) is triggered by the
  platform scheduler; it enqueues a job rather than doing the work inline.
- The worker never runs inside an HTTP request. No outbound network call is made inside a database
  transaction, with one exception: the `set_config` statement that opens a scoped transaction
  (ADR-0006).

**Idempotency.**

- Every job kind is idempotent. Re-running a job produces the same end state.
- A job that writes a file does so under a deterministic key derived from its id, so a retry
  overwrites rather than duplicates.
- A job that sends email records the provider message id, and a retry of an already-sent job is a
  no-op.

## Consequences

### Positive

- No lost emails and no orphaned emails: the job and the state change share a transaction.
- The UI can honestly report progress, which satisfies `NF-11` and `F-P2-10` AC-3.
- The worker scales independently of the web tier without splitting the codebase.
- A third-party outage delays a job instead of failing a user request.
- A failed job is inspectable, so a support question has an answer.
- Idempotent retries make the pipeline safe to run twice.

### Negative

- The job table grows and needs an index and a retention policy; finished jobs are pruned.
- Polling adds a small latency (the poll interval) between a state change and a side effect.
- The claim protocol must be implemented carefully; a race would cause a duplicate job execution,
  which is why every job kind must be idempotent.
- A second process means a second thing to deploy, monitor, and scale, and it doubles the
  application boot path.
- Failed jobs require operator attention; there is no auto-healing for a permanently broken
  integration.

### Neutral

- The same queue absorbs future background work without new infrastructure.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Call the provider inline in the request** | The request blocks on a third party, a provider outage becomes a user-visible failure, and the dual-write problem appears as soon as a state change succeeds and the send fails. |
| **A managed queue (SQS, Redis Streams, BullMQ)** | Adds infrastructure and an operational dependency for a workload that one worker process handles comfortably. Revisit if queue depth outgrows a single worker. |
| **Node `setInterval` inside the web application** | Couples background work to the web tier's scaling. A horizontally scaled web tier runs duplicate timers, which duplicate reminders. |
| **The platform scheduler running the work directly** | Cannot express progress, retries, or per-tenant failure isolation. |
| **An event-stream platform (Kafka)** | Enormously disproportionate at this scale. |
| **A third-party workflow engine** | Adds a vendor, a schema language, and a runtime for a handful of job kinds. |

## Revisit when

- Job queue depth regularly exceeds what one worker drains.
- The worker process cannot be kept inside the deployment cost budget.
- Job kinds need long-running, multi-step, human-in-the-loop workflows.
