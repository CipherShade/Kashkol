# ADR-0011: Deploy on Railway

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Engineering
- **Scope:** M0–M3
- **Serves:** `F-P0-09` (platform baseline), `R-11` (data growth against the infrastructure budget)

## Context

The product must be deployable by a small team, with a low fixed cost at low volume, supporting a
Node.js Next.js application plus a worker process, a PostgreSQL database, and secrets. It must
support staging and production separation, preview environments, health checks, and scheduled jobs.

The deployment decision also constrains the data layer: the platform provides managed PostgreSQL, and
the connection is over the standard wire protocol, so nothing in the application is vendor-specific.

## Decision

Deploy on **Railway**: one application service, one worker service running the same image, and a
managed PostgreSQL instance.

**Topology**

| Service | Command | Notes |
|---|---|---|
| `web` | `npm start` (Next.js production server) | Scales horizontally |
| `worker` | `npm run worker` | The same build; initially one instance |
| `postgres` | Managed | Platform-managed backups |

- The worker and the web app share a repository, an image, and a dependency set, so they cannot
  drift. Only the command differs.
- Both services read the same environment variables. A database that the worker must not touch does
  not exist in this design.

**Environments**

- `production`, `staging`, and per-pull-request previews. Each has its own database, its own
  storage bucket, its own email provider, and its own secret set.
- A CI check refuses to deploy to production with a staging configuration value. **[CI]**

**Migrations and releases**

- `prisma migrate deploy` runs in the release phase, before the new version starts serving. The
  schema is never mutated on app boot.
- Migrations are forward-only with compensating migrations. A rollback redeploys the previous
  release; it does not require a down migration (`F-P0-09` AC-2).
- A migration that breaks the previous release is a release-blocking defect: expand/contract
  sequencing is used so the old and new application versions can both run against the migrated
  schema.

**Health, scaling, and cron**

- `/api/health` is a liveness check; `/api/health/ready` checks the database and gates traffic.
- The platform scheduler triggers the recurring jobs (daily reminders, reconciliation, retention);
  it enqueues jobs rather than doing work inline (ADR-0008).
- The worker starts with one instance. A second instance is safe because the job claim protocol
  makes claiming atomic, but there is no need for two until the queue demands it.

**Secrets**

- Railway service variables, injected at runtime. No `.env` file in the image, and no secret in the
  repository (CI secret scanning blocks a commit).

**Region**

- Build and beta in any region (`OQ-19` default (a)). The data-residency question is deferred
  pending the legal review; because the application only speaks the PostgreSQL wire protocol, a
  region change is a deployment change rather than a code change.

## Consequences

### Positive

- One platform for the app, the worker, the database, the secrets, the cron, and the previews.
- Predictable cost that scales with usage; the private-teacher customer base keeps the fixed cost
  low.
- Managed PostgreSQL with backups and point-in-time recovery, without an ops burden.
- A single `railway up` from a clean checkout gets a working environment.
- Preview environments per pull request make review easier.

### Negative

- Railway is a vendor dependency: pricing, availability, and platform limits are external
  factors.
- The platform's cron and job model is less flexible than a dedicated scheduler.
- Debugging a production issue depends on Railway's logs and metrics.
- A regional move is a full environment rebuild, not a click.
- The single-region deployment is a constraint on the data-residency answer.

### Neutral

- Nothing in the code is Railway-specific: the application is a Node process and a PostgreSQL
  client, so the platform remains replaceable.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Vercel** | Excellent for the web tier, but the worker process, the long-running jobs, and the platform scheduler are awkward or unavailable. The "serverless function" model also conflicts with the interactive transactions that the RLS scoping requires. |
| **Fly.io** | Capable and close to the requirements, but more operational surface (regions, volumes, private networking) than a small team needs, and the PostgreSQL story requires more assembly. |
| **AWS (ECS + RDS + S3 + SES)** | The most capable and the most expensive and the most work: IAM, VPC, load balancers, and a build pipeline. Overkill for a private-teacher SaaS at this stage. |
| **Google Cloud Run + Cloud SQL** | Similar reasoning; less familiar to the team than Railway. |
| **A single VPS with Docker Compose** | Cheapest, and total control — but it makes the team responsible for patching the OS, the database, TLS, backups, and monitoring. For a small team, that is a bad trade. |
| **Render** | Similar to Railway. Railway's combined app/worker/database model and preview environments were the deciding factors. |

## Revisit when

- The deployment cost exceeds the revenue it supports.
- The data-residency requirement demands a specific region or a jurisdiction Railway cannot serve.
- The worker workload outgrows the platform's process model.
- The security review requires a control the platform does not offer (for example, a customer-managed
  encryption key or a private network between the app and the database).
