# Kashkol

Kashkol is a multi-tenant SaaS for Egyptian private teachers: students, groups, schedules,
attendance, homework, assessments, files, parent communication, and a manual payments ledger.
Arabic-first and RTL-correct, with English as a required second language.

This repository contains the **Kashkol application**: the M0 foundation plus the M1/M2 business
screens and the P3 learning-media, online-exam, and platform-operations slices. The full product,
flow, release, and architecture specifications live in [`docs/`](docs/). Read
[`AGENTS.md`](AGENTS.md) before changing code.

## What works today

| Surface                                                       | State                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Next.js 16 App Router, TypeScript, Tailwind v4                | Working                                                            |
| Arabic/English locale routing, RTL, theme tokens              | Working across the shell, auth, workspace, and business screens    |
| Prisma 7 schema, migrations, PostgreSQL RLS                   | Working; thirty committed migrations                            |
| Scoped tenancy helper and tenant isolation tests              | Working against a real database                                    |
| Better Auth sign-up/sign-in/sign-out, verification, recovery  | Working locally; console email, or SMTP when configured            |
| Workspace creation, ownership, profile, settings              | Working                                                            |
| Assistant permission model (server-enforced)                  | Implemented, including invitation and team-editing UI              |
| Parent/student portal-link authorization and portal UI        | Implemented and tested                                             |
| Core domain schema and business screens                       | Implemented — students, groups, sessions, attendance, homework, assessments, follow-up, files, payments, reports/exports |
| Weekly calendar and session attendance                        | Implemented; reads real sessions from `/api/sessions`              |
| Asynchronous report export                                    | Implemented — queue, worker endpoint, storage, signed download     |
| Recorded video (Cloudflare Stream adapter)                    | Implemented; unconfigured by default (`VIDEO_PROVIDER_DRIVER=none`) |
| Arabic search (`normalize_arabic`, `pg_trgm` GIN indexes)     | Working at the database layer                                      |
| Health and readiness probes                                   | `/healthz` and `/readyz`                                           |
| Local embedded PostgreSQL and deterministic seed              | Working; local-only by construction                                |

Nothing is simulated. The landing page at `/ar` and `/en` makes no claims the product cannot back:
every number is described as computed from records, WhatsApp is described as prepared-and-opened,
and payments are described as teacher-recorded. The status page at `/ar/status` reports only the
configuration, database, and migration state the server can observe. The local seed creates
synthetic demo workspaces; it refuses to run outside a loopback `APP_ENV=local` database.

## Requirements

- Node.js `24.x` (the pinned engine is `>=24.0.0`)
- npm `11.x`
- No global PostgreSQL installation: development uses the pinned embedded PostgreSQL package

## Quick start

```powershell
npm ci
Copy-Item .env.example .env.local
```

Start the development database in a first terminal. It runs in the foreground; `Ctrl+C` stops it.

```powershell
npm run db:dev:start
```

In a second terminal, apply the migration, seed the synthetic development data, and start Next.js:

```powershell
npm run db:migrate
npm run db:seed
npm run dev
```

Open:

- `http://localhost:3000` — redirects to the Arabic landing page
- `http://localhost:3000/ar` and `/en` — bilingual public landing page
- `http://localhost:3000/ar/status` and `/en/status` — readiness status page
- `http://localhost:3000/ar/sign-in` and `/en/sign-in` — sign in
- `http://localhost:3000/ar/sign-up` and `/en/sign-up` — create an account
- `http://localhost:3000/healthz` — liveness
- `http://localhost:3000/readyz` — readiness (configuration, database, migration)

The development database credentials are in `.env.example` and are documented as local-only. They
grant access only to the embedded cluster on `localhost:5433`.

### Email in local development and production

`EMAIL_TRANSPORT` selects the transport:

- `console` (the `.env.example` default for local development) prints verification and
  password-reset links to the **server console**. The configuration parser rejects it outside
  `APP_ENV=local`.
- `smtp` sends through the configured `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and
  `SMTP_SECURE`. Non-local environments fail configuration validation when the host or credentials
  are missing. Delivery failures are reduced to a generic error; credentials and recipient addresses
  are never logged.
- `none` disables email. Verification and recovery are disabled rather than pretending to send.

Production refuses `EMAIL_TRANSPORT=none`, so a real deployment must configure SMTP. The SMTP
transport is implemented and unit-tested with a mocked provider; it has not been verified against a
live mailbox in this checkout. See [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md).

### Authentication policy in this foundation

- Better Auth owns password hashing (scrypt), email/password sign-in, verification, and reset.
- Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` with a `__Host-` prefix outside local
  development. The session token is stripped from every JSON auth response by the route wrapper.
- The sliding window is 30 days; the application enforces a 12-hour idle timeout and a 90-day
  absolute cap in `src/modules/identity/session.ts`.
- Five failed sign-ins for the same account in 15 minutes lock that account temporarily. The
  identifier is stored only as a keyed hash in `auth_event`.
- Better Auth's database-backed rate limiter covers sign-in, sign-up, verification resend, and
  password reset. It is configurable through `AUTH_RATE_LIMIT_ENABLED`.
- A mutating server action and `PATCH /api/workspace` also check the request origin explicitly.
- `auth_event` is append-only for the application role and contains no email address, raw IP,
  session token, or password.

### Development accounts

The seed runs only when `APP_ENV=local`, `NODE_ENV` is not `production`, and `DATABASE_URL` points at
a loopback host. It creates synthetic accounts in two workspaces:

| Email                          | Role      | Workspace          |
| ------------------------------ | --------- | ------------------ |
| `demo.owner@kashkol.local`     | owner     | Nile Academy       |
| `demo.assistant@kashkol.local` | assistant | Nile Academy       |
| `demo.owner2@kashkol.local`    | owner     | Delta Study Centre |

The password for every local account is `KashkolDev!2026`. Sign in through `/ar/sign-in` or
`/en/sign-in` (or `POST /api/auth/sign-in/email`). An unverified account created through the sign-up
screen must open the verification link printed in the server console before it can create a
workspace.

## Commands

| Command                                | Purpose                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                          | Generate Prisma and run Next.js in development             |
| `npm run build`                        | Generate Prisma and build the standalone production server |
| `npm run start`                        | Copy static assets and run `.next/standalone/server.js`    |
| `npm run worker`                       | Run the background worker loop (claim-then-complete)     |
| `npm run lint`                         | ESLint plus the cross-file project rules                   |
| `npm run typecheck`                    | Generate Prisma and run `tsc --noEmit`                     |
| `npm test`                             | Unit tests (no database or network)                        |
| `npm run test:integration`             | RLS, seed, and readiness tests against the local database  |
| `npm run format` / `format:check`      | Prettier                                                   |
| `npm run db:dev:start` / `db:dev:stop` | Embedded PostgreSQL lifecycle                              |
| `npm run db:generate`                  | Generate `src/generated/prisma`                            |
| `npm run db:migrate`                   | Create/apply a development migration                       |
| `npm run db:deploy`                    | Apply committed migrations (staging/production)            |
| `npm run db:reset`                     | Reset the local database and re-run the seed               |
| `npm run db:seed`                      | Run the guarded local seed                                 |
| `npm run db:validate` / `db:status`    | Prisma schema and migration state                          |
| `npm run db:studio`                    | Prisma Studio                                              |

The pre-completion gate is:

```powershell
npm run lint
npm run typecheck
npm test
npm run test:integration   # requires the local database
npm run build
```

## How the foundation is organised

```
src/app/                     App Router routes
  [locale]/(auth)/           sign-in, sign-up, verification, recovery
  [locale]/app/              guarded workspace shell, dashboard, settings
  [locale]/workspace/new/    first-workspace creation
  actions/                   server actions (auth and workspace)
  api/auth/[...all]/         Better Auth handler (sanitised response)
  api/workspace/             session-derived workspace read/write
  api/portal/students/[id]/  portal projection guarded by portal_grant
  healthz/ readyz/           probes outside the locale tree
src/components/              form, shell, language switch, auth/workspace forms
src/lib/
  auth/                      Better Auth construction, policies, response sanitiser
  config/                    environment parsing and the local-only seed guard
  db/                        Prisma client, scoped transactions, tenant registry
  health/                    readiness checks
  http/                      request ids, CSRF/origin check, error envelope
  routes/registry.ts         every route handler, declared once
src/worker/                      background worker loop and entry point (drains, never HTTP)
src/modules/<module>/        service / repository / schemas / audit slices
  audit/                     redaction and the append-only audit writer
  identity/                  session resolution, lockout, email transport, portal auth
  tenancy/                   workspace, members, roles, and permissions
src/styles/                  design tokens and global CSS
prisma/                      schema and migrations
scripts/                     embedded DB, seed, standalone start, rules check
tests/unit/ tests/integration/
messages/                    ar.json and en.json
```

Rules that are enforced in CI, not by convention:

- Prisma is imported only from `src/lib/db/` and `src/modules/*/repository.ts`.
- Every tenant query runs inside `withScope()`, which sets `app.workspace_id` transaction-locally.
- The workspace id comes from the session. It is never read from a URL, body, or header.
- A route handler without a `src/lib/routes/registry.ts` entry fails `npm run lint`.
- Both message catalogues must have identical, non-empty key sets.
- Physical-direction CSS (`margin-left`, `left:`, `text-align: right`, …) is rejected. Use logical
  properties (`margin-inline`, `inset-inline`, `text-align: start`).
- No `NEXT_PUBLIC_*` name may look like a credential.

## Database and RLS

The application connects as a role that is **not** the table owner and has no `BYPASSRLS`. The
migration enables and forces row-level security on every tenant table. `withScope()` opens a
transaction and runs:

```sql
SELECT set_config('app.workspace_id', $1, true);
```

The setting is transaction-local, so a pooled connection cannot leak one workspace into the next
request. A query outside a scoped transaction sees no rows. The integration suite asserts this
against PostgreSQL, including a rejected cross-tenant write and the append-only audit log.

`workspace` is scoped by its own `id`; every other tenant table is scoped by `workspace_id`. The
registry in `src/lib/db/tenant-tables.ts` is compared with the schema and the migration by the
project-rules check.

Two SELECT-only self policies exist for session bootstrap:

- `workspace_member_self_read` lets a signed-in user list **their own** memberships before a
  workspace id is known. Writes still require the tenant scope.
- `portal_grant_self_read` lets a parent or student list **their own** student links. It never grants
  workspace-wide access. The portal projection (`resolvePortalStudent`) checks the linked student id
  before reading a student row: a different student in the same workspace is `403`, an unknown or
  foreign id is `404`.

The core domain tables — `subject`, `group`, `enrollment`, `teaching_session`, `attendance_mark`,
`attendance_revision`, `assessment`, `assessment_score`, `payment`, `payment_revision`, and `file` —
carry composite `(workspace_id, id)` foreign keys so a row in workspace A cannot point at a row in
workspace B. The revision chains and `audit_event` are append-only for the application role.

Arabic search is deliberately conservative: `normalize_arabic(text)` folds diacritics, tatweel,
Arabic-Indic digits, and alef/ya/ta-marbuta variants; `phonetic_arabic(text)` collapses common
interchangeable consonants. The derived `search_key` and `phonetic_key` columns are trigger-maintained
and indexed with `pg_trgm` GIN indexes. The stored name remains exactly as entered.

## Deployment (Railway)

The application is a set of two Node 24 processes, built once from this repository and started
with different commands:

1. **Web** — `npm run build` then `npm run start` (Next.js standalone). `/healthz` liveness and
   `/readyz` readiness are served by this process. A Railway pre-deploy command runs
   `npm run db:deploy` before the new image serves traffic. Health check is `/readyz`.
2. **Worker** — `npm run worker` (`railway.worker.json`). A long-running claim-then-complete loop
   that drains the message outbox per workspace and queued report exports across all workspaces.
   *Do not* give this service a `preDeployCommand` — the web service owns migrations, and a crash
   of the worker before the migration lands is a visible, restarted failure, not silent corruption.

Create two services from the same repository at the same commit:

| Service   | Config file           | Start command    | Health check |
| --------- | --------------------- | ---------------- | ------------ |
| `web`     | `railway.json`        | `npm run start`  | `/readyz`    |
| `worker`  | `railway.worker.json` | `npm run worker` | none (process) |

Deploy order: the `web` service deploys first. Its pre-deploy applies migrations, after which the
worker boots — the worker itself validates that applied migrations match what this build expects;
if the web pre-deploy has not finished, the worker exits non-zero immediately and Railway restarts
it (`restartPolicyType: ON_FAILURE`, max 10 retries) until the migration lands.

Configure both services with the same variables:

| Variable                 | Value                                                             |
| ------------------------ | ----------------------------------------------------------------- |
| `APP_ENV`                | `staging` or `production`                                         |
| `DATABASE_URL`           | Railway pooled PostgreSQL URL (application role)                  |
| `DIRECT_DATABASE_URL`    | Railway direct PostgreSQL URL (migrations)                        |
| `BETTER_AUTH_SECRET`     | A random secret of at least 32 characters from the secret manager |
| `BETTER_AUTH_URL`        | The public HTTPS origin                                           |
| `REQUIRE_MIGRATIONS`     | `true` (the worker and `/readyz` both refuse a behind schema)     |
| `EMAIL_TRANSPORT`        | `smtp` in staging/production; `console` is local-only             |
| `EMAIL_FROM`             | The sender address the SMTP provider will use                     |
| `SMTP_HOST` / `SMTP_PORT`| SMTP server and port                                              |
| `SMTP_USER` / `SMTP_PASS`| SMTP credentials from the secret manager                          |
| `SMTP_SECURE`            | `true` for implicit TLS (usually port 465), otherwise `false`     |
| `AUTH_RATE_LIMIT_ENABLED`| Defaults to `true` outside local development                      |
| `MESSAGING_WORKER_TOKEN` | ≥ 32 chars; used by `POST /api/worker/outbox` (dedicated token)   |
| `REPORT_EXPORT_WORKER_TOKEN` | ≥ 32 chars; used by `POST /api/worker/reports` (dedicated token) |
| `WORKER_POLL_INTERVAL_SECONDS` | Poll cadence (default `30`, range `1`–`300`)                 |

The pre-deploy command runs `npm run db:deploy` on the **web** service only, before the new image serves
traffic. The readiness probe is `/readyz`; liveness is `/healthz`. Never run `npm run db:seed` outside a
loopback development database — the guard refuses, but the rule is not to try.

The web service also exposes authenticated worker endpoints (`/api/worker/outbox` and
`/api/worker/reports`) for one-off drains; both require their dedicated bearer tokens, and neither
bypasses the staff-session path used by operators. The worker process never reuses one for the other,
and no credential ever reaches a client bundle.

The SMTP transport is implemented; a live provider and its deliverability setup (SPF, DKIM, DMARC) still
need to be configured and verified. Until SMTP is configured, production refuses to start rather than
falsely appearing to send mail. Observability is a later milestone (OI-3); until an SDK is chosen,
worker passes print one redacted `[worker] cycle ok` line per cycle with counts only — no job ids,
no bodies, no names.

## Background worker

```powershell
npm run worker
```

One process per workspace drainage pass, executed on `WORKER_POLL_INTERVAL_SECONDS` (default `30`).
It exits non-zero on an invalid environment or behind migrations so Railway restarts it visibly
rather than transparently; `SIGTERM`/`SIGINT` (deploys, scale-down, crash) drain cleanly: the
in-flight bounded batch completes, Prisma connections are closed, and the exit code reflects
success. The loop does not run inside an HTTP request, never performs an outbound network call from
inside a database transaction, and never claims a job it cannot honour.

To run a local production-mode worker against the local database:

```powershell
npm run db:deploy   # apply migrations
npm run worker
```

Check the worker by watching its logs — every cycle prints exactly one line:

```
[worker] cycle ok report=processed=0 succeeded=0 failed_deferred=0 outbox=processed=0 succeeded=0 failed_deferred=0 workspaces=0 elapsed_ms=1
```

The proxy must set `X-Real-IP` for Better Auth's IP-based rate limiting and session metadata; the
leftmost `X-Forwarded-For` value is not trusted.

## Documentation

Start with:

1. [`docs/PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md) — the requirement flows
2. [`docs/USER_FLOWS.md`](docs/USER_FLOWS.md) — the end-to-end flows
3. [`docs/RELEASE_PLAN.md`](docs/RELEASE_PLAN.md) — scope and release gates
4. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the system is built
5. [`docs/SECURITY_AND_PRIVACY.md`](docs/SECURITY_AND_PRIVACY.md) — the security posture
6. [`docs/decisions/`](docs/decisions/) — the architecture decisions and their reasoning
7. [`docs/STATUS.md`](docs/STATUS.md) — what is done and what is next

`madar-teacher-prototype.html` is read-only reference material. It is never modified and its
behaviour is not copied; its 23 known defects are catalogued as `DEF-01`–`DEF-23`.
