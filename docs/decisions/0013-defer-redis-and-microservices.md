# ADR-0013: Defer Redis, external queues, and microservices

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Engineering
- **Scope:** M0–M3
- **Serves:** `R-04` (feature creep), `R-11` (data growth against the infrastructure budget), `OQ-01` (team shape)

## Context

Kashkol is a multi-tenant SaaS with a single deployable unit. As with any such product, there is
pressure to add infrastructure that "will be needed at scale": a cache, a message broker, a
separate search cluster, background workers on a queue service.

The customer base is private Egyptian teachers. A single teacher has tens to low hundreds of
students and tens of sessions a month. The total data volume across all tenants is small, and the
per-tenant data volume is smaller. The infrastructure that would be added costs money every month
whether or not it is used, and it costs engineering attention every time it is operated.

## Decision

**No Redis. No external message broker. No microservices. No separate search engine. Not yet.**

Each is deferred with a specific trigger that would justify it, recorded here so the decision is
revisit-able on evidence rather than on anxiety.

| Capability | Chosen now | Deferred option | Trigger to adopt it |
|---|---|---|---|
| Caching | PostgreSQL + request-scoped memoisation; a bounded in-process cache | Redis | Measured p95 latency is dominated by repeated identical queries, **and** a single instance cannot hold the working set |
| Job queue | The `job` table drained by the in-deployment worker (ADR-0008) | SQS / Redis Streams / BullMQ | Queue depth regularly exceeds one worker's drain rate, or job latency breaches an SLA |
| Full-text search | PostgreSQL `tsvector` + GIN, workspace-scoped | Meilisearch / Elasticsearch | Search latency or relevance fails its requirement at measured data volume |
| Service split | Modular monolith with enforced boundaries (ADR-0001) | Microservices | A module needs independent scaling or an independent release cadence |
| Realtime | Server-rendered pages + an explicit refresh | WebSockets / a realtime broker | A documented feature requires live updates, and polling does not satisfy it |
| Multi-region | Single region | Multi-region | The legal review requires a specific jurisdiction |

**The discipline this decision requires.**

1. **Measure before adding.** Every claim that a cache or a broker is needed must cite a measurement,
   not an expectation. `ARCHITECTURE.md` §21 records the performance budgets that make such a
   measurement possible.
2. **The triggers are written down.** Each row above names the condition that reopens the question.
   Without a written trigger, a deferred decision becomes an unbounded debate.
3. **The modular monolith is prepared for a split.** Module boundaries and repository ownership
   mean extracting a module into a service is a mechanical change, not a rewrite (ADR-0001).
4. **Deferred is not forbidden.** Adding one of these is a legitimate ADR, not a mistake.

## Consequences

### Positive

- The infrastructure cost stays close to the cost of the app and the database.
- One deployment, one database, one set of secrets, one set of logs. A small team can operate it.
- No cache invalidation problem. No broker delivery semantics to reason about. No eventual
  consistency between a service and its data.
- The performance budgets are achievable with plain PostgreSQL at the expected data volume.
- Every added dependency in the future has a recorded justification.

### Negative

- A cold cache or a recomputed aggregate is served from the database, so p95 latency is higher than
  it would be with Redis. Accepted, and bounded by the budgets.
- The worker runs in the deployment, so a heavy job competes with request serving for the same
  process budget. Mitigated by running the worker as a separate service and by bounding job
  payloads.
- Scaling is coarse: the app scales as a unit.
- If the customer base grows into schools with thousands of students per tenant, some of these
  triggers will fire and the work will be needed.

### Neutral

- The deferred capabilities are not blocked by anything in the data model. The schemas do not assume
  a queue or a cache; the `job` table is already the queue.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Redis from day one** | A monthly fixed cost and an operational dependency, for a workload that has not been measured. The cache would also introduce invalidation bugs — a stale cached balance is a wrong number shown to a parent. |
| **BullMQ / SQS from day one** | Same reasoning: a broker to run a handful of job kinds that one worker drains comfortably. The outbox pattern is the requirement (ADR-0008), not the broker. |
| **Elasticsearch / Meilisearch** | Operationally heavy, and PostgreSQL full-text search with a GIN index is sufficient for a tenant-scoped search over a teacher's own data. |
| **A microservice per module** | Rejected in ADR-0001 for the reasons given there. |
| **A serverless / edge-first architecture** | Conflicts with the interactive transactions and long-lived connections the RLS scoping needs, and with the process model of the worker. |
| **A "prepare for scale" architecture (everything prepared, nothing built)** | Rejected as a variant of the same problem: preparing for a scale that has not been measured costs engineering time and produces dead abstractions. |

## Revisit when

- Any trigger in the table above is met with a measurement that shows it.
- The customer profile changes materially (individual teachers to schools or districts).
- The performance budgets in `ARCHITECTURE.md` §21 are missed and the cause is a measured
  infrastructure limit rather than a query defect.
