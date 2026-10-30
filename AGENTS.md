# AGENTS.md

Operating instructions for any AI agent or engineer working in this repository.

This file is **durable**. It stays true across every task. When a task needs something the
specification does not say, the answer is a new ADR and an update to the affected document — not a
quiet decision made in a pull request.

---

## 1. What this project is

Kashkol is a multi-tenant SaaS for Egyptian private teachers: students, groups, schedules,
attendance, homework, assessments, files, parent communication, and a manual payments ledger.
Arabic-first, RTL-correct, with English as a required second language.

The users are individuals. The data belongs to minors and their families. The product's core
promise is that **the teacher always sees the truth**: nothing is fabricated, nothing is faked, and
no screen claims a capability the system does not have.

---

## 2. The rules that never bend

### 2.1 Nothing is faked

`PRODUCT_REQUIREMENTS.md` §12 lists thirteen prohibitions (`NF-1`–`NF-13`). They are not style
preferences; they are the definition of a correct implementation.

- No fabricated statistics. Every number on screen is computed from records.
- No simulated delivery. A WhatsApp message is **prepared** and **opened in WhatsApp** — never
  "sent", never "delivered".
- No mocked portals, mocked QR, mocked payments, mock video.
- No fake audit trails. The audit event is written in the same transaction as the mutation.
- No UI-only authorisation. A hidden button is not a permission check.
- No fake tenant isolation, no fake theme, no fake locale, no fake direction.
- No placeholder buttons, no seeded demo content in production, no silent data loss.

If a feature cannot be implemented truthfully yet, ship it **disabled** and say so — do not ship a
simulation of it.

### 2.2 The specification is the authority

The requirement documents are the source of truth, in this order:

1. `docs/PRODUCT_REQUIREMENTS.md` — what the product is: the requirement flows `F-Pn-nn` (§5–§8),
   the risk register `R-nn` (§11), and the hard prohibitions `NF-1`–`NF-13` (§12)
2. `docs/USER_FLOWS.md` — the end-to-end flows `F1`–`F26`, and the flow invariants
3. `docs/RELEASE_PLAN.md` — what ships in which milestone, and the release gates
4. `docs/OPEN_QUESTIONS_AND_ASSUMPTIONS.md` — the assumptions `A-nn` and open questions `OQ-nn`
5. `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/SECURITY_AND_PRIVACY.md`,
   `docs/INTEGRATIONS.md` — how it is built
6. `docs/decisions/*.md` — why it is built that way

`madar-teacher-prototype.html` is **read-only reference material**. It shows a rough visual
direction and a set of known defects. Never copy its behaviour: `DEF-01`–`DEF-23` catalogue 23
defects that must not be carried forward. Never modify the file.

### 2.3 Tenant and personal data are protected

- The workspace id comes from the **session**, never from a URL parameter, a body field, or a
  client-controlled header.
- Prisma is imported **only** in `src/modules/*/repository.ts` and `src/lib/db/`.
- Every tenant-scoped query runs inside a scoped transaction that sets
  `app.workspace_id` (ADR-0006).
- A resource that does not exist and a resource owned by another workspace are indistinguishable:
  both return `404` with an identical body.
- No student name, phone number, note body, message body, session token, password, or file
  content ever reaches a log, an error report, an analytics event, or a client bundle.
- A credential never appears in the repository. No secret is prefixed `NEXT_PUBLIC_`.

### 2.4 Behaviour is tested, not asserted

- Every behaviour change comes with a test that fails without it.
- The tenant isolation matrix and the permission matrix are **generated** from the route registry
  (ADR-0012). A new route without a registry entry fails CI.
- A failing isolation or permission test is never disabled, skipped, or weakened. If the test is
  wrong, fix it in the same commit that changes the behaviour.
- Tests are deterministic: no network, no real clock (the clock is injected), no ordering
  assumptions, no shared mutable fixtures.

### 2.5 Scope discipline

- Implement what the current milestone requires. `RELEASE_PLAN.md` §2–§5 defines the scope; the
  scope-out tables are as binding as the scope-in tables.
- Do not add a feature "while you are in there". Note it in `docs/STATUS.md` instead.
- Do not add a dependency without an ADR entry (`INTEGRATIONS.md` §1.1) and a pin.
- Do not change an accepted ADR. Write a new ADR that supersedes it.

---

## 3. Repository layout

```
docs/                      All specification and architecture documents
docs/decisions/            Architecture decision records
madar-teacher-prototype.html   Read-only reference prototype — never modify
.gitattributes             Line-ending and binary-file rules (LF, UTF-8)
src/
  app/                     Next.js App Router routes
    [locale]/              Locale shell and status page
    api/auth/[...all]/     Better Auth handler
    healthz/ readyz/       Liveness and readiness probes
  components/ui/           Copied shadcn/ui-style primitives on Radix
  generated/prisma/        Generated Prisma client (git-ignored, explicit output)
  i18n/                    routing, request config, locale-aware navigation
  lib/
    auth/                  Better Auth construction
    config/                Environment parsing and the local-only seed guard
    db/                    Prisma client, tenant-table registry, scoped transactions
    health/                Readiness checks
    http/                  Request ids and the error envelope
    routes/registry.ts     The declarative route registry
  modules/
    <module>/
      service.ts           Business rules and authorisation
      repository.ts        The ONLY place module Prisma access lives
      schemas.ts           Zod schemas shared with the client
      adapters/            Third-party integrations behind interfaces
      audit.ts             The module's audit events
  styles/                  tokens.css and globals.css
  proxy.ts                Next.js 16 proxy (locale routing and request id)
messages/                  ar.json and en.json
prisma/                    Schema and committed migrations
scripts/                   dev-db, seed, standalone start, project-rules check
tests/unit/                Deterministic unit tests (no database, no network)
tests/integration/         RLS, seed, and readiness tests against PostgreSQL
```

The foundation ships one module, `tenancy`; its `README.md` records the module boundary rules.

The full layout with the rationale is in `ARCHITECTURE.md` §6.

---

## 4. How to work a task

1. **Read the requirement first.** Find the `F-nn` flow for the behaviour and the `R-nn` risks it
   addresses. If the requirement is ambiguous, check `OPEN_QUESTIONS_AND_ASSUMPTIONS.md` for a
   default. If there is no default, the task is blocked on a decision — record it and ask, do not
   guess.
2. **Check `docs/STATUS.md`.** It is the working checklist. The item you are doing should be there.
3. **Plan the change.** Identify the owning module. A change that spans two modules goes through one
   module's public API, not by reaching into the other's internals.
4. **Write the schema first** (if a table changes), then the repository function, then the service,
   then the route, then the UI.
5. **Write the test alongside the behaviour**, not afterwards.
6. **Run the full gate.** See §5.
7. **Update the documents** that the change makes wrong. A change to a table updates
   `DATA_MODEL.md`; a change to a decision updates or supersedes an ADR; a change in progress
   updates `docs/STATUS.md`.
8. **Update `docs/STATUS.md`.** Mark the checklist item done only when its exit condition is met.
   If you discovered that a gate is blocked, say so there.

---

## 5. The pre-completion gate

Run all of these before declaring any task done. A task is not done until they pass.

```bash
npm run lint              # ESLint plus the cross-file project rules
npm run typecheck         # prisma generate + tsc --noEmit
npm test                  # unit tests; no database and no network
npm run test:integration  # RLS and readiness against the local PostgreSQL
npm run build             # prisma generate + Next.js production build
```

The local database is the pinned embedded PostgreSQL, not a globally installed server:

```bash
npm run db:dev:start      # foreground; Ctrl+C stops it
npm run db:migrate
npm run db:seed           # refuses unless APP_ENV=local and the host is loopback
npm run db:dev:stop       # stop a cluster started in another terminal
```

`npm run db:seed` is local-only by construction. It must never be added to a deploy command.

Then, depending on the change:

| Change                         | Additional check                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| A route was added or changed   | The route registry is updated and the generated matrices were regenerated                                      |
| A table changed                | The migration is created, the schema check passes, and `DATA_MODEL.md` is updated                              |
| A dependency was added         | An ADR exists and the package is pinned                                                                        |
| A tenant query changed         | The isolation matrix passes against a real database                                                            |
| A permission changed           | The permission matrix passes for every role                                                                    |
| Anything user-facing           | It renders in Arabic and English, in both directions, in light and dark, with empty, loading, and error states |
| A log or an error path changed | The redaction test still passes                                                                                |

**Never** weaken a check, a lint rule, or a type constraint to make a task pass.

---

## 6. Engineering conventions

**Stack and versions are pinned.** Use the versions in `ARCHITECTURE.md` §3. Never install
`latest`. Never move to a release candidate: Prisma 8 is an RC and must not be used.

**Prisma 7 specifics.** The project is ESM. The client is generated with an explicit `output`.
`prisma.config.ts` imports `dotenv/config` explicitly. `prisma generate` is an explicit build step.
The seed is explicit. `$use` middleware does not exist.

**Next.js 16 specifics.** Turbopack is the default. Request APIs are async. `src/proxy.ts` replaces
`middleware.ts`. `next lint` is removed — ESLint runs as its own CI job.

**Tenant scoping.** Every tenant-scoped read or write runs inside a scoped transaction:

```ts
return db.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceId}, true)`;
  return tx.student.findMany({ where: { workspaceId } });
});
```

Never call out to the network inside a transaction.

**Validation.** One Zod schema per operation, shared by the client and the server, living beside
the module it belongs to. The client parse is advisory; the server parse is authoritative.

**Styling.** Tailwind v4 with CSS-first configuration. Colours come from the token layer, never
from raw hex. Layout uses CSS logical properties only (`ms-*`, `pe-*`, `start-*`, `text-align:
start`) — physical direction properties are banned by lint.

**i18n.** Every string comes from the message catalogue. A missing key in either locale fails the
build. Dates, numbers, and currency are formatted with `Intl` through `next-intl`.

**Errors.** One error envelope (`ARCHITECTURE.md` §7): a stable code, a message key, an optional
field-level detail. No stack trace, no internal message, no raw database error to the client.

**Third-party calls.** Through an adapter interface, with a timeout, a retry policy, a sanitised
failure, and an in-memory fake for tests. No credential is ever client-side.

---

## 7. Writing style for documents

- English, plain, and specific. Prefer "must" and "may" over vague phrasing.
- Every requirement has an identifier (`R-nn`), every flow an `F-nn`, every assumption an `A-nn`,
  every open question an `OQ-nn`, every decision a `D-nn`, every defect a `DEF-nn`.
- Every statement about the system must be traceable to a requirement, a flow, or a decision. If it
  is not, either add the requirement or remove the statement.
- Diagrams are Mermaid. They must render.
- Document what is **not** decided, with the conservative default that applies until it is.

---

## 8. When you are unsure

1. **Check the documents first.** The answer is usually already written down.
2. **Check the ADRs.** The reasoning is recorded there, including the alternatives that were
   rejected and the trigger that would reopen the decision.
3. **Consult the official documentation** for an API whose behaviour you are not certain about —
   the library's own docs, not a search-result summary. Pin the version you read against the
   pinned version in `ARCHITECTURE.md` §3.
4. **When two documents disagree, do not pick one silently.** Record the conflict, apply the
   conservative default, and fix the documents in the same change.
5. **When the answer requires a product decision, stop and ask.** Do not invent a requirement. The
   conservative default in `OPEN_QUESTIONS_AND_ASSUMPTIONS.md` exists so work can continue, but the
   default must be confirmed before it becomes permanent.
6. **When the answer requires a legal answer, stop.** Minors' data, data residency, the privacy
   notice, and the retention windows need the legal review. Engineering states the technical
   constraint; it does not make the legal call.

---

## 9. Definition of done

A change is done when:

- The behaviour matches the requirement and the flow.
- Tests cover the new behaviour, and the isolation and permission matrices pass.
- `lint`, `typecheck`, `test`, and `build` all pass.
- The affected documents are updated, including `docs/STATUS.md`.
- Nothing is faked, and nothing claims a capability the system does not have.
- The change can be explained in one sentence: what it does, and which requirement it satisfies.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
