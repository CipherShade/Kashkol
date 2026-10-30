# Kashkol

Kashkol is a multi-tenant SaaS for Egyptian private teachers: students, groups, schedules,
attendance, homework, assessments, files, parent communication, and a manual payments ledger.
Arabic-first and RTL-correct, with English as a required second language.

This repository currently contains the **application foundation (M0 substrate)**. The full product,
flow, release, and architecture specifications live in [`docs/`](docs/). Read
[`AGENTS.md`](AGENTS.md) before changing code.

## What works today

| Surface                                                       | State                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Next.js 16 App Router, TypeScript, Tailwind v4                | Working                                                            |
| Arabic/English locale routing, RTL, theme tokens              | Working at the shell, auth, and workspace levels                   |
| Prisma 7 schema, migrations, PostgreSQL RLS                   | Working; five committed migrations                                  |
| Scoped tenancy helper and tenant isolation tests              | Working against a real database                                    |
| Better Auth sign-up/sign-in/sign-out, verification, recovery  | Working locally; email delivery is console-only                    |
| Workspace creation, ownership, profile, settings              | Working                                                            |
| Assistant permission model (server-enforced)                  | Foundation and tests; team-editing UI is deferred to P2            |
| Parent/student portal-link authorization                      | Foundation and tests; portal UI is deferred to P2                  |
| Core domain schema (subjects, groups, sessions, attendance, …) | Schema and migration; no CRUD screens yet                          |
| Arabic search (`normalize_arabic`, `pg_trgm` GIN indexes)     | Working at the database layer                                      |
| Health and readiness probes                                   | `/healthz` and `/readyz`                                           |
| Local embedded PostgreSQL and deterministic seed              | Working; local-only by construction                                |
| Business screens (students, groups, attendance, …)            | **Not implemented** — the schema exists, the CRUD UI does not      |

Nothing is simulated. The status page reports only the configuration, database, and migration state
the server can observe. There are no placeholder buttons and no seeded business data. The dashboard
shows only the workspace profile, the onboarding checklist, and the member list; it computes no
statistics because there are no student records yet.

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

- `http://localhost:3000` — redirects to the Arabic status page
- `http://localhost:3000/ar` and `/en` — bilingual status shell
- `http://localhost:3000/ar/sign-in` and `/en/sign-in` — sign in
- `http://localhost:3000/ar/sign-up` and `/en/sign-up` — create an account
- `http://localhost:3000/healthz` — liveness
- `http://localhost:3000/readyz` — readiness (configuration, database, migration)

The development database credentials are in `.env.example` and are documented as local-only. They
grant access only to the embedded cluster on `localhost:5433`.

### Email in local development

No email provider is selected yet (`INTEGRATIONS.md` §1.1), so the only implemented transport is a
**local console transport**. With `EMAIL_TRANSPORT=console` (the `.env.example` default for local
development), verification and password-reset links are printed to the **server console**. They are
never returned in an HTTP response and the configuration parser rejects this transport outside
`APP_ENV=local`.

Password recovery in a real deployment therefore requires a provider to be selected by ADR and the
transport to be implemented. Until then, `APP_ENV=production` refuses to start without a configured
transport rather than pretending recovery works. The UI states this limitation when the transport is
disabled.

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

The app is a Node 24 process with Next.js standalone output. `railway.json` sets the build,
migration, start, and readiness commands. Configure these service variables:

| Variable                 | Value                                                             |
| ------------------------ | ----------------------------------------------------------------- |
| `APP_ENV`                | `staging` or `production`                                         |
| `DATABASE_URL`           | Railway pooled PostgreSQL URL (application role)                  |
| `DIRECT_DATABASE_URL`    | Railway direct PostgreSQL URL (migrations)                        |
| `BETTER_AUTH_SECRET`     | A random secret of at least 32 characters from the secret manager |
| `BETTER_AUTH_URL`        | The public HTTPS origin                                           |
| `REQUIRE_MIGRATIONS`     | `true`                                                            |
| `EMAIL_TRANSPORT`        | `console` is local-only; a production provider is not implemented yet |
| `EMAIL_FROM`             | The sender address the selected provider will use                 |
| `AUTH_RATE_LIMIT_ENABLED`| Defaults to `true` outside local development                      |

The pre-deploy command runs `npm run db:deploy` before the new image serves traffic. The readiness
probe is `/readyz`; liveness is `/healthz`. Never run `npm run db:seed` outside a loopback
development database — the guard refuses, but the rule is not to try.

The worker process, object storage, email provider, and observability SDKs are later milestones and
are not configured here. The foundation does not claim they exist. In particular, **no production
email transport is implemented**: `EMAIL_TRANSPORT` accepts only `console` (local only) and `none`
(disabled), and production refuses `none`. A provider must be chosen by ADR and implemented before a
production deployment can complete verification or recovery. Until then, production is intentionally
not deployable rather than falsely appearing to send mail.

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
