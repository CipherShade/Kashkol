# Kashkol — Release Plan

**Status:** Draft v0.1 · **Date:** 2026-10-21 · **Companion to:** `PRODUCT_REQUIREMENTS.md`, `USER_FLOWS.md`

This plan sequences the P0–P3 tiers into concrete milestones with entry criteria, exit criteria,
release gates, and rollback. It is deliberately conservative about what the **first** release contains:
the guiding constraint for M1 is *"a teacher can run a real teaching week alone, in Arabic, on a
phone, and nothing in it lies."*

---

## 1. Milestone overview

| Milestone | Tier | Scope headline | Exit posture |
|---|---|---|---|
| **M0 — Foundation** | P0 | Tenancy, auth, i18n/RTL, theming, design system, data model, audit, privacy groundwork, infra | Internal build; the app is not usable by a teacher yet |
| **M1 — First usable release** | P1 | Dashboard, students, groups, schedule, attendance + corrections, homework, paper grades, parent updates, files, basic reports, search | **Private beta** with a small group of real Egyptian teachers |
| **M2 — Expansion** | P2 | Assistants + enforced permissions, parent portal, student portal, manual payments, QR attendance, progress & follow-up, notifications, exports | **Public beta**, Arabic-first, with a paid pilot cohort |
| **M3 — Advanced** | P3 | Online exams, recorded video via external provider, admin console, subscription, scale hardening, printable report cards | **General availability** |

Each milestone ends with a release, not a demo. There is no milestone whose exit is "the screens
exist".

---

## 2. Milestone M0 — Foundation

**Target duration:** 8–10 weeks (indicative; no team size is assumed here — see `OQ-01`).
**Outcome:** the platform is real, secure, and empty. No teacher-facing value, deliberately.

### 2.1 Work packages

| # | Package | Delivers | Requirements |
|---|---|---|---|
| 0.1 | Repository & CI | Monorepo, lint/typecheck/test gates, secret scanning, branch protection | F-P0-09 |
| 0.2 | Database foundation | Schema, migrations, `workspace_id` on every tenant table, RLS policies, seed fixtures | F-P0-01 |
| 0.3 | Identity | Registration, verification, sign-in/out, sessions, password reset, lockout, audit of auth events | F-P0-02 |
| 0.4 | Workspace & settings | Workspace creation, thresholds, locale/theme/timezone/currency defaults | F-P0-06 |
| 0.5 | Design system | Tokens (light/dark), primitives, icon set, charts, layout, mobile rules | F-P0-04, F-P0-05 |
| 0.6 | i18n | Message catalogue (`ar`/`en`), locale provider, direction handling, RTL lint, date/number formatting | F-P0-03 |
| 0.7 | Audit | Append-only audit model, service middleware, actor resolution, redaction | F-P0-07 |
| 0.8 | App shell | Sidebar, top bar, routing (URL-based), notifications popover, toasts, error/empty states | F-P0-05, F-P0-10 |
| 0.9 | Infra & observability | Environments, CI/CD, backups, restore drill, logging, metrics, alerts | F-P0-09 |
| 0.10 | Privacy groundwork | Data inventory, export/delete scaffolding, log redaction, privacy notice draft | F-P0-08 |

### 2.2 Entry criteria

- Stack decision recorded (the default in `A-01` stands until changed).
- The prototype has been re-read and its token set, i18n catalogue, and primitive list agreed as the
  starting point (already done — see `PRODUCT_REQUIREMENTS.md` §13).
- A decision on the deployment target and the email provider.

### 2.3 Exit criteria (M0 gate)

1. Two workspaces exist in staging; a full cross-tenant test matrix passes (F-P0-01 AC-3).
2. Sign-up → verify → create workspace → sign out → sign in works end to end.
3. Every string in the UI comes from the catalogue; the i18n lint passes; `ar` and `en` catalogues have
   identical key sets.
4. The app renders correctly at 320 px in both directions, in both themes, with no horizontal scroll.
5. Dark mode is reachable via an explicit control **and** via the OS preference.
6. Every mutating request in the seeded flows produces a server-side audit event.
7. The `ar` catalogue has been reviewed by a native speaker for register and terminology.
8. A restore drill from backup has been executed and recorded.
9. CI blocks merges on: type errors, lint errors, failing tests, a tenant table without `workspace_id`,
   a missing translation key, and a detected secret.

### 2.4 Explicitly deferred out of M0

Payments, QR, portals, exams, video, exports, subscriptions, and multi-workspace switching. M0
contains **no** user-facing data entry beyond the workspace profile.

---

## 3. Milestone M1 — First usable release

**Target duration:** 10–12 weeks after M0.
**Outcome:** a teacher can run a full teaching week in Kashkol instead of a notebook, and every number
Kashkol shows them is derived from what they entered.

### 3.1 Scope — what ships in M1

| Requirement | Feature |
|---|---|
| F-P1-01 | Dashboard |
| F-P1-02 | Students: list, create, edit, archive |
| F-P1-03 | CSV/XLSX import of students |
| F-P1-04 | Groups and roster |
| F-P1-05 | Schedule and sessions |
| F-P1-06 | Manual attendance |
| F-P1-07 | Attendance corrections and history |
| F-P1-08 | Homework | Group or selected-student assignments, permitted existing resources, manual status, optional teacher feedback/grade; no online upload claim |
| F-P1-09 | Paper assessments and grade entry | Paper exam/quiz types, explicit missing/excused/not-taken statuses, normalized averages, optional per-assessment extra-credit allowance, audited corrections |
| F-P1-10 | Parent updates via prepared WhatsApp message |
| F-P1-11 | Files and PDFs |
| F-P1-12 | Basic reports (read-only) |
| F-P1-13 | Search |
| F-P1-14 | Account, profile, sign-out |
| F-P1-15 | Accessibility, performance, and responsive gate |

### 3.2 Scope — what is explicitly NOT in M1

| Deferred | Where it lands | Why |
|---|---|---|
| Assistants, invitations, permissions | M2 | Needs real RBAC; a half-built permission system is worse than none |
| Parent portal / student portal | M2 | Needs real authentication and a privacy review; the prototype's hardcoded mock is not shippable |
| Manual payment tracking | M2 | Money data needs a permission boundary and an export story |
| QR attendance | M2 | Needs camera, token lifecycle, anti-abuse design |
| Progress/follow-up workflow | M2 | Depends on trustworthy history from M1 |
| Exports (CSV/XLSX/PDF) | M2 | Needs a job runner and a file-delivery flow |
| Email digest / push notifications | M2 / M3 | Needs a preferences model |
| Online exams, video, billing, admin console | M3 | Later phase per the brief / external dependencies |

### 3.3 Exit criteria (M1 gate)

1. **End-to-end acceptance:** using only M1 features, a teacher can import 60 students, define 6
   groups with weekly slots, run 20 sessions recording attendance, make 5 corrections, assign 10
   homeworks with submissions, enter 4 assessments, share 6 PDFs, and prepare 25 parent messages — with
   **zero** manual database edits.
2. **Truthfulness audit:** every dashboard tile, report figure, student metric, and progress value is
   recomputed from records by an automated check that compares the UI value to a query over the raw
   tables. Any mismatch fails the build.
3. **Cross-tenant suite** green.
4. **No faked feature** — the M1 build passes a manual walkthrough of the §12 prohibitions in
   `PRODUCT_REQUIREMENTS.md`, and no control in M1 is inert.
5. **Arabic QA:** a native speaker walks every M1 screen in Arabic at 360 px width and reports zero
   blocking defects.
6. **Performance:** budgets in F-P1-15 AC-6 met on a representative mid-range Android device.
7. **Accessibility:** automated axe scan with zero critical violations on all M1 screens; keyboard
   walkthrough of the attendance flow.
8. **Security review** before the private beta: auth flows, session handling, file upload path,
   signed URLs, and tenant scoping reviewed by a second engineer.
9. **Support readiness:** in-product help text for the three hardest tasks (import, take attendance,
   correct attendance) and a one-page Arabic quick-start guide.

### 3.4 Private beta design (M1 → M2)

- **Cohort:** 5–10 teachers from the Egyptian private-teaching market, recruited directly.
  Not a public beta — no self-signup during M1.
- **Duration:** 4 weeks minimum, with at least one full school term fragment if possible.
- **Data:** each beta teacher's real student roster, **with consent**, in a production-shaped
  environment. Seeded/demo data is never mixed with real data.
- **Feedback:** a one-tap in-app feedback button (free-text + optional screenshot) and a weekly
  Arabic check-in call.
- **Instrumentation:** product analytics that record **event names and counts only** — never student
  names, phone numbers, note bodies, or message bodies. The analytics payload schema is reviewed
  against the privacy rules before it is enabled.
- **Trial data handling:** a beta teacher can export and delete their workspace at any time, and doing
  so is exercised at least once during the beta as a rehearsal of the real deletion path.
- **Exit from beta:** every P0/P1 defect is closed; the teacher has completed at least two full weeks
  in Kashkol; and no blocker exists in the attendance or correction path.

### 3.5 Rollout and rollback for M1

- Dark launch by invite only; no public marketing.
- Rollback: the previous application image is redeployed within 10 minutes; database migrations are
  forward-only with compensating migrations, and the pre-release restore drill is re-verified before
  each release.
- Feature flags exist from M1 for: parent-message drafting, file upload, and reports. Each flag
  defaults to **off** in production until explicitly enabled for a cohort.

---

## 4. Milestone M2 — Expansion

**Target duration:** 12–14 weeks after M1.
**Outcome:** a teacher can delegate to an assistant, a parent can see their child without asking, and
money is tracked.

### 4.1 Scope

| Requirement | Feature | Notes |
|---|---|---|
| F-P2-01 | Assistants, invitations, enforced permissions | Deny-by-default; server-side enforcement |
| F-P2-02 | Parent portal (authenticated) | Real auth; teacher-issued or request-then-approve linking |
| F-P2-03 | Student portal (authenticated) | Online homework file submission is a separate capability; it is not implemented by the teacher-side homework workflow |
| F-P2-04 | Manual payment tracking | EGP, partial payments, void-not-delete |
| F-P2-05 | QR attendance | Server-validated tokens |
| F-P2-06 | Academic progress and follow-up | Source-backed rules and staff-only follow-up tasks; parent access requires an explicit allowlisted route |
| F-P2-07 | Notifications expansion | Rule-generated, deep-linking, optional email digest |
| F-P2-08 | Multi-workspace switching | |
| F-P2-09 | Teacher-side portal preview | Labelled preview only |
| F-P2-10 | Reports and export | CSV/XLSX/PDF, asynchronous |
| F-P2-11 | Server-side import/export and backup restore | Pre-flight validation |
| F-P2-12 | Session correction workflow | Reschedule/cancel with reasons |

### 4.2 Prerequisites (must be satisfied before M2 work starts)

1. **Legal review of the privacy notice and the minors'-data handling**, in Arabic and English. This is
   an external dependency and is the **longest-lead item** in the plan — it is started at the *end* of
   M1, not at the start of M2.
2. An SMS/OTP provider contract (or a decision to use emailed links only — `OQ-09`).
3. A decision on the video provider (needed to schedule the P3 integration, not M2 itself).
4. M1 beta exit criteria met.

### 4.3 Exit criteria (M2 gate)

1. **Permissions matrix test:** every permission × endpoint combination is asserted; a request the UI
   hides but the API allows fails the build.
2. **Portal isolation test:** a parent token cannot read another parent's child, a student's data, or
   any teacher endpoint. A student token cannot read any teacher endpoint or another student's data.
3. **Payments correctness:** totals are recomputed from the payment ledger by an automated check;
   voiding never removes a record; no screen claims a payment is "settled".
4. **QR correctness:** tokens are stored hashed; expired/rotated/enrolled-only checks are proven by
   integration tests; a rejected scan is logged.
5. **Export correctness:** an export of workspace A contains zero rows from workspace B (asserted in a
   test with two seeded workspaces).
6. **Privacy review passed** with all high-severity findings closed.
7. **Arabic QA** repeated for all new M2 screens, including both portals.
8. **Public beta opened** to self-signup with a rate limit and a manual review queue.
9. **Support load tested:** 2× the M1 cohort size with the same support staffing.

---

## 5. Milestone M3 — Advanced

**Target duration:** 12+ weeks after M2, and **gated** on the external dependencies below.
**Outcome:** the longer-tail features from the brief, plus the platform capabilities that a paid
SaaS needs.

### 5.1 Scope

| Requirement | Feature | External dependency |
|---|---|---|
| F-P3-01 | Online quizzes and exams | None (internal) |
| F-P3-02 | Recorded video via external provider | **Video provider contract + API** |
| F-P3-03 | Platform administration console | None |
| F-P3-04 | Subscription, plan, and billing | **Billing provider contract** |
| F-P3-05 | Scale, performance, reliability hardening | None |
| F-P3-06 | Rich notification channels | Push provider |
| F-P3-07 | Advanced reporting and academic-year handling | None |
| F-P3-08 | Duplicate-student detection and roster hygiene | None |
| F-P3-09 | Forms and surveys foundation (no visual builder) | None |

### 5.2 Sequenced inside M3

Because P3 contains a genuinely independent item (online exams) and two items that cannot start
without a third party, M3 is split:

- **M3a — Internal only:** F-P3-01 (online exams), F-P3-03 (admin console), F-P3-05 (scale),
  F-P3-07 (academic year), F-P3-08 (duplicates), F-P3-09 (forms foundation).
- **M3b — Gated on contracts:** F-P3-02 (video), F-P3-04 (billing), F-P3-06 (push). Each starts only
  when its provider contract and sandbox access exist. **If a contract does not land, that feature does
  not ship in that release** — it is deferred, and no placeholder is released in its place.

### 5.3 Exit criteria (M3 gate — general availability)

1. Online exams: a full authoring → publish → attempt → auto-score → manual-grade → results cycle
   verified by an integration test; attempt limits enforced; non-roster users get a neutral message.
2. Video: real playback from the real provider, verified in a production-shaped environment; provider
   outage degrades to "unavailable" with no broken player.
3. Admin console: metadata only by default; break-glass grant is time-boxed, bannered in the tenant
   UI, and visible to the workspace owner in their Activity Log.
4. Billing: subscription state is webhook-driven and idempotent; limits are communicated before being
   hit; downgrades restrict writes without deleting data.
5. Scale: budgets hold at 10× the seed dataset; the load test report is attached to the release.
6. Restore drill and backup verification passed for the release cycle.
7. Forms: create → edit draft → publish → submit → read responses verified by an integration test;
   required and conditional visibility enforced server-side; public response route still disabled.
8. Arabic QA, accessibility scan, security review, and the full cross-tenant suite re-run.
9. A published, Arabic and English, privacy notice and terms are live.

---

## 6. Cross-cutting workstreams

These run **across all milestones** and are not a separate tier.

### 6.1 Arabic and RTL quality

| Activity | Frequency | Owner |
|---|---|---|
| Message-catalogue review by a native speaker | Every release | Product + native reviewer |
| RTL visual review at 320/360/768 px | Every release | Engineering |
| Bilingual screenshot diff against the previous release | Every release | Engineering |
| Terminology glossary maintained (grade terms, attendance terms, money terms) | Continuous | Product |
| Arabic-only bug intake from real teachers | Continuous | Support |

**Non-negotiable:** a release with a known RTL layout break in a primary flow (attendance, grades,
sessions) does not ship.

### 6.2 Visual design

The prototype's token set is the starting point, not the final answer. Before M1 ships, a visual pass
resolves the items listed in `PRODUCT_REQUIREMENTS.md` §14 that are visual rather than behavioural —
in particular the duplicated mobile media queries (DEF-04), the file-scope filter label (DEF-18), the
exam-results column header (DEF-19), the hardcoded English placeholder (DEF-21), and the Arabic day
names (DEF-17).

### 6.3 Security

| Activity | Frequency |
|---|---|
| Cross-tenant test suite | Every build |
| Dependency audit | Every build |
| Secret scan | Every build |
| Auth-flow review | Every release |
| Tenant-scoping review of every new query path | Every PR that adds a query |
| External penetration test | Before public beta (M2) and before GA (M3) |
| Restore drill | Monthly |

### 6.4 Data and operations

| Activity | Frequency |
|---|---|
| Backup verification (restore, not just "the job ran") | Monthly |
| Seeded-data integrity check (counts match expectations) | Daily |
| Audit-log growth and retention review | Quarterly |
| Storage lifecycle and orphan-object reconciliation | Monthly |
| Cost review per workspace cohort | Monthly |

### 6.5 Support and feedback

- One in-product feedback channel, available from every screen, free-text, optional screenshot,
  Arabic-first.
- A public issue tracker is **not** used for student data; support tickets are handled in a system
  that satisfies the same privacy rules as the product.
- Every support request that reveals a bug becomes a test case in the automated suite.

---

## 7. Release gates (the checklist every release must pass)

A release is blocked until **all** of the following are true.

**Product integrity**
- [ ] No faked feature (all of §12 `PRODUCT_REQUIREMENTS.md`).
- [ ] Every derived figure in the release is computed from records and verified by an automated
      comparison against raw tables.
- [ ] No inert control; no placeholder toast standing in for an action.
- [ ] The release notes state, in plain Arabic and English, what changed and what is still not
      available.

**Correctness**
- [ ] Full test suite green.
- [ ] Cross-tenant matrix green.
- [ ] Migration applied to staging and verified with a data-integrity check.

**Experience**
- [ ] Arabic QA pass with zero blocking defects in the changed flows.
- [ ] Dark-mode and light-mode visual pass on every changed screen.
- [ ] Mobile pass at 320/360/768 px in both directions.
- [ ] Accessibility scan clean (zero critical).
- [ ] Empty, loading, error, and offline states exist for every changed screen.

**Security and privacy**
- [ ] No secret in the bundle; dependency audit clean.
- [ ] Logs contain no PII (asserted by a test against a seeded fixture).
- [ ] Audit events present for every mutating path in the release.
- [ ] Privacy review findings closed (for the scope of the release).

**Operations**
- [ ] Backup taken and verified.
- [ ] Feature flags default to their intended production state.
- [ ] Rollback plan written and rehearsed.
- [ ] Support briefed on what changed and what is not yet available.

---

## 8. Release cadence

| Phase | Cadence |
|---|---|
| M0 | Internal, deploy on every green main build |
| M1 | Weekly internal builds; beta releases every 2 weeks with a written changelog |
| M2 | Weekly beta builds; public beta releases every 2 weeks; hotfix releases as needed |
| M3 | Weekly; releases every 2 weeks; provider-dependent features ship on their own schedule |

**Hotfix policy:** a hotfix may bypass the 2-week cadence for a P0/P1 severity defect, but it may not
bypass the release gates. The gate list is the same for a hotfix and a feature release — with the
single exception that a full Arabic native-speaker review may be deferred to within 5 working days
for a P0-severity defect, provided an engineering Arabic-literate reviewer signs off in the interim.

**Severity definitions**

| Severity | Definition | Example |
|---|---|---|
| **P0** | Data loss, cross-tenant leak, or a lie about data | Teacher A sees Teacher B's students; attendance save silently drops records |
| **P1** | Primary flow blocked for most users | Cannot take attendance; cannot sign in |
| **P2** | Primary flow blocked for some users, with a workaround | One group type cannot be created |
| **P3** | Cosmetic or minor | A badge colour is slightly off |

---

## 9. Dependencies that can move the plan

| Dependency | Needed by | Lead time | If it slips |
|---|---|---|---|
| **Legal review of minors'-data handling** | M2 start | 4–8 weeks, external | The parent and student portals **cannot ship**. This is the single highest-risk schedule item. Mitigation: start the review at the end of M1; ship the rest of M2 in two waves (wave A: assistants, payments, QR, exports, progress; wave B: portals) so a legal delay does not block the whole tier. |
| **Email provider account** | M0 | Days | Signup is blocked without it. Mitigation: choose a provider with a sandbox that needs no commercial approval. |
| **SMS/OTP provider (Egypt numbers)** | M2 portals | 2–6 weeks, external | Portals fall back to emailed one-time links only. This is a viable M2 scope reduction. |
| **Video provider contract** | M3b | 4–12 weeks, external | F-P3-02 is deferred; no placeholder is shipped. |
| **Billing provider contract** | M3b | 4–8 weeks, external | F-P3-04 is deferred; the platform stays in a manual-subscription pilot. |
| **Virus scanning** | M1 files | Days | Files stay blocked pending a scanner; the feature can ship disabled. |
| **Recruitment of beta teachers** | M1 private beta | 2–4 weeks | M1 gate slips; the engineering work is not blocked by this, only the release. |
| **Native Arabic reviewer availability** | Every release | Ongoing | Blocks the release gate; budget for it explicitly. |

**Explicit non-dependency:** nothing in P0 or P1 requires a third-party API beyond transactional
email. This is deliberate — it keeps the first release achievable and keeps the teacher working even
when an external service is down.

---

## 10. Risk register for the plan itself

| ID | Plan risk | Impact | Mitigation |
|---|---|---|---|
| PR-1 | M1 scope creep from the prototype's full surface (exams, meetings, portals, files) | M1 slips by months | The §3.2 exclusion table is binding; any addition requires removing something of equal size. |
| PR-2 | The legal review delays the portals past M2 | The portal value proposition slips | Ship M2 in two waves; portals are wave B. |
| PR-3 | Arabic QA becomes a bottleneck at every release | Release cadence slows | Budget a standing reviewer relationship; automate screenshot diffs; maintain a glossary. |
| PR-4 | The cross-tenant test matrix is written once and then allowed to rot | A leak ships | Make the matrix generation part of the route registry so new routes are automatically covered; fail CI on an uncovered route. |
| PR-5 | Beta teachers' real data creates a privacy incident | Severe reputational and legal cost | Least privilege on staging, PII redaction in logs, encryption in transit and at rest, and a rehearsed deletion path. |
| PR-6 | M1 is demoed as "the whole app" and expectations are set too high | Support load and churn | The M1 beta invitation explicitly lists what is **not** available yet, in Arabic and English. |
| PR-7 | The video provider is chosen too late | F-P3-02 slips past the M3 window | Start the provider evaluation at the start of M3, in parallel with M3a. |
| PR-8 | Performance budgets are set against a desktop and missed on phones | The target users are hurt | Budgets are defined against a mid-range Android device from M0 and measured on a real device in CI. |

---

## 11. Definition of done (per requirement)

A requirement is "done" only when **all** of the following hold:

1. The user story is implemented end to end, including the error and edge cases listed in
   `USER_FLOWS.md`.
2. Every acceptance criterion in `PRODUCT_REQUIREMENTS.md` is verified — by an automated test where
   the criterion is automatable, otherwise by a documented manual check.
3. Server-side enforcement exists for every permission or tenant rule the requirement mentions.
4. The feature is audited where it mutates data, and the audit event has a localisation key in both
   catalogues.
5. The feature is usable in Arabic (RTL) and English (LTR), in light and dark, at 320 px.
6. The feature has real empty, loading, and error states — no inert controls.
7. Automated tests exist for the happy path, at least one error path, and the tenant boundary.
8. The feature is documented in the in-product help where it is non-obvious.
9. No §12 prohibition in `PRODUCT_REQUIREMENTS.md` is violated by it.
10. It has been through the release gates in §7.

---

## 12. Traceability

| Requirement | Flow | Milestone | Released in |
|---|---|---|---|
| F-P0-01 | — | M0 | M0 |
| F-P0-02 | F1, F2 | M0 | M0 |
| F-P0-03 | F3 | M0 | M0 |
| F-P0-04 | F3 | M0 | M0 |
| F-P0-05 | — | M0 | M0 |
| F-P0-06 | F1 | M0 | M0 |
| F-P0-07 | F9, F19 | M0 | M0 |
| F-P0-08 | F22 | M0 (scaffolding) / M2 (full) | M0, M2 |
| F-P0-09 | — | M0 | M0 |
| F-P0-10 | F7 | M0 | M0 |
| F-P1-01 | F7 | M1 | M1 |
| F-P1-02 | F5, F7 | M1 | M1 |
| F-P1-03 | F6 | M1 | M1 |
| F-P1-04 | F4 | M1 | M1 |
| F-P1-05 | F4, F10 | M1 | M1 |
| F-P1-06 | F8 | M1 | M1 |
| F-P1-07 | F9 | M1 | M1 |
| F-P1-08 | F11 | M1 | M1 |
| F-P1-09 | F12 | M1 | M1 |
| F-P1-10 | F13 | M1 | M1 |
| F-P1-11 | F14 | M1 | M1 |
| F-P1-12 | F15 | M1 (read) | M1 |
| F-P1-13 | — | M1 | M1 |
| F-P1-14 | F2 | M1 | M1 |
| F-P1-15 | — | M1 | M1 |
| F-P2-01 | F16 | M2 | M2 |
| F-P2-02 | F17 | M2 wave B | M2 |
| F-P2-03 | F18 | M2 wave B | M2 |
| F-P2-04 | F19 | M2 wave A | M2 |
| F-P2-05 | F20 | M2 wave A | M2 |
| F-P2-06 | F21 | M2 wave A | M2 |
| F-P2-07 | F7 | M2 wave A | M2 |
| F-P2-08 | — | M2 wave A | M2 |
| F-P2-09 | F17 | M2 wave B | M2 |
| F-P2-10 | F22 | M2 wave A | M2 |
| F-P2-11 | F22 | M2 wave A | M2 |
| F-P2-12 | F10 | M2 wave A | M2 |
| F-P3-01 | F23, F24 | M3a | M3 |
| F-P3-02 | F25 | M3b | M3 |
| F-P3-03 | F26 | M3a | M3 |
| F-P3-04 | — | M3b | M3 |
| F-P3-05 | — | M3a | M3 |
| F-P3-06 | — | M3b | M3 |
| F-P3-07 | — | M3a | M3 |
| F-P3-08 | F6 | M3a | M3 |
| F-P3-09 | — | M3a | M3 |
