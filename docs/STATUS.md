# Kashkol — Status

**Date:** 2026-11-01 · **Status:** P3 platform administration (`F-P3-03`) and centralized workspace plans/limits (`F-P3-04`), recorded video (`F-P3-02`), online exams (`F-P3-01`), M2 parent/student portals, PWA/Web Push, and teacher workspace administration implemented · **Phase:** M1/M2 core + P3 learning media, online assessments & platform operations

---

## 1. Where the project stands

The **specification phase** and the **architecture phase** are complete. The application foundation
now exists on top of them: the Next.js scaffold, the pinned toolchain, the Prisma 7 schema and thirteen
migrations, PostgreSQL row-level security, the scoped-tenancy helper, the guarded local
seed, Better Auth with the sign-up/sign-in/verification/recovery UI, workspace creation and settings,
the server-enforced role and permission model, the portal-link authorization design, audit
infrastructure, the core domain schema with Arabic search indexes, the bilingual shell,
health/readiness probes, the route registry, and the project-rule checks.

| Item | State |
|---|---|
| Reference prototype | Present at the repository root, **read only, unmodified** |
| Product specification | Complete — `docs/PRODUCT_REQUIREMENTS.md` |
| User flows | Complete — `docs/USER_FLOWS.md` |
| Release plan | Complete — `docs/RELEASE_PLAN.md` |
| Open questions and assumptions | Complete — `docs/OPEN_QUESTIONS_AND_ASSUMPTIONS.md` |
| System architecture | Complete — `docs/ARCHITECTURE.md` |
| Data model | Complete — `docs/DATA_MODEL.md` |
| Security and privacy | Complete — `docs/SECURITY_AND_PRIVACY.md` |
| Integration contracts | Complete — `docs/INTEGRATIONS.md` |
| Architecture decisions | Complete — `docs/decisions/` (18 ADRs + index) |
| Agent instructions | Complete — `../AGENTS.md` |
| Application foundation | **Implemented** — scaffold, DB/RLS, tenancy substrate, probes, locale shell |
| Authentication and workspace flows | **Implemented** — Better Auth UI, verification, recovery, workspace creation/settings, guarded shell |
| Authorization foundation | **Implemented** — owner/assistant roles, grants, owner-only operations, portal-link checks, generated-access tests |
| Core domain schema | **Implemented** — subjects, groups, enrollments, sessions, attendance, homework, assessments, follow-up, payments, files, Arabic search |
| Business screens | **Implemented** — students, groups, homework, assessments, follow-up, files, account, settings, scoped search, manual payments, and report/export flows are implemented; remaining in-progress work is outside the manual ledger/reporting scope |
| Outbound email provider | **Not implemented** — local console transport only; production refuses to start without a transport |
| Git history | No commits yet; the foundation files are untracked |

**Implemented in this foundation**

- Next.js 16.4.2 App Router, React 19.2, TypeScript 5.9, Tailwind v4, next-intl 4.14.9, Vitest 5.
- Prisma 7.10.1 with the PostgreSQL driver adapter and an explicit generated-client output.
- Thirteen tracked migrations are applied to the local development database, including academic
  records and the manual payment/report migrations:
  homework, assessment result details, follow-up records, transactional audit, and forced RLS.
- `withScope()`/`withUserScope()` transaction helpers and a tenant-table registry checked against the
  schema and SQL.
- Deterministic, idempotent local seed with a production/loopback guard.
- Better Auth at `/api/auth/[...all]` with sign-up, sign-in, sign-out, email verification, password
  reset, database-backed rate limits, account lockout, and a session-token-free JSON response.
- Session policy: 30-day sliding expiry, 12-hour idle timeout, 90-day absolute cap, server-side
  revocation on sign-out and membership change.
- Sign-in, sign-up, forgot-password, reset-password, and verify-email screens in Arabic and English.
- Workspace creation (atomic with the owner membership, settings, checklist, and audit event) and a
  settings screen for workspace identity, locale, timezone, attendance thresholds, theme defaults,
  and functional parent-notification preferences.
- Owner/assistant administration: owner-only invitations with zero-grant defaults, verified-email
  single-use acceptance, expiration/resend/revoke handling, per-member permission editing with
  sensitive-access warnings, suspension/reactivation/removal, and server-side authorization. Member
  removal, suspension, and permission changes revoke sessions.
- Access-controlled audit history for membership and permission operations, financial changes, and
  attendance corrections; the reader returns a redacted projection without event diffs.
- Portal-link authorization and dedicated Parent & Student Portal areas (`/[locale]/portal/parent`,
  `/[locale]/portal/student`, `/[locale]/portal/link/[token]`):
  - Verified invitation/account linking/revocation (`portal_invitation` hashed tokens, verified-email match, granular per-link permissions, immediate revocation, and audit logging).
  - Parent portal scoped strictly to explicitly linked children, permitted attendance, published/locked grades (`assessment.lockedAt !== null`), assigned homework, clean shared resources, approved payment/balance ledger data (when `showPayments` is enabled), schedule changes, and private notifications — never exposing other students, other guardians, private teacher notes, or assistant activity.
  - Student portal scoped strictly to the linked student's own upcoming sessions, permitted attendance, assigned homework (with self-submission status marking), published grades, and clean shared learning materials.
  - Installable PWA (`/manifest.webmanifest`, `/manifest.json`, `/sw.js`, icons, iOS Home Screen guidance, offline indicator) and optional VAPID Web Push (`/api/portal/push`) with lock-screen-safe generic payload defaults (`includeSensitiveDetails = false`) and an always-available in-app notification center fallback (`/api/portal/notifications`).
- Append-only audit writer with field redaction, an atomicity test, and append-only revision chains.
- Core domain schema: subject, group, enrollment, teaching session, attendance mark and revision,
  assessment and score, homework/submissions/resources, follow-up/tasks/history, append-only
  payments/adjustments/fee rules, report exports, and files, with composite tenant foreign keys.
- Arabic search: `normalize_arabic`, `phonetic_arabic`, trigger-maintained search keys, and
  `pg_trgm` GIN indexes.
- M1 student and group screens: directory, filters, create/edit/archive, duplicate warning, notes,
  CSV/XLSX import and export, group configuration, roster, enrollment, transfer, conflict warning,
  and upcoming sessions.
- Scoped search (`F-P1-13`) over non-archived students and groups, with permission-filtered result
  types, five results per type, keyboard navigation, and a responsive top-bar control at
  `/api/search`.
- Learning Materials library (`F-P1-11`) with tenant-scoped metadata and recipient joins, local-only
  and S3-compatible storage, ClamAV fail-closed scanning, authorized short-lived downloads,
  archive/restore/delete, bilingual upload and retry states, and storage usage.
- Recorded Video Lessons (`F-P3-02`) via external provider adapter (`src/modules/videos/`):
  - `CloudflareStreamAdapter` using Cloudflare Stream's official v4 REST API, HMAC-SHA256 short-lived signed playback tokens, and `Webhook-Signature` verification (`POST /api/videos/webhook`), plus deterministic `FakeVideoProviderAdapter` for tests and `UnconfiguredVideoProviderAdapter` when `VIDEO_PROVIDER_DRIVER=none`.
  - Truthful setup state when no provider is configured (`VIDEO_PROVIDER_DRIVER=none`) — never showing simulated or fake hosted videos (`NF-1`–`NF-13`).
  - Workspace limits and cost-driver tracking (`videoCount`, `totalStorageBytes`, `totalDurationSeconds`, `totalPlaybacks`, `estimatedBandwidthBytes` bounded by `VIDEO_MAX_COUNT_PER_WORKSPACE`, `VIDEO_MAX_STORAGE_BYTES_PER_WORKSPACE`, `VIDEO_MAX_BANDWIDTH_BYTES_PER_MONTH`) without claiming unlimited storage.
  - Authorized short-lived signed playback for staff (`POST /api/videos/[videoId]/playback`) and entitled parent/student portal viewers (`POST /api/portal/videos/[videoId]/playback`).
- Online Exams & Quizzes (`F-P3-01`) (`src/modules/exams/`):
  - Question sets (`mcq_single`, `true_false`, `short_answer`, `essay`), group or selected-student assignment, server-enforced availability window (`availableFrom`, `availableUntil`, `durationMinutes`), `maxAttempts`, and teacher preview (`GET /api/exams/[examId]`).
  - Authenticated student portal entry only (`requireStudentPortalContext` on `/api/portal/student/exams*`) — never via unprotected name/phone lookup.
  - Deterministic auto-grading (`mcq_single`, `true_false`, normalized Arabic/English `short_answer`), safe draft response saving (`PUT`), idempotent duplicate final submission protection (`POST`), publish-gated result visibility (`after_manual_publish` | `immediate_after_submit` | `after_window_close`), and audited manual grading / grade corrections (`exam.manually_graded` and `exam.grade_corrected` requiring a correction reason) synced to `Assessment` / `AssessmentScore`.
  - Conservative integrity notice explicitly stating that browser-based quizzes enforce server-side deadlines and attempt limits and do not provide lockdown-grade anti-cheat protection in a web browser.
- Platform Administration & Centralized Workspace Plans (`F-P3-03` & `F-P3-04`) (`src/modules/platform-admin/`, `scripts/platform-admin.ts`, `docs/SUPPORT_RUNBOOK.md`):
  - Non-public CLI provisioning (`npm run platform-admin -- grant|revoke|list`) requiring verified email and audit reason — never auto-promoting the first user or hardcoded emails.
  - Metadata-only workspace inspection (`/api/platform-admin/overview`, `/api/platform-admin/workspaces/[workspaceId]`, `/[locale]/platform-admin`) exposing high-level status, created date, plan/status metadata, integration readiness, and usage summaries (`isEstimate` badges on video bandwidth and outbox counts) without exposing student notes, grades, or guardian contact details.
  - Time-limited, reasoned, confirmation-gated break-glass support diagnostics (max 60 minutes, operational error codes only, visible to workspace owners via `/api/workspace/subscription`).
  - Centralized plan catalog (`pilot`, `standard`, `expanded` in `manual_pilot` mode without card billing or hardcoded retail prices), per-workspace quota overrides, and server-side write/limit enforcement (`assertWorkspaceWriteAllowedTx`) across students, groups, assistant invitations, files, videos, and online exams.
- `/healthz`, `/readyz`, and a bilingual status shell at `/ar` and `/en`.
- Route registry, message-catalogue parity check, Prisma import boundary, logical-CSS check, and
  Railway build/start/migration configuration.

**Not claimed by this foundation**

- A production email provider. Only the local console transport is implemented. Production refuses
  `EMAIL_TRANSPORT=none`, so a real deployment is blocked until a provider is selected by ADR and
  implemented. Verification and recovery work locally.
- Live Cloudflare Stream credentials in this local checkout (`VIDEO_PROVIDER_DRIVER` defaults to `none`; live Cloudflare API calls require `VIDEO_PROVIDER_ACCOUNT_ID`, `VIDEO_PROVIDER_API_TOKEN`, and `VIDEO_PROVIDER_SIGNING_SECRET` as documented in `docs/VIDEO_PROVIDER.md`).
- The generated isolation/permission matrices. The registry, the missing-route gate, hand-written
  authorization tests, and permission-filtered navigation exist; matrix generators remain
  unimplemented. Workspace switching is also not implemented, so invitation acceptance rejects an
  account that already has an active membership in another workspace.
- Online homework file uploads remain unimplemented; students can mark assigned homework as submitted and take assigned online exams from the student portal, and teachers can record/grade submissions.
- CI, staging deployment, worker process, provisioned production object storage, and observability
  integrations. The S3 adapter is implemented but needs configured private storage to serve durable
  production files.
- A public breached-password list integration. A local denylist and identity checks are implemented
  and documented as such; there is no live breach check.

---

## 2. What was produced

### 2.1 Specification

| Document | Lines | What it contains |
|---|---|---|
| `docs/PRODUCT_REQUIREMENTS.md` | 1,211 | Product definition, roles, tenancy, language/RTL/theming rules, design tokens, domain model, 45 requirement flows across P0–P3 with testable acceptance criteria, a 16-entry risk register (`R-01`–`R-16`), privacy register, integration dependencies, 13 hard prohibitions (`NF-1`–`NF-13`), and three appendices: the observed prototype inventory, 23 prototype defects not to carry forward (`DEF-01`–`DEF-23`), and the decision index (`D-01`–`D-18`). |
| `docs/USER_FLOWS.md` | 794 | 26 end-to-end flows (`F1`–`F26`) with preconditions, step-by-step behaviour, error and edge cases, audit events, and a closing invariants appendix. Every flow names the requirements it satisfies and the prototype defect it resolves. |
| `docs/RELEASE_PLAN.md` | 392 | Milestones M0–M3 with work packages, entry/exit criteria, scope-in and scope-out tables, a private-beta design, release gates, release cadence and hotfix policy, external dependencies with consequences, plan-level risks, a definition of done, and full requirement-to-milestone traceability. |
| `docs/OPEN_QUESTIONS_AND_ASSUMPTIONS.md` | 184 | 17 assumptions (`A-01`–`A-17`) and 19 open questions (`OQ-01`–`OQ-19`), each with options, a conservative default that applies until answered, the impact of a different answer, and a decision deadline; plus the resolution procedure and the external-dependency register. |

### 2.2 Architecture

| Document | Lines | What it contains |
|---|---|---|
| `docs/ARCHITECTURE.md` | 809 | Architecture drivers, the pinned stack, system context, environments, repository layout, module boundaries, the request lifecycle, the error envelope, tenancy and RLS, authorisation, derived state, the audit substrate, validation, the outbox and job runner, files, messaging, i18n/RTL/theming, observability, the testing strategy, migrations, the Railway deployment, performance budgets, the milestone mapping, architecture risks, open questions, and a glossary. |
| `docs/DATA_MODEL.md` | 663 | Design rules and naming conventions, the core M0–M2 ERD, the reserved P3 ERD, the table reference, the RLS mechanics, the derived-value SQL, the index strategy, retention, the migration sequence, integrity checks, and data-model risks. |
| `docs/SECURITY_AND_PRIVACY.md` | 408 | Security objectives, the threat model and boundary map, authentication and session policy, rate limits, authorisation and tenancy rules, input validation, file-handling security, secrets management, log and error redaction, audit-log security, the privacy register with retention and data-subject rights, minors' data, a requirement-to-control matrix, the security test plan, incident response, known security risks, and the security prohibitions. |
| `docs/INTEGRATIONS.md` | 318 | Integration principles, the package-versioning policy, the integration inventory, the adapter contract pattern, and a contract for each integration: PostgreSQL, object storage, the antivirus scanner, email, the WhatsApp deep link, QR and token services, Railway, observability, and deferred payments — plus the failure matrix and the integration security checklist. |
| `docs/decisions/README.md` | 65 | The ADR format, the index, the conventions, and the requirement traceability table. |
| `docs/decisions/0001`–`0016` | 1,200 | Sixteen architecture decisions with context, decision, consequences, rejected alternatives, and a revisit trigger. |
| `docs/STATUS.md` | this file | Current state and the ordered implementation plan. |
| `../AGENTS.md` | 193 | The durable instructions an agent or engineer follows when working in this repository. |
| `../.gitattributes` | 15 | The line-ending convention (LF for every text file) and the binary-file rules. |

Line counts are **non-blank** lines.

### 2.3 Foundation implementation

| Area | Delivered |
|---|---|
| Toolchain | Next.js 16.4.2, React 19.2.9, TypeScript 5.9.3, Tailwind 4.3.3, next-intl 4.14.9, Prisma 7.10.1, Better Auth 1.7.12, Vitest 5.0.5, ESLint 9.39.5, Prettier 3.9.10 |
| Database | Prisma schema, one committed migration, forced RLS, audit append-only grant, embedded PostgreSQL 17.9.0-beta.16 |
| Tenancy | `withScope()`, tenant-table registry, tenancy repository/service, permission evaluation, RLS integration tests |
| HTTP and auth | Request-id ULID, error envelope, `/healthz`, `/readyz`, Better Auth handler |
| UI shell | Arabic/English routing, RTL/LTR layout, design tokens, light/dark/system theme script, bilingual status page, and `< 480px` mobile single-column CSS grid card stacking |
| Local development | Guarded seed, idempotent seed data, standalone start script, Railway configuration |
| Quality gates | Unit tests, RLS/readiness integration tests, message parity, route registry, Prisma import boundary, logical-CSS and secret-name checks |

---

## 3. What the prototype actually contains

The reference file is `madar-teacher-prototype.html` at the repository root — **not**
`reference/Madar-Prototype.html`, which does not exist. It is a single-file React 18 (UMD) +
Babel-standalone prototype of 4,750 lines. All state lives in `localStorage` under `ots_state_v1`,
and the language under `ots_lang`. It was read read-only; it was not modified.

**Observed and carried into the specification (33 sections):** design tokens and themes, typography
and layout CSS, mock data generators, a ~330-key bilingual catalogue, a hand-rolled thin-stroke SVG icon set (`Icon` + `ICN`), UI
primitives, the data store, language context, navigation, sidebar and topbar, auth screens, dashboard,
students list and profile, groups, sessions, attendance, homework, quizzes, results, reports, student
attention, parents/WhatsApp, student portal, parent portal, settings, online exams, online meetings,
files, team and permissions, activity log, 10 modal dialogs, and the app shell.

**Confirmed absent from the prototype** — each is now a requirement, not a gap:

| Absent capability | Now specified as |
|---|---|
| QR attendance | `F-P2-05` (P2), with capture flow open as `OQ-05` |
| Payment tracking | `F-P2-04` (P2), manual ledger, no settlement claim |
| Video recording | `F-P3-02` (P3), external provider, gated on `OQ-08` |
| Multi-workspace tenancy | `F-P0-01` (P0) |
| Attendance correction history | `F-P1-07` (P1), immutable revisions |
| Enforced permissions | `F-P2-01` (P2), server-side, deny by default |
| Dark-mode control | `F-P0-04` (P0) |
| Homework submission capture | `F-P1-08` (P1), explicit records |
| Computed derived statistics | `F-P1-06`/`F-P1-12`/`F-P2-06` — never seeded |
| Working student edit | `F-P1-02` (P1) |
| Working file open | `F-P1-11` (P1) |
| Working report export | `F-P2-10` (P2), asynchronous |
| Real authentication | `F-P0-02` (P0) |
| URL routing / deep links | `F-P0-05` (P0) |
| Global search beyond students and groups | `F-P1-13` (P1), scope in `OQ-07` |

**23 prototype defects** were catalogued as `DEF-01`–`DEF-23` with their exact locations, including
the malformed `wa.me/2` WhatsApp link, `toISOString()` date shifts, the Sunday/Saturday week-start
contradiction, the two conflicting mobile media-query blocks, the non-persisting student edit, the
toast-only export, the `window.alert` file opener, randomly seeded `attendancePct`/`quizAvg`/
`homeworkCompletion`/`trend`, the decorative permission checkboxes, the never-set `data-theme`, the
hardcoded student in both portals, and the hardcoded English placeholder.

---

## 4. Scope decisions in force

| Tier | Contains | Deliberately excludes |
|---|---|---|
| **P0** (M0) | Tenancy, auth, i18n/RTL, theming, design system, data model, audit, privacy groundwork, infrastructure, in-app notifications | Any user-facing data entry beyond the workspace profile |
| **P1** (M1) | Dashboard, students, import, groups, schedule, sessions, manual attendance, corrections, homework, paper assessments, parent updates, files, basic reports, search, account, quality gate | Second human roles, portals, money, camera/video, outbound integrations other than auth email, exports |
| **P2** (M2) | Assistants with enforced permissions, parent portal, student portal, manual payments, QR attendance, progress and follow-up, notifications, multi-workspace, exports, import/restore, session corrections | Online exams, video, billing, admin console |
| **P3** (M3) | Online exams, recorded video via an external provider, admin console, subscription and billing, scale hardening, richer notifications, advanced reporting, duplicate detection | — |

**Never in scope, at any tier:** online live video meetings.

**Non-negotiable rule:** nothing may be faked. Thirteen prohibitions (`NF-1`–`NF-13`) cover fabricated
statistics, simulated delivery, mocked portals, mocked QR, mocked payments, mock video, fake audit
trails, UI-only authorisation, fake tenant isolation, fake theme/locale/direction, placeholder
buttons, seeded demo content in production, and silent data loss.

---

## 5. Verification performed

| Check | Result |
|---|---|
| Targeted changed-file lint | **Passed** — workspace administration, session, attendance, payment/report, and related tests are lint-clean |
| Full lint | **Passed** — `npm run lint` (`eslint .` + `npm run lint:rules`) |
| Typecheck | **Passed** — `npm run typecheck` |
| Unit and UI tests | **Passed** — 32 unit files / 176 tests and 1 UI file / 19 tests |
| Payment integration tests | **Passed** — 2 PostgreSQL tests cover payment-ledger tenant isolation, duplicate retries, refund limits, and separate corrections |
| Full integration suite | **Blocked by existing database/schema drift** — 12 failures across unrelated auth/workspace/search/group tests; the applied core migration is missing `teaching_session.room` although `migrate status` reports all tracked migrations applied |
| Prisma schema and tracked migration state | **Passed with caveat** — schema validates and `db:status` is current; `db:migrate` applies the two feature migrations but then prompts for another migration due existing local database/schema drift |
| Production build | **Passed** — `npm run build` |
| Production start | **Not re-verified** — build completes; deployment/runtime verification remains outside this feature validation |
| Bilingual shell | **Passed** — `/ar` rendered `lang="ar" dir="rtl"` and the Arabic title; `/en` rendered `lang="en" dir="ltr"` and the English title; `/` returned a 307 to `/ar` |
| Development seed | **Passed and idempotent** — 2 workspaces and 3 synthetic users; a second run succeeded |
| Arabic storage and search | **Passed** — PostgreSQL `server_encoding = UTF8`; Arabic names round-trip; `أَحْمَد` and `احمد` share a normalized search key; trigram GIN indexes exist |
| Local authentication | **Passed** — sign-in issued an `HttpOnly`, `SameSite=Lax` session cookie; sign-out deleted the server-side session; the JSON body contained no token |
| Sign-up and verification | **Passed** — sign-up created an unverified user with no session; the console verification link created a session and redirected to `/en/workspace/new` |
| Password recovery | **Passed** — reset link redirected to the reset screen, the reset server action changed the password, the token was single-use, and the new password signed in |
| Workspace creation (UI path) | **Passed** — the `/en/workspace/new` server action created the workspace atomically and redirected to `/en/app`; the settings API returned the new workspace |
| Theme persistence | **Passed** — a saved `dark` preference rendered `data-theme="dark"` and the matching pre-paint script; `system` resolves through `prefers-color-scheme`; the settings form applies the change immediately |
| Cross-tenant attempts (HTTP) | **Passed** — a `PATCH /api/workspace` body containing another workspace's id updated only the session's workspace; the other workspace was unchanged |
| Assistant authorization (HTTP) | **Passed** — the seeded assistant received `403` from the workspace API and the settings form showed the no-access state |
| Portal authorization (HTTP) | **Passed** — a linked student returned `200`; another student in the same workspace returned `403`; a random id returned `404`; the teacher app redirected to sign-in |
| Prototype read without modification | Confirmed — the file was read only and remains byte-identical |
| Document set complete | Confirmed — all specification and architecture documents exist under `docs/` |
| Stack versions | Pinned to `ARCHITECTURE.md` §3: Next.js 16.4.2, React 19.2.9, TypeScript 5.9.3, Node 24.x, Prisma 7.10.1, Better Auth 1.7.12, Tailwind 4.3.3, next-intl 4.14.9, Zod 4.6.7, Vitest 5.0.5 |
| Academic route, tenant-table, and catalogue rules | **Passed** — `npm run lint:rules` passes with full English/Arabic catalogue parity, tenant-table registry parity, and route-registry consistency |

**Not yet verified:** CI, a staging deploy, the generated isolation and permission matrices, and the
full M0 release gate. `npm audit` reports high-severity advisories in the dependency tree; they are
not yet triaged. A production email provider is not implemented, so verification and recovery are
local-only and production configuration intentionally refuses to start without one. The team-editing
and portal screens are P2 and are not present. These are open items, not foundation claims.

**Verification environment note:** this checkout is exercised under a Windows file sandbox that
denies the child-process pipes used by the default Vitest fork pool and the SWC native-cache
materialisation used by `next build`. `npm test`/`npm run test:integration` therefore run Vitest with
`--configLoader native` and `pool: "threads"`, and the production build was run once with the
sandbox's full-access approval. The application code does not depend on either workaround.

**Windows development note:** the embedded cluster must be initialised with `--encoding=UTF8`; the
Windows default code page (WIN1252) cannot store Arabic. `scripts/dev-db.mjs` pins this, and an
existing WIN1252 cluster must be recreated before seeding.

---

## 6. Implementation plan

The plan below is the working checklist. It is ordered so that the expensive, load-bearing work
happens first. **No item may be marked done unless the exit condition stated for it is met.**

### M0 — Foundation (P0)

**State legend:** ☑ exit condition met · ◐ partial, exit condition not met · ☐ not started. The
foundation task is complete as a slice; these rows track the full M0 milestone, not the foundation
task.

| # | Item | Exit condition | State |
|---|---|---|---|
| 0.1 | Confirm the data-model assumptions (`A-01`, `A-05`, `A-10`, `A-14`, `OQ-10`, `OQ-15`, `OQ-18`) | Each is confirmed or amended in `OPEN_QUESTIONS_AND_ASSUMPTIONS.md` | ☐ |
| 0.2 | Start the legal review of minors'-data handling | A named reviewer and a written first response | ☐ |
| 0.3 | Recruit the beta cohort (5–10 Egyptian private teachers) | Named participants with a consent form | ☐ |
| 0.4 | Secure an Arabic native-speaker reviewer | A named reviewer with an availability window | ☐ |
| 0.5 | Choose the email provider | An ADR entry under `docs/decisions/` and a working staging send | ☐ |
| 0.6 | Choose the logger and error-tracker SDKs | An ADR entry and a working staging pipeline | ☐ |
| 0.7 | Choose the E2E and accessibility test tooling | An ADR entry and a smoke test in CI | ☐ |
| 0.8 | Scaffold the repository: Next.js 16 App Router, TypeScript, ESLint, Tailwind v4, Vitest | `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` all pass on a clean checkout. `.gitattributes` already pins LF line endings and UTF-8; keep it | ☑ |
| 0.9 | Set up CI: lint, typecheck, test, build, dependency audit, secret scan, bundle secret scan | A failing check blocks the merge | ☐ |
| 0.10 | Stand up PostgreSQL, Prisma 7, the migration pipeline, and the seed | `prisma migrate deploy` succeeds in staging | ◐ local pipeline, migration, and seed pass; staging pending |
| 0.11 | Apply the full M0 schema with RLS policies (16-step migration, `DATA_MODEL.md` §10) | Every tenant table has an RLS policy and appears in `src/lib/db/tenant-tables.ts` | ◐ all thirteen tracked migrations, including homework, messaging, notifications, outbox, job, payment, and report tables, are applied locally; clean-schema/staging gate remains |
| 0.12 | Implement the tenancy substrate: session-derived scope, repository scoping, the scoped-transaction helper | A query outside a scoped transaction returns zero rows | ☑ integration test proves it; `withUserScope` and safe RLS helper added |
| 0.13 | Build the route registry and the generated isolation and permission matrices | `F-P0-01` AC-6 passes: a route missing from the registry fails CI, and the matrices run against a real database | ◐ registry, missing-route gate, and hand-written isolation/authorization tests exist; generators pending |
| 0.14 | Implement authentication: Better Auth, email verification, session policy, rate limits, sign-out, reset | `F-P0-02` AC-1…AC-10 all pass | ◐ all flows work and are tested; a live breached-password list and a distinct unverified sign-in state remain |
| 0.15 | Implement workspace creation and the workspace profile | `F-P0-06` passes | ☑ atomic creation, settings, thresholds, audit, and UI tested |
| 0.16 | Implement the audit substrate and the notification substrate | The fault-injection test proves atomicity (`NF-7`); `F-P0-10` passes | ◐ audit writer, redaction, atomicity, append-only grants, and auth events are done; notification substrate pending |
| 0.17 | Implement i18n: locale routing, the bilingual catalogue, RTL layout, theming | `F-P0-03` and `F-P0-04` pass; a missing translation fails the build | ◐ routing, RTL shell, tokens, and parity check exist; full catalogue pending |
| 0.18 | Build the design system primitives on Radix | `F-P0-05` passes; keyboard and screen-reader checks pass on every primitive | ☑ |
| 0.19 | Implement the privacy groundwork: data minimisation, redaction, retention configuration, the export schema | `F-P0-08` AC-1 (minimisation) and AC-6 (no PII in logs) pass; AC-2 (export) and AC-3 (deletion) are scheduled for M1/M2 | ☐ |
| 0.20 | Deploy to Railway: web, worker, database, secrets, health checks, staging and preview environments | A staging deploy passes the health check and the production-config guard | ◐ `railway.json` and standalone start exist; no staging deploy |
| 0.21 | Run the M0 release gate (§3 of `RELEASE_PLAN.md`) | Every gate item is checked with evidence | ☐ |

### M1 — Core product (P1)

| # | Item | Exit condition | State |
|---|---|---|---|
| 1.1 | Dashboard | `F-P1-01` passes; every number on it is computed from records | ☐ |
| 1.2 | Students: directory, create, edit, archive | `F-P1-02` passes | ◐ directory, CRUD, archive, duplicate warning, notes, computed metrics, and top-bar search pass; the session/homework-backed profile tabs depend on 1.5–1.9 |
| 1.3 | CSV import of students | `F-P1-03` passes, including the preview and the partial-failure report | ☑ preview/commit, group mapping, UTF-8/BOM/Windows-1256, 5,000-row limit, duplicate-in-file, name-only acknowledgment, per-row and batch audit, downloadable error report, Arabic round-trip test |
| 1.4 | Groups and roster | `F-P1-04` passes | ◐ groups CRUD/archive, capacity, roster, multi-group enrollment, and transfer history pass; one-off session creation and generated sessions land with 1.5 |
| 1.5 | Schedule and sessions | `F-P1-05` passes, including the explicit workspace timezone | ☐ |
| 1.6 | Sessions and manual attendance | `F-P1-06` passes, including the single-transaction requirement (AC-6) | ☐ |
| 1.7 | Attendance corrections with immutable revisions | `F-P1-07` passes | ☐ |
| 1.8 | Homework | `F-P1-08` implemented for group/selected-student assignment, permitted resources, manual status, feedback, and optional grade; tests and gates pending | In progress |
| 1.9 | Paper assessments and grade entry | `F-P1-09` implemented with result statuses, normalized averages, extra-credit allowance, and audited corrections; tests and gates pending | In progress |
| 1.10 | Parent updates via the WhatsApp deep link | `F-P1-10` passes; the UI never claims "sent" | ☐ |
| 1.11 | Files: private storage, signed URLs, scan pipeline | `F-P1-11` implemented and focused tests pass; full project gates remain blocked by unrelated baseline failures | ◐ |
| 1.12 | Basic reports | `F-P1-12` passes | ☐ |
| 1.13 | Scoped search | `F-P1-13` passes; the search set is students and groups (`OQ-07` default (b)) | ☑ `/api/search`, five results per type, permission-filtered, workspace-scoped, keyboard and mobile UI; normalization mirrors the existing derived Arabic keys, which fold more variants than the P1 minimum and remain governed by `OQ-07` |
| 1.14 | Account, profile, sign-out, and the workspace deletion request | `F-P1-14` passes; `F-P0-08` AC-3 and AC-4 (deletion) pass | ☐ |
| 1.15 | Accessibility, performance, and responsive quality gate | `F-P1-15` passes; both locales, both directions, both themes, 320 px | ☐ |
| 1.16 | Run the M1 release gate | Every gate item is checked with evidence | ☐ |

### M2 — Roles and portals (P2)

| # | Item | Exit condition | State |
|---|---|---|---|
| 2.1 | Assistants with server-enforced permissions | `F-P2-01` passes; the generated permission matrix covers every role | ◐ owner administration UI, safe invitations, granular server checks, audit history, direct-request authorization tests, and permission-filtered navigation implemented; generated matrix pending |
| 2.2 | Parent portal with scoped access | `F-P2-02` passes; a parent can view only explicitly linked children, permitted attendance, locked grades, homework, clean resources, approved payment/balance summaries, schedule changes, and notifications, and cannot reach another child or private notes | ☑ |
| 2.3 | Student portal and enrolment tokens | `F-P2-03` passes; invitation tokens are hashed, single-use, email-verified, expiry-checked, and revocable; student portal shows only own upcoming sessions, permitted attendance, homework, locked grades, and shared clean materials | ☑ |
| 2.4 | Manual payments with a ledger and no settlement claim | `F-P2-04` passes for the current EGP/monthly-fee scope; parent payment views remain disabled | ☑ |
| 2.5 | QR attendance | `F-P2-05` passes | ☐ |
| 2.6 | Academic progress and follow-up | Source-backed flags and staff follow-up tasks are implemented; full progress series and configurable non-attendance rules remain | Partial |
| 2.7 | Notifications expansion | `F-P2-07` passes; the email digest is opt-in and contains no note content | ☐ |
| 2.8 | Multi-workspace switching | `F-P2-08` passes; the current workspace is explicit in the sidebar | ☐ |
| 2.9 | Teacher-side preview of the portals | `F-P2-09` passes; the preview is labelled as a preview and is not a portal | ☐ |
| 2.10 | Reports and export | Filtered tenant-scoped asynchronous CSV for attendance, enrollment, academics, homework, payments, and balances passes; XLSX/PDF from the broader product requirement remain unimplemented | ◐ |
| 2.11 | Data import/export and backup (server-side) | `F-P2-11` passes; the export includes the audit log and a schema version | ☐ |
| 2.12 | Session correction workflow | `F-P2-12` passes; a correction requires a reason and is audited | ☐ |
| 2.13 | Publish the privacy notice (Arabic and English) | Signed off by the legal reviewer (`F-P0-08` AC-7) | ☐ |
| 2.14 | External penetration test | A third-party report with no open critical or high findings | ☐ |
| 2.15 | Run the M2 release gate | Every gate item is checked with evidence | ☐ |

### M3 — Advanced (P3)

| # | Item | Exit condition | State |
|---|---|---|---|
| 3.1 | Online exams | `F-P3-01` passes | ☑ |
| 3.2 | Recorded video through an external provider | `F-P3-02` passes, gated on `OQ-08` | ☑ |
| 3.3 | Admin console: metadata only, break-glass access | `F-P3-03` passes; no bulk tenant export exists | ☑ |
| 3.4 | Subscription and billing | `F-P3-04` passes (manual pilot plans & server-enforced limits; no card data is stored or charged) | ☑ |
| 3.5 | Scale, performance, and reliability hardening | `F-P3-05` passes; the budgets in `ARCHITECTURE.md` §21 are met with evidence | ☐ |
| 3.6 | Rich notification channels | `F-P3-06` passes; every channel states only what it can observe | ☐ |
| 3.7 | Advanced reporting and academic-year handling | `F-P3-07` passes | ☐ |
| 3.8 | Duplicate-student detection and roster hygiene | `F-P3-08` passes; a merge is irreversible only by re-creating the record | ☐ |
| 3.9 | Run the M3 release gate | Every gate item is checked with evidence | ☐ |

---

## 7. Engineering rules that carry from here

- No screen ships without its empty, loading, and error states.
- No statistic is displayed that is not computed from records.
- Every mutating path writes an audit event in the same transaction.
- Every tenant-scoped query is covered by an isolation test, and the coverage is generated rather
  than hand-maintained.
- Arabic is the default; English is not optional. Both directions are checked on every screen.
- No outbound network call happens inside a database transaction.
- No third-party credential, session token, or personal datum reaches a log, an analytics event, or
  a client bundle.

---

## 8. Document map

| I want to… | Read |
|---|---|
| Know what a feature must do | `PRODUCT_REQUIREMENTS.md` §5–§8, then the `F-nn` flow in `USER_FLOWS.md` |
| Know exactly what happens on a screen | `USER_FLOWS.md` (steps, errors, audit events) |
| Know how the system is built | `ARCHITECTURE.md`, then `DATA_MODEL.md` |
| Know what a table and an index are for | `DATA_MODEL.md` §5 and §8 |
| Know the security posture and the controls | `SECURITY_AND_PRIVACY.md` |
| Know how an external system is called | `INTEGRATIONS.md` |
| Know why a technology was chosen | `decisions/README.md` and the relevant ADR |
| Know what ships when | `RELEASE_PLAN.md` §2–§5, then §12 traceability |
| Know what is still unknown | `OPEN_QUESTIONS_AND_ASSUMPTIONS.md` §3–§4 |
| Know what is forbidden | `PRODUCT_REQUIREMENTS.md` §12 (`NF-1`–`NF-13`) |
| Know what the prototype already does, and what is wrong with it | `PRODUCT_REQUIREMENTS.md` §13–§14 |
| Know the current state and the next task | `STATUS.md` (this file) |
| Know the rules for working in this repository | `../AGENTS.md` |
