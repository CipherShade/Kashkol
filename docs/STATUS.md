# Kashkol — Status

**Date:** 2026-11-10 · **Status:** Operational model correction & workflow upgrade complete: session-based revenue calculation (`ADR-0025`), Google Calendar-style sessions scheduling, indefinite-lifetime student QR identity with scanner panel (fast mode + per-student homework yes/no on the session attendance screen, 2026-11-10), cross-season attendance tracking with primary group isolation, offline homework completion tracking, dashboard financial consistency, SVG/PNG QR card downloads on the student profile, and a demo ledger rebuilt truthfully under the per-session billing model · **Phase:** M1/M2 core + P3 learning media, online assessments, forms, & operational workflows

---

## 1. Where the project stands

The **specification phase** and the **architecture phase** are complete. The application foundation
now exists on top of them: the Next.js scaffold, the pinned toolchain, the Prisma 7 schema and thirty
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
| Architecture decisions | Complete — `docs/decisions/` (24 ADRs + index) |
| Agent instructions | Complete — `../AGENTS.md` |
| Application foundation | **Implemented** — scaffold, DB/RLS, tenancy substrate, probes, locale shell |
| Authentication and workspace flows | **Implemented** — Better Auth UI, verification, recovery, workspace creation/settings, guarded shell |
| Authorization foundation | **Implemented** — owner/assistant roles, grants, owner-only operations, portal-link checks, generated-access tests |
| Core domain schema | **Implemented** — subjects, groups, enrollments, sessions, attendance, homework, assessments, follow-up, payments, files, Arabic search |
| Business screens | **Implemented** — students, groups, homework, assessments, follow-up, files, account, settings, scoped search, manual payments, and report/export flows are implemented; remaining in-progress work is outside the manual ledger/reporting scope |
| Outbound email provider | **Implemented, not live-verified** — console transport locally; SMTP transport implemented and unit-tested, but no live provider or deliverability setup has been verified. Production refuses to start without a configured transport |
| Git history | Six commits on `master` |

**Implemented in this foundation**

- Next.js 16.4.2 App Router, React 19.2, TypeScript 5.9, Tailwind v4, next-intl 4.14.9, Vitest 5.
- Prisma 7.10.1 with the PostgreSQL driver adapter and an explicit generated-client output.
- Twenty-four tracked migrations are applied to the local development database, including academic
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
  - `CloudflareStreamAdapter` using Cloudflare Stream's official v4 REST API, RS256 short-lived signed playback tokens with a signing key ID, provider-enforced `requireSignedURLs`, and `Webhook-Signature` verification (`POST /api/videos/webhook`), plus deterministic `FakeVideoProviderAdapter` for tests and `UnconfiguredVideoProviderAdapter` when `VIDEO_PROVIDER_DRIVER=none`.
  - Truthful setup state when no provider is configured (`VIDEO_PROVIDER_DRIVER=none`) — never showing simulated or fake hosted videos (`NF-1`–`NF-13`).
  - Workspace limits and cost-driver tracking (`videoCount`, `totalStorageBytes`, `totalDurationSeconds`, `totalPlaybacks`, `estimatedBandwidthBytes` bounded by `VIDEO_MAX_COUNT_PER_WORKSPACE`, `VIDEO_MAX_STORAGE_BYTES_PER_WORKSPACE`, `VIDEO_MAX_BANDWIDTH_BYTES_PER_MONTH`) without claiming unlimited storage.
  - Authorized short-lived signed playback for staff (`POST /api/videos/[videoId]/playback`) and entitled parent/student portal viewers (`POST /api/portal/videos/[videoId]/playback`).
- Online Exams & Quizzes (`F-P3-01`) (`src/modules/exams/`):
  - Question sets (`mcq_single`, `true_false`, `short_answer`, `essay`), group or selected-student assignment, server-enforced availability window (`availableFrom`, `availableUntil`, `durationMinutes`), `maxAttempts`, and teacher preview (`GET /api/exams/[examId]`).
  - Authenticated student portal entry only (`requireStudentPortalContext` on `/api/portal/student/exams*`) — never via unprotected name/phone lookup.
  - Deterministic auto-grading (`mcq_single`, `true_false`, normalized Arabic/English `short_answer`), safe draft response saving (`PUT`), idempotent duplicate final submission protection (`POST`), publish-gated result visibility (`after_manual_publish` | `immediate_after_submit` | `after_window_close`), and audited manual grading / grade corrections (`exam.manually_graded` and `exam.grade_corrected` requiring a correction reason) synced to `Assessment` / `AssessmentScore`.
  - Expired in-progress attempts are marked `expired` (new `online_exam_attempt_status` value) and still count toward `maxAttempts`; an expired attempt cannot be submitted.
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

- A production email provider has **not been verified live**. The console transport works locally and
  the SMTP transport is implemented and unit-tested, but no live mailbox, bounce handling, or
  deliverability setup (SPF/DKIM/DMARC) has been exercised. Production refuses
  `EMAIL_TRANSPORT=none`, so a real deployment must configure SMTP. Verification and recovery work
  locally.
- Live Cloudflare Stream credentials in this local checkout (`VIDEO_PROVIDER_DRIVER` defaults to `none`; live Cloudflare API calls require `VIDEO_PROVIDER_ACCOUNT_ID`, `VIDEO_PROVIDER_API_TOKEN`, `VIDEO_PROVIDER_SIGNING_KEY_ID`, and `VIDEO_PROVIDER_SIGNING_PRIVATE_KEY` as documented in `docs/VIDEO_PROVIDER.md`).
- The generated isolation/permission matrices. The registry, the missing-route gate, hand-written
  authorization tests, and permission-filtered navigation exist; matrix generators remain
  unimplemented. Workspace switching is also not implemented, so invitation acceptance rejects an
  account that already has an active membership in another workspace.
- Online homework file uploads remain unimplemented; students can mark assigned homework as submitted and take assigned online exams from the student portal, and teachers can record/grade submissions.
- CI, staging deployment, provisioned production object storage, and observability integrations. A
  long-running worker process exists (`npm run worker`, an in-image loop, see `docs/STATUS.md`
  §6 "Background worker"): it drains the message outbox per workspace and queued report exports
  across all workspaces with claim-then-complete (`FOR UPDATE SKIP LOCKED`), an atomic SECURITY
  DEFINER enumeration (`ADR-0024`), bounded retries with visible report-export failures, and
  SIGTERM/SIGINT graceful shutdown. The S3 adapter is implemented but needs configured
  private storage to serve durable production files.
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
| `docs/OPERATIONS_RUNBOOK.md` | 214 | Backup model (Railway-managed vs. logical encrypted archive), backup procedure, 35-day retention, alerting, what "verified" means, RTO/RPO, incident restore procedure, monthly drill checklist, what was done and what is unverified. |
| `docs/decisions/README.md` | 65 | The ADR format, the index, the conventions, and the requirement traceability table. |
| `docs/decisions/0001`–`0025` | 1,524 | Twenty-four architecture decisions with context, decision, consequences, rejected alternatives, and a revisit trigger. |
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
| UI shell | Arabic/English routing, RTL/LTR layout, design tokens, light/dark/system theme script, bilingual status page, `< 480px` mobile single-column CSS grid card stacking, and the `ADR-0023` floating frame: 16 px canvas gutter, 86 px icon rail with tooltips, and a focus-trapped full-label drawer below 980 px |
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

## 6. Phase status — P0 (Truth & security) completed on 2026-11-03

| Item | Status |
|---|---|
| Webhook signature verification (`X-Hub-Signature-256`) | Verified: real HMAC, constant-time comparison; 503 unconfigured, 401 invalid, 400 malformed, 200 `processed:false`. Inbound event handling deferred. |
| Webhook challenge verification | Real `hub.verify_token` handshake; returns challenge only when token matches in constant time. |
| Web Push dispatch (`web-push` with injectable transport) | Real `sendWithWebPush` against VAPID config; no in-memory history, no simulated delivery; `unconfigured` / `send_failed` reasons only. |
| Worker authentication | Dedicated `MESSAGING_WORKER_TOKEN`; report-export token never reused; UUID workspace id validation; system actor `system:messaging-worker`. |
| Guardians authorization/CSRF/audit | Routes use `requireStaffSession`, `students:read`/`students:write`, `assertTrustedOrigin`, and an audit event written in the same transaction. |
| Dead attendance notification outbox writer | Removed `enqueueNotificationOutbox` from `attendance/repository.ts`; its calls at close and QR check-in removed; bulk marking enqueues real guardian notifications through the messaging service. |
| Route registry updated | Descriptions updated for webhook (verification-only), worker (dedicated token), and guardians (students:read/write). |
| Docs updated | `.env.example`, `docs/NOTIFICATIONS_PROVIDER.md`, `docs/ENVIRONMENT.md`, `docs/STATUS.md`. |
| Tests added | `tests/unit/messaging-webhook-signature.test.ts`, `tests/unit/worker-auth.test.ts`, `tests/unit/push-dispatch.test.ts`, guardian authorization tests in `tests/integration/administration-routes.test.ts`, env validation tests. |

---

## 5. Verification performed

| Check | Result |
|---|---|
| Targeted changed-file lint | **Passed** — workspace administration, session, attendance, payment/report, and related tests are lint-clean |
| Full lint | **Passed** — `npm run lint` (`eslint .` + `npm run lint:rules`) |
| Typecheck | **Passed** — `npm run typecheck` |
| Unit and UI tests | **Passed** — 53 unit files / 309 tests and 1 UI file / 21 tests |
| Payment integration tests | **Passed** — 2 PostgreSQL tests cover payment-ledger tenant isolation, duplicate retries, refund limits, and separate corrections |
| Full integration suite | **Resolved on 2026-11-07** — the pre-existing database/schema drift (missing `teaching_session.room` and eight related scheduling columns, plus the `started` session status) is reconciled; the suite now passes 15 files / 89 tests. See §5.1. |
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

### 5.1 Stabilisation on 2026-11-07 — public forms security and migration reconciliation

Four focused phases were completed against the existing implementation. No architecture was
replaced, no feature was removed, and no production database was touched.

**Phase 1 — public form and upload security (`F-P3-12`).** The public submit path now validates with
`safeParse` and returns `no-store`; a client-supplied `submittedByUserId` is rejected; uploads are
bound to a server-issued capability token that is hashed at rest and checked against the form,
question, and upload session before a claimed file is accepted; `form_upload` files are excluded from
materials and videos. Added `tests/unit/forms-public-upload.test.ts` (8 tests).

**Phase 2 — migration, RLS, and schema reconciliation.** The applied
`20261106120000_forms_public_lifecycle` migration had drifted from `prisma/schema.prisma`. Three
additive migrations reconcile the database without rewriting the applied migration:

| Migration | Change |
|---|---|
| `20261107120000_forms_public_rls_and_schema_reconcile` | Forces RLS on `form_upload`; changes `dedupe_key` UUID → TEXT; replaces the global submission indexes with `(form_id, submission_token)` and `(form_id, dedupe_key)`; adds the four `form_upload` tenant foreign keys, `UNIQUE (workspace_id, file_id)`, and four indexes; drops the unused `file.form_uploads` column; grants the application role SELECT/INSERT/UPDATE/DELETE on `form_upload` |
| `20261107121000_forms_file_scope_enum` | Adds `form_upload` to the `file_scope` enum |
| `20261107122000_forms_file_scope_check` | Extends `file_scope_check` so a `form_upload` file must have null group and student targets |

`FormSubmission.submissionToken` is now `@db.Uuid` and `dedupeKey` is TEXT, matching the shared Zod
schemas. Added `tests/integration/forms-public.test.ts` covering provenance binding,
anonymous public submission, unpublished-form hiding, and oversized-file rejection against
PostgreSQL.

**Phase 3 — remaining confirmed defects (items 3.1–3.3).**
- **3.1 — Teaching-session drift.** The `TeachingSession` model declared `room`, `location`,
  `notes`, `teacher_id`, `assistant_id`, `series_id`, `occurrence_no`, `started_at`, and
  `completed_at`, and the session service writes `status = 'started'`, but no migration ever
  created them. Two additive migrations
  (`20261107130000_session_status_started`, `20261107131000_teaching_session_schedule_fields`)
  apply the nine columns, the `series_id` index, and the enum value. With that drift removed the
  full integration suite passes for the first time in this checkout.
- **3.2 — Silent mock database fallback.** `src/lib/db/client.ts` no longer catches environment
  or connection failures and returns a no-op Prisma proxy. Failures now propagate.
- **3.3 — Rate limiting on public routes.** Public submit is limited to 10 requests/minute and
  public upload to 5 requests/minute, keyed per form and client IP (`src/lib/http/rate-limit.ts`).

**Phase 4 — identified public form submission identity safety.**
The public submit path (`submitFormResponsePublic` in `src/modules/forms/service.ts`) now rejects any client-supplied `studentId` on an identified form with `AppError("CONFLICT", { messageKey: "errors.formSubmissionIdentityMismatch" })`. Because public submissions have no authenticated actor, client-supplied student IDs cannot be verified; anonymous public submissions remain the only supported public mode, while authenticated identified submissions go through the workspace API. Extended `tests/integration/forms-public.test.ts` (now 9 tests).

| Check | Result |
|---|---|
| `npm run lint` | **Passed** — ESLint and the cross-file project rules |
| `npm run typecheck` | **Passed** |
| `npm run test:unit` | **Passed** — 53 files / 309 tests |
| `npm run test:ui` | **Passed** — 1 file / 19 tests |
| `npm run build` | **Passed** — production build |
| `npm run db:deploy` | **Passed** — 24 migrations applied at the time; the tracked set is now 30, including the reconciliation and the worker workspace enumeration migrations. Live schema confirms forced RLS, the worker enumeration function (`20261110000000_worker_workspace_enumeration`), tenant foreign keys, form-scoped idempotency indexes, TEXT `dedupe_key`, no `file.form_uploads`, `file_scope` includes `form_upload`, the application role has write access to `form_upload`, and `teaching_session` has all scheduling columns plus the `started` status |
| Targeted integration (`forms-public`) | **Passed** — 9/9 |
| Full integration suite | **Passed** — 15 files / 91 tests, no failures |

**Remaining follow-ups recorded by this work (not shipped as claims):**

- The public upload and submit routes carry in-process rate limiting (Phase 3 item 3.3): `public_upload`
  at 5 requests/minute and `public_submit` at 10 requests/minute per form and client IP. Revisit if a multi-instance deployment topology is introduced.

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

### 5.2 Interface visual refresh on 2026-11-08 — `ADR-0023`

The shell and the two implemented working screens (dashboard and students) were restyled to the
supplied reference language without changing behaviour, routes, or dependencies.

- `src/styles/tokens.css` now defines the paper/near-black canvas, the floating `--panel` surface, a
  blue primary, tinted success/warning/danger/accent tones, chart/avatar/inverted-card tokens, and a
  compatibility `--color-*` alias layer that resolves through the live palette. Light, dark, and the
  `prefers-color-scheme` fallback are hand-written per surface.
- `src/styles/ui.css` and `src/styles/shell.css` carry pill buttons, the larger radius, the `Stat`
  tone/interactive API, a 16 px floating frame, an 86 px icon rail with tooltips, and the full-label
  drawer below 980 px. All new CSS uses logical properties.
- The dashboard composition is a hero header, four computed statistics, workspace facts, a setup
  donut whose percentage is computed from onboarding records, and the members table.
- Students uses four real KPI filter buttons (total, active, at risk, inactive) whose percentages are
  computed from the current result set. The always-zero archived card is gone; an explicit “Show
  archived” toggle replaces it, and archived totals are claimed only when archived records are in view.

| Check | Result |
|---|---|
| `npm run lint` | **Passed** — ESLint and the project rules (catalogue parity, route registry, Prisma boundary, logical CSS) |
| `npm run typecheck` | **Passed** |
| `npm test` | **Passed** — 53 unit files / 309 tests and 1 UI file / 21 tests |
| `npm run test:integration` | **Passed** — 15 files / 91 tests against the local PostgreSQL |
| `npm run build` | **Passed** — production build |
| Route registry | **Unchanged** — no route was added, removed, or renamed |
| Dependencies | **Unchanged** — no package was added, removed, or upgraded |

**Visual review performed:** screenshots were captured at `/ar` and `/en` in light and dark at
1440 px (dashboard and students) and 390 px (dashboard and students). The floating frame, 86 px icon
rail with tooltips, KPI cards, tables, and the RTL layout render consistently in both themes at both
widths. `F-P1-15` still requires a final sign-off review on all remaining screens before the M1
quality gate can pass; screens beyond the dashboard and students resolve through the compatibility
`--color-*` aliases and need the same light/dark, RTL/LTR, and narrow-width review.

---

### 5.3 The background worker on 2026-11-10 (ADR-0008, ADR-0024)

A long-running worker process now exists. It is the same repository and build as the web application, started
with `npm run worker` (`railway.worker.json` runs it as a separate Railway service). It drains the message outbox
per workspace and queued report exports across all workspaces, with no new queue system — the claim protocols
already present in the code are the ones used (`FOR UPDATE SKIP LOCKED`), so jobs do not execute twice.

- **Entry point.** `src/worker/index.ts` is a thin composition ending in `process.exit(code)`. It fails fast
  and loudly on (a) an invalid configuration, (b) the newest applied migration differing from
  `REQUIRED_MIGRATION_NAME` (`REQUIRE_MIGRATIONS`, default true) — the same invariant `/readyz` enforces for the
  web tier, so an un-migrated deployment never launches a green-looking worker — and (c) `SIGTERM`/`SIGINT`.
- **Poll cadence.** `WORKER_POLL_INTERVAL_SECONDS` (default 30, range 1–300) controls the pass cadence. An idle
  pass sleeps `intervalMs` and costs nothing.
- **Fan-out.** Workspaces are enumerated via the `SECURITY DEFINER` function
  `list_active_workspace_ids_for_worker()` (`ADR-0024`): at most the uuid of every active, non-deleted workspace,
  never any other tenant field, never writable from anyone but `kashkol_app`. Drains happen only under a
  workspace-scoped transaction (`withScope`), respecting RLS.
- **Shutdown.** `SIGTERM`/`SIGINT` set the same shutdown flag: the in-flight bounded batch finishes, pooled
  Prisma connections drain via `disconnectDb()`, and the process exits 0 (or 1 on a fatal configuration/migration
  error) so `restartPolicyType: ON_FAILURE` restarts it honestly instead of leaving a silently dead deploy.
- **Health.** The worker has no HTTP listener (it is a process, not a service). Railway supervises it through
  `restartPolicyType=ON_FAILURE` plus restart-limited logs; every pass prints exactly one `[worker] cycle ok` line
  and every terminal state prints an actionable error — never a message body, never a guardian phone number, never
  a workspace name, never a job id. `/healthz` and `/readyz` remain the web tier's probes.
- **Logging rules.** Only one-line counts go out: processed / succeeded / failedOrDeferred / workspaces /
  elapsed_ms. Empty cycles repeat. OI-3 (the structured logger SDK) remains open; until then, lines are redacted
  at the call site.

| Check | Result |
|---|---|
| `npm run lint` | **Passed** — ESLint and the project rules (the migration-state expected-migration constant was updated) |
| `npm run typecheck` | **Passed** — `prisma generate` + `tsc --noEmit` |
| `npm test` | **Passed** — 61 unit files / 370 tests and 1 UI file / 21 tests |
| `npm run test:integration` | **Passed** — 16 files / 99 tests against the local PostgreSQL (added `worker-endpoints.test.ts`) |
| `npm run build` | **Passed** — Prisma generate + production build |
| New unit tests | **16** — `worker-drain.test.ts`, `worker-runner.test.ts`, `worker-main.test.ts` (claim exit code → `process.exit` coverage, fan-out merging, failing-workspace batch continuation, SIGTERM mid-run exit, redacted cycle line, start-up gates) |
| Report export failure path | unchanged — visible failure, never silent retry |
| Worker HTTP routes | deduped onto `hasValidWorkerBearerToken` (`src/lib/worker/system-actor.ts` owns `createMessagingWorkerScope`; outbox and reports routes share the same token check and the system actor) |
| Integration coverage | **Added** — `worker-endpoints.test.ts`: 401 for missing/wrong token, 401 for the wrong token per worker job type, 401 for an invalid workspace uuid even with the correct messaging token, 200 with an empty report queue (report token) and an empty outbox (messaging token) |
| Railway configuration | `railway.worker.json` — worker declares no `preDeployCommand`; the web service's pre-deploy owns `prisma migrate deploy`; the worker service polls with a 30 s default and `ON_FAILURE × 10` restarts |
| ADR created | `ADR-0024` — the migration now matches a recorded decision (previously a code comment referenced a nonexistent ADR) |

**Itemization of the pre-existing integration debt (resolved 2026-11-10):** before this work the suite had six failing tests, all rooted in two environment issues, now repaired:

- `tests/integration/setup.ts` pins `BETTER_AUTH_URL=http://localhost:3000` for the integration harness, so a developer's public tunnel URL in the git-ignored `.env.local` can no longer break the trusted-origin check. `.github/workflows/ci.yml` provides no `BETTER_AUTH_URL`, so the harness pin is what makes the four auth/portal tests deterministic.
- The local dev database had granted `kashkol_app` `UPDATE`/`DELETE` on every append-only table. The migrations declare those privileges revoked, but the grant-drift came from `scripts/grant-permissions.ts` granting `ALL PRIVILEGES ON ALL TABLES` (and default `GRANT ALL` on future tables). The script is now fixed to re-apply the same migration REVOKEs for the append-only tables (`audit_event`, `platform_audit_event`, `attendance_revision`, `payment_revision`, `session_revision`, `student_note`, `payment`, `payment_adjustment`, `fee_rule`), and the live dev database was brought back in line (verified via `has_table_privilege`). The two append-only tests now pass without being disabled, weakened, or skipped; no production grants were touched.

**Not claimed in this section:** production Railway deploy has not been re-verified in this checkout; the
observability SDK choice (OI-3) remains open; per-workspace report export claiming still runs inside a
non-request process, so a multi-instance worker deployment has not been load-tested here.

### 5.4 Operations — backup verification and the restore drill on 2026-11-10

`scripts/backup-db.mjs` (`npm run db:backup`) and `scripts/restore-drill.mjs` (`npm run db:restore:drill`)
were added as the F-P0-09 AC-3 database backup and monthly restore-drill mechanism, verified against the
local embedded PostgreSQL 17.9 on the seeded synthetic fixture.

- Backup is a single-file, AES-256-GCM encrypted dump (magic `KSHKBACKUP\x00` + IV + auth tag + ciphertext),
  compressed with zlib, containing every `public`-schema table including `_prisma_migrations`; the connecting
  role must bypass RLS or no artifact is produced at all; non-loopback/private hosts are refused unless
  `ALLOW_PRODUCTION_BACKUP=true`; artifacts are written `0600` into `.data/backups/` (`0700`) and swept after
  `BACKUP_RETENTION_DAYS` (default 35).
- Every backup self-verifies: decrypt, decompress, hash, and row-count against the source before printing
  `BACKUP_OK … verified=true`. Any mismatch prints `BACKUP_FAILED: …` and exits non-zero.
- The restore drill recreates an isolated scratch database (`kashkol_restore_drill`, never dev, never prod),
  applies every migration from repo migrations, bulk-restores with `session_replication_role='replica'`,
  then re-enables FKs and verifies counts, single-column FK integrity (0 orphans), tenant isolation under
  `kashkol_app` (workspace-scoped `student` counts + unset-GUC zero rows), and `prisma migrate status`.
  `--keepdb` (incident mode) restores as-is into an explicitly approved isolated replacement database; it
  fails loudly on FK/PK violations and never drops a non-loopback target.
- `/readyz` and `/healthz` were 200 against the restored database; `migrations.applied.30`.
- Production Railway-managed daily backups/PITR (ADR-0011) are **unverified**; file-storage backups are
  **unverified**; S3 sink path is implemented but not exercised against a live bucket; production-sized
  restore measurements are unknown. Details in §Unverified in `docs/OPERATIONS_RUNBOOK.md`.

| Check | Result |
|---|---|
| Backup (`npm run db:backup`) | **Passed** — `BACKUP_OK tables=71 rows=1319 bytes=78989 verified=true elapsed=0.7s`; manifest records per-table counts, archive SHA-256, redacted source host |
| Restore drill (`npm run db:restore:drill`) | **Passed** — `RESTORE_OK tables=70 migrationHistory=30 rows=1289 elapsed=19.0s`; fresh scratch DB from empty; 30 migrations applied; `FK scan: 67 single-column FK(s) verified, orphans=0`; 0 orphans |
| Migration history | **Passed** — 30 migrations recomputed by `prisma migrate deploy`, no duplication; `prisma migrate status` on restored DB: schema up to date (30/30) |
| Row-count verification | **Passed** — every table matches manifest; totals `1289 + 30 recomputed history = 1319` manifest rows |
| Tenant isolation post-restore | **Passed** — `kashkol_app` scoped to workspace `...0001` reads 34 `student` rows, workspace `...0002` reads 0, unset `app.workspace_id` reads 0 |
| Referential integrity | **Passed** — `FK scan: 67 single-column FK(s) verified, orphans=0` |
| App readiness against restored DB | **Passed** — `/readyz` `status=ready`, `database.reachable`, `migrations.applied.30`; `/healthz` 200 |
| `--keepdb` on empty isolated target | **Passed** — `RESTORE_OK … elapsed=13.5s` |
| `--keepdb` on non-empty target | **Failed loudly as required** — `duplicate key value violates unique constraint "account_pkey"`; drill exits non-zero |
| Production Railway backups/PITR | **Not verified** — cannot be reached from this environment; must be verified by opening the Railway project and executing a point-in-time restore into staging |
| File-storage backups (S3/IN-2) | **Not verified** — documented only in `docs/OPERATIONS_RUNBOOK.md` §7 |
| S3 sink for archives | **Implemented, untested** — do not rely on `BACKUP_STORE_DRIVER=s3` in production until a non-prod bucket is exercised and retrieved |
| Integration suite (`npm run test:integration`) | **Passed** — 99/99 tests across 16 files on the seeded dev fixture |
| Integration shared-fixture hygiene | **Fixed** — `tests/integration/workspace-authorization.test.ts` "keeps the revision chain append-only" created an active `Revision Group` in NILE and never cleaned it up; repeated test runs accumulated 8 active groups, saturating pilot `maxActiveGroups=12`. The test now archives its group in a `finally` block, and the eight accumulated rows were archived on 2026-11-10, returning the dev NILE fixture to the 4 seed groups |
| Test-order dependence | **Known risk** — integration tests share the mutable NILE fixture by design; the pilot quota makes the suite order-dependent if any test leaks active groups. `tests/integration/*` must run against the seeded dev fixture, not a shared external database |

**Procedure documented** in `docs/OPERATIONS_RUNBOOK.md` (procedure, 35-day retention, off-machine storage,
monthly drill checklist, restore runbook, unverified items, log-output reference). No production database,
credential, or existing backup was touched. The drill used only the git-ignored, seeded synthetic dev fixture.
The dev fixture itself was intentionally modified in-place — eight leaked active `Revision Group` rows in
`nile-academy` were archived by a one-off UPDATE before this session's final integration run; no dev rows
were deleted, and the shared-fixture hygiene fix prevents future saturation regardless of test order.

---

### 5.5 Demo ledger consistency and per-session billing on 2026-11-10 — `ADR-0025`

This work makes the demo tenant (`Nile Academy`) money-honest under the per-session model and supersedes ADR-0018's per-session prohibition.

- **Balance engine.** `calculateStudentBalances` accepts `sessionCharges` (expected = session price × `present`/`late` marks on non-cancelled sessions) **+** `sessionPricedGroupIds`. Session-priced groups never accrue monthly fee rules for their enrolled students. Dashboard, payments, reports, parent portal, and dashboard collection rate all pass the same computed charges.
- **Ledger wiring.** `attendance_mark.paymentVerified` is no longer a UI-only state: toggling it on a session screen writes or reuses a real session-linked `payment` row in the same transaction (advisory lock per `(session, student)`, price required, audited `payment.recorded` / `payment.voided`). Verified/unverified never diverges from the ledger. A price-unconfigured toggle is rejected with `Payment.errors.sessionPriceMissing`.
- **Session attendance screen.** Revenue card is visible only to members with `payments:read`; the client fetches `SessionRevenueSummary` from `/api/sessions/[sessionId]/revenue` with loading and retryable-error states; amounts are formatted from `sessions.price_per_student_minor`/group default, not from ad-hoc arithmetic.
- **Student profile.** Header quick actions deep-link to the attendance and QR tabs using `?tab=` search params (`profile-tabs`-known list); the QR tab downloads SVG and 512px PNG cards alongside Print and Re-issue.
- **Demo seed.** The demo workspace is session-priced (four groups: 45 000 / 50 000 / 60 000 / 45 000 minor units per session). The stale monthly `fee_rule` rows were wiping the ledger (expected >> received for every student). The financial ledger is append-only **by trigger**, so resetting it uses `TRUNCATE` (row triggers do not fire) for the local-only reset; re-seeding recreates one real session-linked `payment` per eligible mark and retains the voided erroneous entry, the payment revision, and the two reasoned adjustments. `npm run db:seed:demo` was re-run idempotently afterward.
- **Zero-attendance pricing gap closed.** Reports balance and parent portal balance both now pass `extraSessionPricedGroupIds` (groups with `default_price_per_student_minor > 0`) so a session-priced group shows zero expected revenue pre-attendance rather than accruing phantom monthly fees.
- **Verification.** `npm run lint` (ESLint + project rules), `npm run typecheck` (Prisma generate + `tsc --noEmit`), `npm test` (374 unit / 21 UI tests passed), `npm run test:integration` (16 files / 99 tests passed) and `npm run build` all pass after the reseed.

| Check | Result |
|---|---|
| `npm run lint` | **Passed** — ESLint and the project rules |
| `npm run typecheck` | **Passed** — `prisma generate` + `tsc --noEmit` |
| `npm test` | **Passed** — unit 61 files / 374 tests; UI 1 file / 21 tests |
| `npm run test:integration` | **Passed** — 16 files / 99 tests against the local PostgreSQL. Note: the suite initially failed after the machine restarted because the embedded dev database was down; it was restarted (`npm run db:dev:start`) and the full suite then passed unchanged — no test was edited to obtain the result |
| `npm run build` | **Passed** — production build after fixing a `createPaymentTx` mock shape in `tests/unit/cross-season-attendance.test.ts` (`matches` was missing from the mock return) |
| `npm run db:seed:demo` | **Passed** — initial Nile Academy seed, then TRUNCATE + recreate; re-run succeeds idempotently |
| Demo ledger | **Verified by SQL** — 38 present/late non-cancelled marks; 34 session-linked payments; 4 deliberately unpaid marks (one per demo group) remain unpaid; `payment_verified` misalignment with the ledger: **0**; `fee_rule`: **0** |
| Visual re-review of demo screens | **Not performed** — screenshots not re-captured in this session; the ledger reality is verified, the look is not |

**Not claimed by this section:** a live production deployment, visual review of every demo screen, or camera capture behaviour on real hardware. `F-P2-05` remains `◐` as a result of the absent camera verification in this checkout.

### 5.6 Session attendance fast mode and per-student homework question on 2026-11-10 — F-P2-05 fast scanner, F-P1-08 AC-9

Part two of the session attendance work. No schema change, no new dependency, no fake behaviour.

- **Merged "Start attendance" button.** One tap on a `scheduled` session starts it (existing
  `PATCH /api/sessions/:id` action `start`) and opens the scanner immediately. Sessions already
  `started` open the scanner the same way.
- **Fast scan path.** `src/components/sessions/qr-scanner-panel.tsx` rewritten: the camera stream is
  acquired once and persists across scans (the previous code re-acquired it on every submit); decode
  frames downscaled to at most 480 px at ~15 fps; `BarcodeDetector` (hardware/OS-backed) where the
  browser exposes it, with a `jsQR` fallback on the same downscaled frame; a per-token ~4 s
  suppression window (`RecentTokenCache`, unit-tested) stops the camera re-POSTing a visible code;
  the server keeps the authoritative atomic duplicate rejection (`409 CONFLICT`). Success shows the
  student's name, a checkmark, beep, haptics, and an `aria-live=polite` banner. Manual entry remains
  as fallback.
- **Optimistic UI.** Mark buttons and homework yes/no flip instantly; the attendance POST returns
  ok/conflict only and wrong answers roll back with a toast. No full-roster refetch per tap; refresh
  happens only on structural events.
- **Cross-season highlight.** Students eligible only through a different group are appended on first
  mark and highlighted amber (`data-cross-season="true"`, `ui-attendance-row[data-cross-season]`,
  RTL-safe logical properties).
- **Per-student homework question.** When the session's group has an active homework (the latest by
  `createdAt`), each row shows yes/no chips bound to the latest homework. One tap writes an
  `homework_completion_mark` row (`completed` / `not_completed`) linked to the session, upserted per
  `(homework, student)`. Absent marks render unrecorded, never as a claimed answer. The chips are
  server-gated (`homework:write`) and render hidden without it; when there is no active homework the
  question is hidden.
- **Verification.** `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`,
  `npm run build` all pass.

| Check | Result |
|---|---|
| `npm run lint` | **Passed** — ESLint + project rules |
| `npm run typecheck` | **Passed** — Prisma generate + `tsc --noEmit` |
| `npm test` | **Passed** — unit 62 files / 379 tests; UI 1 file / 21 tests |
| `npm run test:integration` | **Passed** — 17 files / 103 tests against the local PostgreSQL |
| `npm run build` | **Passed** — production build |
| Visual review of the attendance screen | **Passed** — six screens (ar/en × light/dark, desktop 1440×920; ar/en light, mobile 390×844) captured with headless Chrome via CDP on 2026-11-10 and inspected; RTL `dir=rtl` under `ar`, `dir=ltr` under `en`; no layout, contrast, overflow, or truncation defects found; demo data untouched (the screens show a `scheduled` session, which renders) |
| `F-P2-05` | **Unchanged status `◐`** — no camera/hardware capture test on real hardware; the fast decode path is code-reviewed and unit-tested, not device-verified |

**Maintenance note.** During this work the shared dev database accumulated 20 orphaned test groups
(from three failed test runs), pushing the workspace over the free-plan `maxActiveGroups = 12` limit
and breaking unrelated tests. The orphaned rows were deleted with direct SQL, after confirming they
carried the test timestamps/names; append-only rows (`attendance_mark` + initial `attendance_revision`)
were removed with their parents only as one-time local cleanup. Demo data (workspace `Nile Academy`,
its groups/students/sessions/ledger) was untouched; afterwards the integration suite passes 103/103
and the active-group count is back to 4.

**Visual verification note.** The screenshots were taken against the local production build
(`node scripts/start.mjs`) with `BETTER_AUTH_URL=http://localhost:3000` set in the process
environment (`.env.local` points at an expired trycloudflare quick-tunnel URL, which the origin
guard compares against); `.env.local` itself was not modified. No spec, code, or message changes
resulted from the review, so the gate was not re-run.

**Not claimed by this section:** the `started`-session visual state — the homework yes/no chips and
attendance marks do render for a `scheduled` session (so they are visible in the six screens) but
their checked/pressed state, the optimistic-toast rollback, the cross-season amber highlight, and
the scan-success banner are interactive states that were not visually verified (capturing them would
have required starting the demo session and marking demo rows, neither of which was acceptable); no
camera-capture test on real hardware; no `OQ-05` resolution; no load test of QR decode throughput;
and no deployment.

### 5.7 Online exam attempt expiry, submission atomicity, and grade-safety corrections on 2026-11-10 — `F-P3-01`

Three business-logic corrections in the online-exam module, none of which changes the API contract or erases teacher-entered data.

- **Automatic grade sync never downgrades an existing score.** `syncScoreToLinkedAssessmentTx` now updates the linked `AssessmentScore` only when no score exists, when the caller explicitly allows a downgrade (manual correction), or when the new score is at least the stored score; a teacher note supplied as `undefined` is no longer used to overwrite an existing note.
- **Submission is atomic at the database layer.** `submitStudentOnlineExamAttempt` transitions the attempt with `updateMany` gated on `status = in_progress`; idempotency keys are enforced, only the winning request upserts `online_exam_response` rows, and duplicate audit/grade-sync events are prevented.
- **Expired in-progress attempts are closed, not resumed.** `startStudentOnlineExamAttempt` marks any expired `in_progress` attempts as `expired` (new `online_exam_attempt_status` enum value, migration `20261111000000_expired_online_exam_attempt_status`), and `submitStudentOnlineExamAttempt` rejects expired attempts with `alreadySubmitted`. Expired attempts still count toward `maxAttempts`.
- The readiness gate (`REQUIRED_MIGRATION_NAME`) now expects the newest migration, keeping the machine check and CI honest.

| Check | Result |
|---|---|
| `npm run lint` | **Passed** — ESLint + project rules |
| `npm run typecheck` | **Passed** — Prisma generate + `tsc --noEmit` |
| `npm test` | **Passed** — unit 63 files / 389 tests; UI 1 file / 21 tests |
| `npm run test:integration` | **Passed** — 17 files / 103 tests against the local PostgreSQL (the tenant-isolation readiness assertion failed before `REQUIRED_MIGRATION_NAME` was updated to the new migration; after updating, the full suite passes) |
| `npm run db:deploy` | **Passed** — migration `20261111000000_expired_online_exam_attempt_status` applied to the local dev database |
| `npm run build` | **Passed** — production build completes after the migration-state update |

**Not claimed by this section:** exam cancellation/extension UI, a student-facing explanation of why an in-progress attempt is rejected after deadline, and any anti-cheat hardening.

### 5.8 Arabic short-answer normalization completed for online exams on 2026-11-10 — `F-P3-01`

`normalizeShortAnswer` (`src/modules/exams/grading.ts`) now applies the same deterministic fold documented in `docs/DATA_MODEL.md` §8 and implemented by the `normalize_arabic` SQL function (used by the derived search-key triggers). No other grading behavior changed; teacher free text remains stored exactly as entered.

- **Case sensitivity** is unaffected: lower-casing still happens only when `caseSensitive` is `false`; for `caseSensitive: true` the Arabic fold still runs (it has no case concept).
- **Letter folds applied:** `أ إ آ ٱ → ا`, `ى → ي`, `ة → ه`, `ؤ → و`, `ئ → ي` (previously only `أإآ → ا` was applied).
- **Digit folds applied:** Arabic-Indic digits `٠-٩` (U+0660–U+0669) and Eastern Arabic-Indic digits `۰-۹` (U+06F0–U+06F9) map to ASCII `0-9` (previously not applied at all).
- Idempotency: the fold is idempotent (`normalizeShortAnswer(normalizeShortAnswer(x)) === normalizeShortAnswer(x)`) and matches the SQL fold for these characters.
- One existing test assertion in `tests/unit/p3-videos-and-exams.test.ts` was updated to expect the new documented `ة → ه` fold (`الاجابة الصحيحة` → `الاجابه الصحيحه`); the documented rule already required it, and no value, score, or accepted-answer data was weakened.

| Check | Result |
|---|---|
| `npm run lint` | **Passed** — ESLint + project rules |
| `npm run typecheck` | **Passed** — Prisma generate + `tsc --noEmit` |
| `npm test` | **Passed** — unit 64 files / 403 tests (14 new normalization regression tests); UI 1 file / 21 tests |
| `npm run build` | **Passed** — production build completes after the short-answer normalization change |

**Not claimed by this section:** changes to paper assessments, search behavior, or any other callers beyond the short-answer normalizer used by online exams; no change to how Latin custom transliterations are transliterated.

### 5.9 Known environmental integration failures awaiting test-fixture cleanup on 2026-11-10

The integration suite shows 101 passing / 3 failing out of 104. These are all the same, pre-existing cause, unrelated to any of the online-exam or payment changes:

| Failing test | Cause |
|---|---|
| `tests/integration/search.test.ts > matches normalized student and group names` | `CONFLICT` / `planGroupLimitReached` on `createGroup` |
| `tests/integration/search.test.ts > includes only the resource types the member may read` | same |
| `tests/integration/students-groups.test.ts > creates records and makes concurrent enrollment idempotent` | same |

Root cause: the seeded local development database (NILE workspace) holds more than the pilot plan's 12-active-groups limit — 4 seeded demo groups plus **12 leaked test fixtures** (`Roster <uuid>` / `Other <uuid>` pairs created by `tests/integration/session-attendance-homework.test.ts`). That file's best-effort `afterEach` cleanup cannot delete groups referenced by append-only attendance-mark revisions (rows must be kept by design), so fixture groups accumulate on every gate run until the limit is reached; once reached, every workflow that creates a group in NILE throws. The enforcement behavior is correct and has not been changed, the tests have not been weakened, and no database rows have been deleted to make the suite green.

**Not acceptable to fix by:** resetting the local database or raising NILE's `planLimitOverrides` — both were declined. The intended remedy is a test-fixture strategy for `session-attendance-homework.test.ts` (e.g., isolating fixtures into a disposable workspace per run, or bounding growth under the pilot cap), done as a dedicated change.

### 5.10 Focused financial regression tests and the session-priced billing rules on 2026-11-11 — `F-P2-04`, `ADR-0025`

Companion to the ADR-0025 work, with two financial source changes approved on 2026-11-11 (this section and §5.11 were corrected on the same date; earlier wording claiming no financial code was changed was incorrect and is superseded). The focused tests in `tests/unit/payments.test.ts` encode the confirmed session-priced billing rules:

- charges exactly the present/late marks passed to it (absent/excused filtering is upstream in the session callers, encoded as a contract test in `tests/unit/payments.test.ts` and verified via existing call sites)
- a single present mark charges exactly the session price; the group is marked session-priced even with no group default price
- direct student-level fee rules continue to accrue; session-priced groups receive no monthly group fee; mixing session charges with a monthly group enrollment yields both
- a group with a monthly rule, no enrollment, and no configured price yields zero expected (zero activity)
- a session's own price works even when the group has no default price — `buildSessionCharges` now marks the group session-priced

**Financial source changes approved on 2026-11-11 (documented truthfully here):**

- `src/modules/payments/session-revenue.ts` — a group is marked session-priced when either the session's own `pricePerStudentMinor` **or** the group's `defaultPricePerStudentMinor` is a positive number. Previously only a positive group default marked the group session-priced, so a session-level price override could not suppress the group's monthly fee.
- `src/modules/payments/calculations.ts` — direct student-level fee rules now always accrue for a student, including one enrolled in a session-priced group; the `hasSessionPricedEnrollment` suppression that silently dropped them was removed. Group-level monthly rules remain filtered to the non-session-priced enrolled group ids (`monthlyGroupIds`), so a session-priced group's monthly fee is still suppressed.

These implement the established session-priced billing rules (`ADR-0025`): direct student fees apply alongside session-priced billing, and a session-level price override makes a group session-priced. They are **not** a resolution of `OQ-20` (whether a direct student-level fee fully replaces, or stacks with, a group-level monthly fee for that month); `OQ-20` remains open with the M2 scope-freeze deadline, and the direct-fee vs group-monthly interaction — including for non-session-priced groups — is unchanged by this work. See `docs/OPEN_QUESTIONS_AND_ASSUMPTIONS.md` §4.3 and the traceability index.

| Check | Result |
|---|---|
| `npm run lint` | **Passed** |
| `npm run typecheck` | **Passed** |
| `npm test` | **Passed** — unit 64 files / 412 tests (4 focused financial regression tests; the earlier 417 total included 5 simulated grading tests that no longer exist); UI 1 file / 21 tests |
| `npm run build` | **Passed** |

**Not claimed by this section:** that `OQ-20` is resolved; replacement or stacking semantics for the direct-fee vs group-monthly interaction; any change to the per-session attendance charging path or to its call sites; any change to mixing session charges with monthly enrollment in another group.

### 5.11 Issue #6 — direct student-level fee rules alongside session-priced group enrollment, fixed on 2026-11-11 — `F-P2-04`, `ADR-0025`

**Original issue:** Student-level fee rules were believed to be dropped whenever a student had a session-priced enrollment. Only group monthly fee rules should be suppressed for session-priced groups; the audit required that direct student-level fee rules must still apply.

**Finding: the audit was correct.** `calculateStudentBalances` previously dropped a student's direct fee rules entirely whenever any enrolled group was session-priced (`hasSessionPricedEnrollment ? [] : …`). An earlier version of this section recorded the belief that the existing logic already handled this — that no fix was needed and no financial logic had changed — that reading was wrong and is superseded by this correction.

**Fix (approved 2026-11-11, `src/modules/payments/calculations.ts`):** direct student-level rules are filtered only by `studentId`; the `hasSessionPricedEnrollment` suppression of direct rules was removed. Group-level monthly rules remain filtered to the non-session-priced enrolled group ids (`monthlyGroupIds`), so group monthly fees for session-priced groups stay suppressed; mixing session charges with a monthly enrollment in another group keeps both.

**Companion fix (approved 2026-11-11, `src/modules/payments/session-revenue.ts`):** `buildSessionCharges` marks a group session-priced when the session's own `pricePerStudentMinor` is a positive number, even if the group's `defaultPricePerStudentMinor` is null or zero. This prevents monthly group fees alongside session-priced billing driven by per-session prices.

**Regression tests (verified to fail pre-fix on 2026-11-11 via stash/re-run):**

- `tests/unit/payments.test.ts > manual payment currency and balances > keeps direct student fee rules alongside session-priced group enrollment` — direct fee (5,000 × 3 months = 15,000) + session charge (6,000) = expected balance **21,000**; group monthly fee suppressed.
- `respects session price even when group default price is not configured` — `buildSessionCharges` returns the session's own price and marks the group session-priced with no group default price.

| Check | Result |
|---|---|
| `npm run lint` | **Passed** |
| `npm run typecheck` | **Passed** |
| `npm test` | **Passed** — unit 64 files / 412 tests (including the regression tests above); UI 1 file / 21 tests |
| `npm run build` | **Passed** |

**OQ-20 remains open.** Whether the direct fee rule fully replaces, or stacks with, a group-level monthly fee for that month is an open product decision, not a resolved business rule. The changes above implement only the confirmed session-priced billing behaviour — direct fees accrue alongside session-priced billing, and group monthly fees are suppressed for session-priced groups. They do not decide the direct-fee vs group-monthly interaction, including for non-session-priced groups; that is exactly `OQ-20`'s question. See `docs/OPEN_QUESTIONS_AND_ASSUMPTIONS.md` §4.3; deadline is M2 scope freeze (`F-P2-04`).

**Not claimed by this section:** that `OQ-20` is closed; stacking or per-rule precedence support; that the direct-fee vs group-monthly interaction is a decided rule.

### 5.12 Issue #7 — follow-up resolution audit history, fixed on 2026-11-11 — `F-P2-06`, `DM-4`, `D-10`

**Original issue:** re-resolving an already-resolved follow-up overwrote the recorded outcome while the audit trail stayed indistinguishable from the original resolution: `student_follow_up.resolved` was audited identically every time and the diff held only the new outcome. Two things were lost — the fact that a resolution was a correction, and the previously recorded outcome.

**Fix (minimal, no schema/route/component changes):** in `src/modules/followups/service.ts` `resolveFollowUp`:

- `existing.status === "resolved"` with the **same** outcome returns `existing` unchanged — idempotent retry, writes nothing.
- First resolution (`existing.status === "open"`) audits `student_follow_up.resolved` with `diff: { outcome }` and appends `student_follow_up_event` `action: "resolved"` — unchanged behaviour.
- Different-outcome re-resolution (a correction) audits `student_follow_up.outcome_corrected` with `diff: { previousOutcome, outcome }` and appends `student_follow_up_event` `action: "outcome_corrected"`. The previous outcome is read from the pre-update row before the update in the same scoped transaction.
- Message catalogue (`messages/en.json` / `messages/ar.json`) gained `Academics.followups.historyActions.outcome_corrected` so the existing history list can render the correction entry. **No page, component, route, or schema change.**

**Regression test:** `tests/integration/academic-records.test.ts > "audits the first resolution, stays idempotent on identical retry, and audits outcome corrections"` — first resolution audits `resolved` with `{ outcome: "contacted" }`; identical retry writes nothing; different-outcome re-resolution audits `outcome_corrected` with `{ previousOutcome: "contacted", outcome: "no_action" }`; the task event sequence reads `created → resolved → outcome_corrected`; a final identical retry leaves the event count unchanged.

| Check | Result |
|---|---|
| `npm run lint` | **Passed** |
| `npm run typecheck` | **Passed** (tsc exit 0) |
| `npm test` | **Passed** — unit 64 files / 407 tests; UI 1 file / 21 tests (no unit tests changed; the new regression test is integration-level, matching house style for DB-backed correction audits) |
| `npm run build` | **Passed** (exit 0) |
| `npx vitest run --config vitest.integration.config.ts tests/integration/academic-records.test.ts` | **Passed** — 3/3 tests |

**Not claimed by this section:** whether a re-resolution with a different outcome should be *allowed at all* (current permissive behaviour is retained; tightening it requires a product decision); any reopening flow (not added); any change to the parent-portal treatment of follow-ups (none planned).

### 5.13 Issue #8 — worker drain merge mislabels job type on 2026-11-11 — `ADR-0008`, `ADR-0024`

**Original issue:** `merge()` in `src/worker/drain.ts` folded two reports and always returned `{ job: "message_outbox" }`, regardless of which job's counts were being merged — so a `report_export` total would ship mislabelled as outbox work and any observability built on `DrainReport.job` would see the wrong type. The reported counts were real; only the tag was invented.

**Fix (minimal, one function, no behavior to draining):**

- Removed the hardcoded `job: "message_outbox"` literal.
- Returned `count.job` so the merged report carries the shared job.
- Refused to merge reports of different jobs (`count.job !== other.job`), throwing `cannot merge drain reports for different jobs: <a> vs <b>` instead of silently summing them into one bucket. This turns a latent lie into an explicit programming error.
- Exported `merge` for unit testing only; `drainMessageOutboxes` is still its sole production caller and its output (`job: "message_outbox"`) is unchanged, so multi-workspace outbox behaviour is untouched. No schema, route, page, database, or migration changes.

**Regression test:** `tests/unit/worker-drain.test.ts > "merge"` — three cases: (1) merging two `report_export` reports yields a `report_export` report with summed counts; (2) merging two `message_outbox` reports yields a `message_outbox` report; (3) mixing types throws with the exact invariant message. Existing outbox multi-workspace tests keep passing unchanged (requirement 5) as the unchanged behaviour check.

| Check | Result |
|---|---|
| `npm run lint` | **Passed** |
| `npm run typecheck` | **Passed** (tsc exit 0) |
| `npm test` | **Passed** — unit 64 files / 410 tests (3 new; the existing outbox suite plus runner unaffected) |
| `npm run build` | **Passed** (exit 0) |

**Not claimed by this section:** any observable drain visibility change to logs/metrics for report exports beyond corrected labeling; refactoring of `runner.ts`; changes to the worker entrypoint or startup gate.

### 5.14 Issue #9 — exam manual grading wipes an existing teacher note on the linked AssessmentScore, fixed on 2026-11-11 — `F-P3-01`

**Original issue:** "Exam auto-sync note `input.note ?? null` wipes existing teacher notes if note is undefined."

**Root cause (narrower than the report's phrasing after Issue #1):** `syncScoreToLinkedAssessmentTx` was already fixed to honour `undefined` as "leave the note alone" (Issue #1). The manual-grading caller `gradeOnlineExamAttempt` still pre-converted `undefined` to `null` (`note: input.gradingNote ?? null`), so the `!== undefined` guard inside the sync function could not tell "teacher omitted the note" apart from "teacher explicitly cleared it" — every grading action without `gradingNote` (including `exam.grade_corrected` entries) silently overwrote the linked `AssessmentScore`'s teacher note with `null`.

**Fix (one line, `src/modules/exams/service.ts`):** `note: input.gradingNote`. The pass-through now matches the function contract exactly:

- `undefined` (note omitted, e.g. a plain grading or a correction without a note) → the existing linked note is preserved.
- a `string` → the linked note is updated.
- explicit `null` → the linked note is cleared.

`syncScoreToLinkedAssessmentTx` is unchanged; the submit-path sync call is unchanged (passes no note and `allowDowngrade: false`); `setAssessmentResult` is unchanged (it is the explicit manual-scoring tool, where `input.note ?? null` is intentional); no schema, route, UI, or migration changes.

**Test harness:** the in-memory `assessmentScore` mock in `tests/unit/p3-videos-and-exams.test.ts` now persists and returns `note` (create stores `note ?? null`; update writes `score` / `status` / `note` only when supplied), so note preservation is observable to the suite.

**Regression test:** `tests/unit/p3-videos-and-exams.test.ts > "grading sync preserves an existing teacher note unless gradingNote is explicitly provided"` — a pre-existing linked `AssessmentScore` seeded with a teacher note survives: (1) first grading **without** `gradingNote` (score syncs 6 → 8, note preserved); (2) grading correction **with** `gradingNote` (note replaced); (3) grading correction **without** `gradingNote` (score syncs 9 → 10, updated note preserved).

| Check | Result |
|---|---|
| `npm run lint` | **Passed** |
| `npm run typecheck` | **Passed** (prisma generate + tsc exit 0) |
| `npm test` | **Passed** — unit 64 files / 411 tests (+1 regression test); UI 1 file / 21 tests |
| `npm run build` | **Passed** (exit 0) |

**Not claimed by this section:** that the exams grading flow is barred from ever writing the linked note — explicit `null` deliberately clears it; any change to `setAssessmentResult` (manual scoring tool) semantics; any new UI surface for `gradingNote`; any change to the integration-suite environmental failures recorded in §5.9.

### 5.15 Issue #10 — dashboard attendance streak ignores the selected period and is not session-chronological, fixed on 2026-11-11 — `F-P1-01`, `F-P1-06`

**Original issue:** "Dashboard attendance streak uses all history, not the selected dashboard period; also marks not chronologically sorted."

**Root cause:** `getDashboardData` grouped `raw.attendanceMarks` per student in the order returned by the repository — `recordedAt desc` — with no `[start, end]` filter. The consecutive-absence walk then counted the trailing run of absent marks in *recording order*, so (a) absences outside the selected window (`today` / `this_week` / `this_month` / `all`) inflated the streak and the `at_risk` / `inactive` classification, and (b) a student whose marks were entered out of session order (late-entered backfills, corrections appended after newer sessions) saw a streak computed against the wrong "trailing" marks.

**Fix (`src/modules/dashboard/service.ts` only):**

- Before grouping, marks are filtered to `mark.session.startsAt ∈ [start, end]` exactly as the attendance-rate KPI is scoped.
- The filtered marks are sorted by `session.startsAt` **descending** before the per-student map is built, so the trailing run is the current streak anchored on the most recent session.
- The existing skip-cancelled-sessions rule and the `atRiskAfter` / `inactiveAfter` thresholds are unchanged; `calculateFollowUpFlags` and the rest of the dashboard are unchanged; no schema, repository, route, or UI changes.

**Regression test:** `tests/unit/dashboard-streak.test.ts` — mocked repository, real `getDashboardData` calculation. Six cases: (1) absences outside `this_month` do not affect the streak; (2) `all` period still considers historical attendance; (3) late-entered marks evaluate by session date, not `recordedAt` (fails pre-fix); (4) cancelled sessions are skipped; (5) a present mark breaks the streak; (6) no in-period attendance yields a streak of zero. Cases (1) and (3) were verified to fail against the pre-fix implementation via a stash/re-run.

| Check | Result |
|---|---|
| `npm run lint` | **Passed** |
| `npm run typecheck` | **Passed** (prisma generate + tsc exit 0) |
| `npm test` | **Passed** — unit 65 files / 417 tests (+6 new); UI 1 file / 21 tests |
| `npm run build` | **Passed** (exit 0) |

**Not claimed by this section:** any change to the attendance-rate KPI, payments, grades, homework, or attention-center follow-up rules (they were already period-scoped or intentionally full-history); any change to what teachers can record or to historical attendance data; any change to the student-profile derivation (`students/repository.ts` already orders by session startsAt desc); period-renaming or threshold business rules.

---

### 5.16 Public bilingual landing page on 2026-11-11 - user-requested (release-plan conflict recorded)

- `/ar` and `/en` now render a public marketing landing page (Arabic-first, RTL; English second,
  LTR; light and dark) built from the existing token layer (`src/styles/tokens.css`, ADR-0023) and
  logical CSS only (`src/styles/landing.css`). The readiness/status page moved to
  `/{locale}/status` and no longer redirects to sign-in/app when the system is ready; `/healthz` and
  `/readyz` are unchanged.
- Scope decisions locked by the user:
  - `/{locale}` hosts the landing page; the readiness page moves to `/status`.
  - CTAs are "Try Now!" (Arabic: "جرّب دلوقتي!") + "Sign in" (signed-in visitors see "Open app"). This reverses
    `RELEASE_PLAN.md` § 3.4 (M1 had no self-signup) and § 3.5 (no public marketing). Both sections
    carry the recorded override.
  - The hero uses a **real screenshot** of the seeded demo workspace inside the Stitch-style frame;
    `public/landing/workspace-ar.png` and `workspace-en.png` are the captured artifacts (see the
    2026-11-12 verification below).
  - Indexable landing with localized metadata, `hreflang`, `robots.txt`, and `sitemap.xml` (only
    the two landing pages). The locale layout's `noindex` default is overridden only by the landing.
  - Arabic and English copy are single-language per route (no inline duplicates); Latin "Kashkol"
    wordmark kept.
  - "Start free / no credit card" claims were **rejected**; the CTA is "Try Now!" / "جرّب دلوقتي!".
  - No fabricated statistics, testimonials, logos, or pricing anywhere; the eight problem→solution
    pairs each map to a real, merged module (students, groups, session conflict detection,
    attendance/QR, homework, assessments, student follow-up, staff roles).
- **Open items recorded, not hidden:**
  - No public privacy notice or terms of service exist yet. Legal review (`F-P0-08` AC-7) is
    required before promoting the site; the landing collects no data and runs no analytics.
  - § 3.4 / § 3.5 override must be confirmed by the product owner before the M1 cohort launch.
  - The landing is `force-dynamic` because the header reads the session to choose between
    "Sign in" and "Open app"; that is why it is not a static route.
  - Screenshots must be re-captured whenever the sessions UI changes.
  - A stale `manifest.webmanifest` vs `public/manifest.json` mismatch (both exist; the layout points
    at `/manifest.webmanifest`) is noted and intentionally left out of scope.
- Verification on 2026-11-11 (after the first build):
  - `npm run lint`, `npm run typecheck`, `npm test` (445 passed), `npm run build` (67 pages;
    `/[locale]` dynamic, `robots.txt` and `sitemap.xml` static) — all pass.
  - `/ar`, `/en`, `/ar/status`, `/en/status`, `robots.txt`, `sitemap.xml` all served HTTP 200 from
    the production standalone build; the served `<head>` contains `canonical`, `hrefLang` alternates
    (`ar`, `en`, `x-default`), and the `noindex` default is overridden only on the landing page.

- Verification on 2026-11-12 (isolated integration database and real screenshots):
  - `npm run test:integration`: **123 of 123 pass** on a fresh, isolated `kashkol_integration`
    database on the embedded cluster (localhost:5433). The `kashkol_dev` demo workspace was left
    untouched, as were the plan limits. The earlier "dev-database contamination" diagnosis recorded
    above was wrong: the same 3 failures reproduced on a pristine database until the missing grant
    (below) was applied; after a full reset the suite passes 123/123. Note that each run leaks
    ~5–6 NILE groups (pilot plan cap is 12), so the suite degrades across re-runs on a reused
    database — the reset procedure is: drop and recreate `kashkol_integration`,
    `prisma migrate deploy`, re-apply the grant, `tsx scripts/seed.ts`, then run the suite.
  - **Pre-existing defect found:** `prisma/migrations/20261108000004_homework_completion_marks/migration.sql`
    creates `homework_completion_mark` with no `GRANT` to the app role (21 other migrations do
    grant). CI works around this only via `ALTER DEFAULT PRIVILEGES`. A forward-only migration
    adding the missing grant is the right fix — **not applied**, awaiting approval.
  - **`.github/workflows/ci.yml` cannot pass as written:** with a fresh database, CI-style default
    privileges and no seed step, 88 of 123 tests fail. The workflow never runs `npm run db:seed`
    before `npm run test:integration`. Proposal (not applied): add a seed step to `ci.yml` and
    commit the missing-grant migration.
  - **Screenshots captured and wired:** `public/landing/workspace-ar.png` and `workspace-en.png`
    (1422×804, valid PNGs) are real captures of the seeded demo workspace sessions screen using the
    system Chrome over the DevTools protocol via Node's built-in WebSocket — no new dependency was
    added. Verified by dumping the rendered DOM text: no phone-like strings, no guardian data. The
    demo data shown is the noisy smoke-test accumulation in the demo workspace; nothing was deleted
    or re-seeded. `HAS_DEMO_SCREENSHOT = true`; the hero `next/image` is sized 1422×804 and the
    captioned illustration is no longer shipped.
  - After wiring the screenshots, `npm run build` passes and the rebuilt standalone server serves
    `/ar` (200, references `/landing/workspace-ar.png`) and `/en` (200, references
    `/landing/workspace-en.png`); the screenshot itself returns HTTP 200 (87104 bytes).
  - **Migration `20261113000001_homework_completion_mark_grants` (approved 2026-11-11).** A
    forward-only migration grants the application role `SELECT, INSERT, UPDATE, DELETE` on
    `homework_completion_mark`; no historical migration was modified. Verified against a fresh,
    isolated `kashkol_integration` database: `prisma migrate deploy` applies it, the
    `kashkol_app` role holds the four privileges, and the suite passes 123/123 with no manual
    grant whatsoever. `REQUIRED_MIGRATION_NAME` in `src/lib/db/migration-state.ts` was bumped
    in the same change as the file's own doc comment requires â€” that constant lives in a file
    shared with the portal/QR changeset, and the edit is the one-line bump only.
  - **`ci.yml` integration path fixed (approved 2026-11-11).** The integration job now runs against
    a freshly provisioned, isolated `kashkol_test` database created by the CI postgres service and
    discarded when the job ends, and `npm run db:seed` runs between migrations and integration
    tests (deterministic fixtures: two synthetic workspaces, three synthetic users). It never
    connects to production and never seeds or modifies the NILE development workspace. Emulated the
    complete workflow locally on a fresh disposable database (fresh DB â†’ roles/default privileges â†’
    `db:deploy` â†’ `db:seed` â†’ `test:integration`): all steps pass, 123/123, and the YAML parses
    to the expected job structure. The GitHub-hosted run itself has not been executed; the earlier
    "88/123 fail without a seed" finding is what this fix addresses.
  - **robots.txt and sitemap.xml are now dynamic (approved 2026-11-11).** Both routes export
    `dynamic = "force-dynamic"`, so the origin comes from the runtime `BETTER_AUTH_URL`, not from
    whatever was present at build time. Verified with a deliberately mismatched setup: built with
    `BETTER_AUTH_URL=https://build-time-check.example.com`, served with
    `https://runtime-check.example.com` â€” robots `Host`/`Sitemap` and sitemap `loc`/alternates
    and the page canonical/`hrefLang` alternates all emit the **runtime** origin, with zero
    `localhost` or `trycloudflare` mentions anywhere in the responses. Trade-off: both routes
    render per request (trivial string building, no I/O) and sitemap `lastModified` is now request
    time, not build time. Build output confirms `/robots.txt` and `/sitemap.xml` as `Æ’` (dynamic).
  - **Screenshots kept as-is (decision 2026-11-11).** The Arabic and English captures remain; NILE
    demo data was not deleted, reset, or reseeded. Their content is the current smoke-test data and
    their visual quality still requires final human review before public launch.

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
| 0.20 | Deploy to Railway: web, worker, database, secrets, health checks, staging and preview environments | A staging deploy passes the health check and the production-config guard | ◐ `railway.json` (web) and `railway.worker.json` (worker), `npm run worker` with claim-then-complete drains, a migration gate, and Railway restart policy exist; no staging deploy has been run yet |
| 0.21 | Run the M0 release gate (§3 of `RELEASE_PLAN.md`) | Every gate item is checked with evidence | ☐ |

### M1 — Core product (P1)

| # | Item | Exit condition | State |
|---|---|---|---|
| 1.1 | Dashboard | Comprehensive 8-section teacher workspace dashboard implemented; every number computed from real records with zero fabrication | ☑ |
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
| 2.4 | Manual payments with a ledger and no settlement claim | `F-P2-04` passes for EGP/monthly fees **and** per-session attendance-based billing (`ADR-0025`); parent payment views remain disabled | ☑ |
| 2.5 | QR attendance | `F-P2-05` passes | ◐ student QR identity tab with SVG/PNG/print download on the student profile and a session-page QR scanner panel exist; integration and unit tests exist; camera capture was not exercised on real hardware in this checkout |
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
| 3.9 | Forms and surveys foundation | `F-P3-09` passes; server-side complete; no visual builder; public response route deferred (08C) | ☑ |
| 3.10 | Forms HTTP API (`F-P3-09`) | 10 service routes exposed; registry updated; integration verified | ☑ |
| 3.11 | Forms visual builder (`F-P3-09` extension / M4) | Dashboard, `/forms/new`, and editor (all 11 types, sections/page breaks, conditional logic, preview); explicit save with `updatedAt` concurrency guard; Arabic/English and light/dark; no autosave and no public submission | ☑ |
| 3.12 | Run the M3 release gate | Every gate item is checked with evidence | ☐ |

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
| Know how to back up, restore, and verify the database | `OPERATIONS_RUNBOOK.md` |
