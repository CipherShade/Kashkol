# Kashkol — Product Requirements

**Status:** Draft v0.1 · **Date:** 2026-10-21 · **Owner:** Product
**Scope of this document:** Full product specification from P0 foundation through P3 advanced features.

> This is an **implementation specification**, not marketing copy. It makes no claim about market gaps,
> differentiation, or competitive positioning. Where the product brief is silent, the resolution is
> recorded as an **Assumption** (`A-n`) in `OPEN_QUESTIONS_AND_ASSUMPTIONS.md` and cross-referenced here.
> Where a decision is taken from an explicit instruction or from the reference prototype, it is marked
> as a **Decision** (`D-n`) below.

---

## 1. Product definition

### 1.1 What Kashkol is

Kashkol is a multi-tenant SaaS for **Egyptian private teachers** who run in-person teaching groups and
sessions. A teacher uses it to manage students, groups, a recurring schedule, session attendance,
homework, paper-exam grades, parent communication, and money owed — from one workspace.

Kashkol is **Arabic-first**: Arabic/RTL is the default experience. English/LTR is fully supported as a
secondary locale. Light and dark themes are both first-class. Mobile and tablet are first-class, not
downgraded.

### 1.2 What Kashkol is not

| Explicitly out of scope | Notes |
|---|---|
| Online live meetings / video conferencing | **Never** in scope. The reference prototype contains a mock meeting room; it is a UI exploration, not a product commitment. |
| Payment gateway / card processing | Money is tracked **manually** by the teacher. Kashkol never moves money. |
| Built-in video hosting | Recorded video is delivered by an **external provider** (P3). |
| Marketplace / student–teacher discovery | Not in the brief. |
| Government school registry / national ID verification | Not in the brief; see `A-11`. |

### 1.3 Roles

| Role | Scope | Typical access |
|---|---|---|
| **Workspace owner / teacher** | One workspace | Everything inside that workspace: students, groups, schedule, attendance, grades, files, payments, settings, team, billing. |
| **Assistant** | One workspace, granted subset | Scoped by explicit permission grants (e.g. attendance + students, but no payments, no settings). Cannot invite members, cannot delete the workspace, cannot see payment data unless granted. |
| **Parent** | One workspace, one or more linked children | Read-only access only through an explicitly authorized portal route and field projection for their own child. Staff-only grades, feedback, and follow-up notes are excluded unless a specific requirement and allowlisted route authorize them. No access to other students or ability to change teacher data. |
| **Student** | One workspace, own record | Read-only view of own attendance, results, homework, files. Can mark homework submitted and upload a submission (P2). |
| **Platform administrator** | Platform-wide | Operational metadata only: workspace status, plan, aggregate counts, support tooling. **No standing access to tenant content.** Break-glass content access is explicit, time-boxed, and audited (`D-13`). |

### 1.4 Tenancy model

- The **workspace** is the unit of tenancy. Every teacher owns exactly one workspace in P1.
- **Every tenant-scoped row carries a `workspace_id`.** There is no global student table.
- Isolation is enforced **server-side** in the data-access layer, not in application code paths and
  not by hiding UI elements. (`D-12`)
- Isolation is treated as a **release blocker**, verified by automated cross-tenant tests that run on
   every build (see `F-P0-01` and the release gates in `RELEASE_PLAN.md` §7).

---

## 2. Language, locale, direction, and theming

| Concern | Rule |
|---|---|
| Default locale | `ar` (Arabic). English is secondary. (`D-01`) |
| Default direction | `rtl` for `ar`, `ltr` for `en`. (`D-01`) |
| Direction handling | Layout uses CSS logical properties only (`inset-inline-*`, `padding-inline-*`, `border-inline-*`, `margin-inline-*`, `text-align: start/end`). No `left`/`right` for layout. |
| Numbers | Arabic locale may use Arabic-Indic digits; **phone numbers, phone inputs, and share codes always render LTR** (`dir="ltr"`), as the prototype already does for phone fields. |
| Dates | Week start **Saturday** (`A-02`). Gregorian, `en-GB` / `ar-EG` formatting conventions. |
| Theming | Light and dark both shipped. Default follows OS preference; user override persists. (`A-13`) |
| Typography | UI font **Manrope**, display font **Manrope**, Arabic font **Cairo** — the 2026 visual system (`ADR-0023`). Arabic overrides display/UI font to Cairo with `letter-spacing: 0` and no uppercase transform on labels. |
| Content | Teacher-authored content (student names, group names, homework titles, notes) is stored **untranslated** and displayed as entered. Only system/UI strings are localized. |

### 2.1 Design tokens (the Kashkol canvas, `ADR-0023`)

The token architecture is unchanged: one CSS custom-property layer, a real light/dark swap, and
logical properties everywhere. The 2026 visual refresh replaces the prototype's green palette and
typography with the canvas below. The reference prototype remains read-only and its defects
(`DEF-01`–`DEF-23`) are not carried forward.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#ECECE6` | `#08080A` | Canvas behind the floating frame |
| `--panel` | `#FBFBF8` | `#0F0F11` | The main floating panel |
| `--surface` | `#FFFFFF` | `#131315` | Cards, sidebar rail, top bar, modals |
| `--surface-2` | `#F5F5F1` | `#1B1B1E` | Inset rows, hover, table header, progress track |
| `--ink` | `#0B0B0D` | `#F4F4F6` | Primary text |
| `--muted` | `#6E6E76` | `#9B9BA4` | Secondary text |
| `--muted-2` | `#8B8B93` | `#73737C` | Tertiary text, table headers, empty-state icons |
| `--border` | `#E5E5DF` | `#232326` | Dividers, card borders |
| `--border-strong` | `#D3D3CB` | `#303035` | Input borders, strong separators |
| `--primary` | `#4F6BF5` | `#6D8BFF` | Primary actions, active rail item, KPI accent |
| `--primary-strong` | `#3B55D9` | `#8EA6FF` | Primary hover, active text |
| `--primary-tint` | `#EDF0FF` | `#1A2141` | Selected rows, active nav background, tinted KPI |
| `--accent` | `#F0A35E` | `#F0AD6C` | Secondary accent and planned-step marker |
| `--accent-tint` | `#FDF0E4` | `#2C2218` | Accent backgrounds |
| `--success` | `#2F9E6B` | `#58C79A` | Present / success badges and KPI |
| `--danger` | `#DC5A5A` | `#F07C7C` | Absent / destructive |
| `--warn` | `#D4932F` | `#E7B45C` | Late / at-risk |
| `--chart-1`–`--chart-6` | blue, green, orange, yellow, coral, violet | brightened equivalents | Data visualisation only |
| `--card-invert-bg` / `--card-invert-ink` | ink on paper | paper on ink | The inverted feature statistic |
| `--radius-sm/md/lg/xl` | `10 / 16 / 22 / 28` px | same | Component radii |
| `--shadow-card` / `--shadow-md` | soft inset highlight + long shade | stronger shade | Card and floating-panel elevation |
| `--rail-width` / `--shell-gap` / `--content-max` | `86 px` / `16 px` / `1360 px` | same | Shell geometry |

**Status → colour mapping** (retained from the semantic contract): `active` → success, `at_risk` →
warn, `inactive` → danger. A KPI or filter card may use the matching semantic tint, but its label is
always visible, so colour is never the only meaning.

**Attendance mark → colour mapping:** `present` → success, `late` → warn,
`absent` → danger, `excused` → neutral (`--surface-2` + `--ink`).

**Theme implementation requirement:** dark mode must be a **real token swap** driven by
`[data-theme="dark"]` on the document root, with the same values available through the
`prefers-color-scheme` fallback when the user chose `system`. No component may hardcode a colour
outside the token set. The older `--color-*` names remain as aliases that resolve through these
tokens until the remaining screens are migrated.

---

## 3. Domain model (conceptual)

```
Workspace
 ├── Membership (user_id, workspace_id, role, permission_grants)
 ├── Settings (thresholds, locale, theme, timezone, currency)
 ├── Subject
 ├── Group (subject_id, grade, room, color, weekly_slot{day,time})
 │    └── Enrollment (student_id, group_id, enrolled_at, left_at)
 ├── Student (name, grade, phone, parent_contact, join_date, status)
 │    ├── AttendanceMark (session_id, student_id, mark, recorded_by, recorded_at)
 │    ├── HomeworkSubmission (homework_id, student_id, status, submitted_at)
 │    ├── Grade (assessment_id, student_id, score, max_score)
 │    ├── Note (author_id, text, created_at)
 │    ├── Payment (period, amount, method, recorded_by, recorded_at)
 │    └── FileGrant (file_id, student_id)   // student-scoped visibility
 ├── Session (group_id, date, time, status, cancelled_at)
 │    └── SessionRevision (session_id, actor_id, reason, created_at)  // corrections
 ├── Homework (group_id, title, instructions, due_date)
 ├── Assessment (paper) (group_id, title, date, max_score)
 ├── AssignmentRecord / AssessmentScore
 ├── AttendanceToken (group_id, token_hash, expires_at, rotated_at)
 ├── Message (channel, template_type, student_id|group_id, body, created_by)
 ├── File (scope, group_id|student_id, storage_key, size, mime, scan_status)
 ├── VideoAsset (provider, provider_asset_id, url, duration)   // P3
 └── AuditEvent (actor_id, workspace_id, entity, entity_id, action, diff, created_at)
```

**Key modelling decisions**

| ID | Decision |
|---|---|
| `D-03` | A **Group** carries a recurring weekly slot (weekday + start time + room). A **Session** is a single dated occurrence of a group. Sessions are materialised per group for a rolling horizon and are individually editable/cancellable without mutating the group's slot. |
| `D-04` | Attendance marks are exactly four: `present`, `absent`, `late`, `excused`. |
| `D-05` | Student status (`active` / `at_risk` / `inactive`) is **derived**, never stored as truth. It is recomputed from consecutive absences against workspace thresholds (prototype default `at_risk ≥ 2`, `inactive ≥ 4`) whenever attendance changes. The derived value may be cached but the source of truth is the attendance record. |
| `D-06` | `excused` does **not** count toward the absence streak and does **not** count in the attendance denominator (see `A-05`). |
| `D-07` | A student may be enrolled in multiple groups. The prototype's single `groupId` per student is **not** carried forward as a constraint; group-scoped data (attendance, homework, grades) is always scoped by enrolment. |
| `D-08` | Attendance percentage is **computed from records**, never seeded, random, or estimated. (`A-05`) |
| `D-09` | Homework submissions are explicit records with a status, not an array of booleans carried on the homework row. |
| `D-10` | **Session corrections never destroy history.** Every attendance write creates an immutable revision entry recording actor, timestamp, prior value, and new value. The current value is the head of the revision chain. |
| `D-11` | "Quiz" in the prototype maps to **paper assessment with manual grade entry** in the brief. Kashkol uses the term *Assessment (paper)* to distinguish it from the P3 online exam. (`A-06`) |
| `D-14` | Payments are **records of money the teacher received**, entered manually: student, period covered, amount, method, date, note. Kashkol performs no reconciliation and no settlement. **Superseded by `ADR-0028`** (2026-11-13): the record is now a session receipt (session, amount, method, date, note); the per-student ledger is removed. |
| `D-15` | Files have exactly three visibility scopes: `teacher_only`, `groups`, and `students`. Group/student targets are explicit tenant-scoped associations and may contain multiple targets. Parents/students must also have a live explicit portal grant for the assigned student. |
| `D-16` | Messages are **prepared drafts** plus an optional record of the teacher opening them. Kashkol never asserts delivery. (`F-P1-10`) |

---

## 4. Priority tiers

| Tier | Meaning | Target |
|---|---|---|
| **P0 — Foundation** | The non-negotiable substrate: tenancy, auth, i18n/RTL, theming, design system, data model, audit, security. Nothing user-facing ships without it. | M0 |
| **P1 — First usable release** | The smallest set a real teacher can run their teaching week on: students, groups, schedule, attendance with corrections, homework, paper grades, parent updates, files, a usable dashboard, minimal reports. | M1 (public beta) |
| **P2 — Expansion** | Multi-user and multi-audience: assistants with real permissions, parent portal, student portal, manual payments, notifications, QR attendance, progress & follow-up, exports, data portability. | M2 |
| **P3 — Advanced** | High-cost / external-dependency / later-phase: online exams, recorded video via external provider, admin console, subscription & billing, scale hardening. | M3+ |

**Scope discipline rules**

1. P1 contains **no** feature that requires a second human role. A teacher alone can run a full week.
2. P1 contains **no** outbound network call except transactional email for authentication.
3. P1 contains **no** money, camera, or video capability.
4. Any feature that cannot be built with **real** behaviour in its tier is **deferred**, never faked
   (§12).

---

## 5. P0 — Foundation requirements

> Acceptance criteria are written to be directly testable. "Given/When/Then" style. Every AC is
> automatable or manually verifiable with a stated method.
>
> **Citation convention.** A criterion is cited elsewhere in this documentation as
> `F-P0-01` AC-3, meaning criterion 3 of that flow's numbered acceptance-criteria list below. The
> numbering is positional and stable: adding a criterion in the middle renumbers the ones after
> it, so a citation is only valid against the document version it was written against.

### F-P0-01 — Multi-tenant workspace isolation

**User story:** As a teacher on a paid plan, I want my students' data to be invisible to teachers in
other workspaces, so that I can trust the platform with my students' personal information.

**Dependencies:** DB schema with `workspace_id` on all tenant tables; identity provider; RLS or
equivalent repository-level scoping.

**Acceptance criteria**
1. Every tenant-scoped table has a non-null `workspace_id` column with an index; enforced by a schema
   migration check that fails CI if a new tenant table lacks it.
2. All reads and writes of tenant data go through a data-access layer that takes the caller's
   `workspace_id` from the **session**, never from a request parameter.
3. Automated test suite contains a matrix of cross-tenant attempts (direct URL with another
   workspace's student id, session id, group id, file id, export) that all return `404`/`403` and
   **never** leak another workspace's row in the response body.
4. File download URLs are short-lived signed URLs scoped to the owning workspace; a signed URL from
   workspace A returns `403` when presented while authenticated to workspace B.
5. A platform administrator cannot read tenant content through any normal application path; the only
   path is the audited break-glass flow (`F-P3-05`).
6. Isolation test suite runs on every CI build and blocks merge on failure.

**Risks:** A single unscoped query in one endpoint compromises the whole product's trust claim.
Mitigation: repository-layer scoping + RLS + a test that enumerates every route against a foreign
workspace.

---

### F-P0-02 — Authentication and session management

**User story:** As a teacher, I want to sign in securely on my phone and stay signed in, so that I do
not have to log in before every session I teach.

**Dependencies:** Email delivery provider (transactional email); password hashing; session store.

**Acceptance criteria**
1. A teacher can register with email + password; password rules enforced server-side (min 10 chars,
   breached-password check against a public list).
2. Email verification is required before the workspace is marked active; unverified accounts cannot
   create data but can sign in to a "verify your email" state.
3. Sign-in issues a server-side session stored in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. The
   session token is **never** in `localStorage` and **never** in a URL.
4. Sessions expire after 30 days of inactivity (sliding) and absolutely after 90 days. Idle timeout
   is 12 hours.
5. Sign-out invalidates the session server-side immediately (not just cookie-cleared).
6. "Sign out everywhere" invalidates all sessions for that user.
7. Rate limiting: 5 failed sign-in attempts per account per 15 minutes → temporary lockout with a
   generic message (no account-existence disclosure). IP-based throttle on sign-up.
8. Password reset via emailed single-use link, valid 30 minutes, invalidated on use.
9. All auth events (sign-in, sign-out, failed attempt, password change, reset) are written to the audit
   log with actor and IP.
10. No authentication secret, API key, or service credential is present in any client bundle.

---

### F-P0-03 — Internationalisation, RTL, and locale-aware formatting

**User story:** As an Arabic-speaking teacher in Cairo, I want the entire interface in Arabic, reading
right-to-left, so the app feels native to me.

**Dependencies:** P0-01 identity; translation catalogue; font loading.

**Acceptance criteria**
1. Every user-facing string resolves from a message catalogue; there are no hardcoded literals in
   component code (enforced by an i18n lint rule that fails CI).
2. Switching locale updates direction, all layout, all icons that carry direction (e.g. the
   "back" chevron flips), and all locale-formatted values **without a page reload and without losing
   in-progress form state**.
3. The default locale for a new account is Arabic; the language switch is reachable from the top bar
   and from Settings (both must work).
4. All layout uses CSS logical properties; an automated check confirms no layout-affecting
   `left`/`right`/`margin-left`/`margin-right`/`padding-left`/`padding-right`/`text-align: left|right`
   declarations exist outside of a documented allowlist.
5. Arabic renders in **Cairo**; UI and Latin display text render in **Manrope** (`ADR-0023`).
   Arabic headings have `letter-spacing: 0` and are never `text-transform: uppercase`.
6. Dates, numbers, and percentages format per locale. Phone numbers, share codes, and exam codes
   render LTR inside RTL text.
7. Missing-translation fallback is English; a missing key never renders as a raw key in production —
   a CI check enumerates `ar`/`en` catalogues and fails on any key present in one and absent in the other.

---

### F-P0-04 — Theme system (light / dark / system)

**User story:** As a teacher who teaches at night, I want a dark theme so the screen is not glaring.

**Dependencies:** P0-03; token set.

**Acceptance criteria**
1. Theme values: `light`, `dark`, `system`. Default `system`.
2. The selected theme persists per user across sessions and devices and is applied **before first
   paint** (no light flash when dark is selected).
3. All colours resolve from tokens; there are no hardcoded hex values in components (CI check).
4. Every screen, modal, table, chart, toast, popover, and empty state has been visually reviewed in
   both themes; contrast of body text against its surface meets WCAG AA (4.5:1) in both themes.
5. `prefers-color-scheme` is respected when theme is `system`.
6. Charts and progress bars use theme-aware tokens and remain legible in dark mode.

---

### F-P0-05 — Design system primitives

**User story:** As a product team, we want one implementation of buttons, inputs, tables, and modals so
the app behaves identically everywhere and is cheap to extend.

**Dependencies:** P0-03, P0-04.

**Acceptance criteria**
1. Primitives exist for: Button (primary/secondary/danger, md/sm/icon-only), Input, Textarea, Select,
  Card, Badge, Avatar, ProgressBar, Modal, Tabs, Toast, EmptyState, Table, Tooltip, and the
  hand-rolled thin-stroke Icon set.
2. Every interactive primitive has a visible `:focus-visible` ring using `--primary` (prototype uses
   `2px solid` + `2px` offset) and a minimum tap target of **44×44 px** on touch breakpoints.
3. Every primitive renders correctly at 320 px, 375 px, 768 px, 1024 px, and 1440 px widths, in both
   directions and both themes.
4. Modals trap focus, close on `Escape`, close on backdrop click, restore focus to the trigger, and
   scroll internally on short viewports.
5. Toasts stack, auto-dismiss after 2.6 s (prototype behaviour), and never overlap the primary action
   area on mobile.
6. Icons are inline SVG components (no icon font, no runtime SVG sanitisation risk) with
   `aria-hidden` unless they are the only accessible label.
7. All i18n-sensitive primitives (e.g. `Last name` placeholder in the prototype's add-student modal)
   are replaced by catalogue strings — no English literals remain in the Arabic UI.

---

### F-P0-06 — Workspace creation and settings

**User story:** As a new teacher, I want to set up my teaching identity and thresholds in one place, so
that Kashkol reflects how I actually run my classes.

**Dependencies:** F-P0-01, F-P0-02.

**Acceptance criteria**
1. On first sign-in, the teacher is prompted to create a workspace with: workspace/display name,
   teaching name, primary subject, and grade level(s) taught.
2. The first workspace is created atomically with the teacher as `owner`; a partial failure leaves no
   orphaned workspace.
3. A user account always has exactly one active workspace in P1 (multi-workspace switching is P2).
4. Workspace settings include: teaching display name, attendance thresholds (`at_risk_after`,
   `inactive_after`), locale, theme, timezone, currency.
5. Threshold validation: both integers, `1 ≤ at_risk_after < inactive_after ≤ 10`; the form shows an
   inline error and the server rejects invalid values.
6. Changing thresholds triggers a **recomputation** of derived student status for all students in the
   workspace, and the change is audited.
7. Settings are stored server-side and load on any device; they are not browser-local.

---

### F-P0-07 — Audit log (immutable, server-side)

**User story:** As a workspace owner, I want a record of who changed what and when, so that when my
assistant makes a mistake I can see exactly what happened.

**Dependencies:** F-P0-01, F-P0-02.

**Acceptance criteria**
1. Every mutating action writes an audit event **server-side** containing: actor (user id + display
   name snapshot), workspace, entity type, entity id, action key, before/after diff (JSON Patch or
   field-level), timestamp (UTC), and request id.
2. Audit events are **append-only**. There is no update or delete path in the application, and no API
   exposes one.
3. Covered actions at minimum: student create/update/archive/import; group create/update/archive;
   session create/edit/cancel; attendance save and **every correction**; homework create/update;
   assessment create and **every score change**; file upload/share/delete; message prepare/open;
   payment create/amend/delete; team invite/permission change/remove; settings change; auth events.
4. The Activity Log screen lists events newest-first with actor, action, target, and relative time, and
   supports filtering by actor and by entity type.
5. Audit events are visible to the workspace owner and to assistants **only if** they hold the
   `settings` permission.
6. Audit events are retained for the lifetime of the workspace and are included in a workspace export.
7. Audit event payloads never contain secrets, passwords, raw session tokens, or full file contents.
   Free-text note bodies are redacted from the diff and referenced by id.

---

### F-P0-08 — Privacy, data minimisation, and portability groundwork

**User story:** As a parent or student whose data Kashkol holds, I want to know what is stored and be
able to get it out, so that I can exercise my rights.

**Dependencies:** F-P0-01, F-P0-07.

**Acceptance criteria**
1. The system collects only what a listed feature requires. No national ID number, no date of birth,
   no biometric data, no precise location, no religion/political data. (`A-11`)
2. A workspace can export all of its data as a machine-readable archive (JSON) including the audit log
   and the schema version of the export.
3. A workspace owner can request deletion of the workspace and all contained data; the request is
   queued, confirmed, executed, and recorded.
4. Deletion cascades to all child records (attendance, grades, payments, files, messages, sessions)
   and to stored file objects; the audit log is retained for a legally-defensible retention period
   and then purged.
5. Every file object has a retention/lifecycle policy; deleting a file removes the storage object
   within a bounded window, verified by a scheduled reconciliation job.
6. Logs, error reports, and analytics never contain student names, phone numbers, note bodies, or
   message bodies. A redaction test asserts this against a seeded fixture.
7. A published privacy notice and, if/when Kashkol is offered in the Egyptian market, a
   localised Arabic version of it, exist before P2 launch. **Legal review is required and is not
   performed by this document.**

---

### F-P0-09 — Platform and infrastructure baseline

**User story:** As the platform, we need a deployable, observable, and reversible baseline, so that
releases are safe and incidents are diagnosable.

**Dependencies:** none (but everything depends on it).

**Acceptance criteria**
1. Three environments: `local`, `staging`, `production`, with staging seeded by a synthetic dataset
   that contains no real personal data.
2. Migrations are forward-only, versioned, and reversible-by-roll-forward with a documented
   compensating migration; the CI pipeline refuses to start without a migration for a schema change.
3. Automated backups of the database (daily, 35-day retention) and of file storage (daily, 35-day
   retention) exist, and a **restore drill** from backup is executed at least monthly with a recorded
   result.
4. Health checks (`/healthz`, `/readyz`), structured JSON logs with a request id, and error tracking
   with source maps are in place.
5. Uptime and error-rate alerting exists for authentication, the attendance write path, and file
   download.
6. Every environment's secrets live in a secret manager; no secret is in the repository. CI fails on
   detected secrets.
7. The production deploy is a single command, is reversible within 10 minutes, and does not require a
   data migration that cannot be rolled back.

---

### F-P0-10 — Notifications substrate (in-app only)

**User story:** As a teacher, I want the app to tell me when something needs my attention, so that I do
not have to check every screen.

**Dependencies:** F-P0-01, F-P0-07.

**Acceptance criteria**
1. An in-app notification entity exists with: type, severity, optional target entity, read flag,
   created_at, and a locale-independent message key.
2. Notifications are generated **server-side** by rules (e.g. student crosses the at-risk threshold,
   homework due in 48 h, a group has no attendance recorded for a past session), not by client
   computation.
3. The top bar shows an unread count badge; the panel lists notifications newest-first with unread
   highlighting and a "mark all read" action.
4. Reading a notification is per-user state and is stored server-side, so the count is consistent
   across devices.
5. No push, SMS, or email notification is sent in P1 (transactional auth email only). Adding a new
   notification type requires a translation key in both catalogues.

---

## 6. P1 — First usable release requirements

**Release goal (M1):** a teacher with one workspace can import their students, define their groups and
weekly schedule, run a full week of in-person sessions recording attendance (with corrections),
assign homework and record paper-exam grades, share PDFs with a group, prepare a parent update, and
see a truthful dashboard — entirely in Arabic on a phone.

### F-P1-01 — Dashboard

**User story:** As a teacher, I want to open the app and immediately see today's sessions, what's
unrecorded, and who needs attention, so that I start my day oriented.

**Dependencies:** Students, groups, sessions, attendance, homework, assessments.

**Acceptance criteria**
1. Greeting reflects time of day in the active locale (morning / afternoon / evening) and addresses the
   signed-in teacher by their workspace display name — not a hardcoded name.
2. Four stat tiles: expected students today, attendance recorded today (as a percentage of students
   **marked so far**, or `—` when nothing is marked), homework completion rate (current term), and
   average assessment score.
3. Every tile is **computed from records**. No seeded, random, or placeholder values.
4. "Today's sessions" lists each of today's sessions sorted by start time, showing group name, start
   time, room, and expected student count, with a direct action to take attendance.
5. If no sessions are scheduled today, an explicit empty state is shown ("No sessions scheduled
   today"), not a blank card.
6. "Needs your attention" lists students flagged by the current rules, each linking to the student's
   profile, with the reason chips displayed.
7. "Upcoming deadlines" lists homework due dates and assessment dates not in the past, sorted
   ascending, each with its group.
8. "Quick actions" provide one-tap access to: add student, create session, take attendance, add
   homework, create assessment, contact parent. On mobile this row scrolls horizontally without
   wrapping.
9. The dashboard renders correctly from 320 px to 1440 px, in both themes and both directions.
10. The weekly attendance chart plots **real per-day attendance rate** for the displayed week; if a
    day has no sessions, it plots as empty rather than a fabricated value.

---

### F-P1-02 — Students: directory, create, edit, archive

**User story:** As a teacher, I want a searchable list of my students with their key numbers, so that
I can find any student in seconds during a lesson.

**Dependencies:** F-P0-06, F-P1-05 (groups).

**Acceptance criteria**
1. The students list shows: avatar + name, group(s), attendance rate with a progress bar, status
   badge, average assessment score, parent contact name.
2. Filters: by group, by status, by grade, and free-text search matching name (and phone, P2).
   Filters combine with AND.
3. The top-bar search box filters this list and the groups list. It does **not** silently affect
   unrelated screens.
4. Creating a student captures: first name, last name (both required), grade, phone, parent name,
   parent phone, and group enrolment. All fields are in the active locale.
5. Validation is server-side: required fields, phone format (Egyptian mobile `01[0125]…` or
   international `+…`), and parent phone optional. Errors are shown inline in Arabic.
6. **Editing** a student updates the record and writes an audit event with a field-level diff.
   (The prototype's edit-student modal does not persist — this is fixed here.)
7. Archiving a student (rather than deleting) preserves their historical attendance, grades, and
   payments; archived students are excluded from rosters and defaults but remain in reports and
   exports, and can be filtered with a "show archived" toggle.
8. Student status is shown as a derived badge (`active` / `at risk` / `inactive`) and reflects the
   current thresholds.
9. The list is paginated or virtualised; a workspace with 1,000 students must not degrade the
   teacher's phone.
10. Empty state distinguishes "no students yet" from "no students match these filters", and offers the
    corresponding next action (add student / clear filters).

---

### F-P1-03 — CSV import of students

**User story:** As a teacher migrating from a spreadsheet, I want to import my existing student list, so
that I don't have to type 120 rows.

**Dependencies:** F-P1-02, F-P0-07.

**Acceptance criteria**
1. Accepts `.csv` (UTF-8, with or without BOM) and `.xlsx`. Column auto-detection recognises at
   minimum: `name` / `fullName` / `الاسم`, `phone` / `رقم`, `parentPhone` / `رقم ولي الأمر`,
   `groupName` / `المجموعة`, `grade` / `الصف`.
2. A **preview** is shown before commit: matched columns, per-row validation errors, rows that will be
   created, rows that would be **updated** (matched on name + phone within the workspace), and rows
   skipped.
3. Unknown group names create the group (with a "created" marker) or are flagged for the teacher to
   map to an existing group — the teacher chooses per-mapping; the system never silently discards
   students.
4. Import is atomic per batch by default (all-or-nothing) with an explicit "import valid rows only"
   option that records skipped rows in an error report downloadable as CSV.
5. A max of 5,000 rows per import; larger files are rejected with a clear message.
6. Every import writes one audit event per batch with row counts, plus the mapping applied.
7. Arabic column names and Arabic content are preserved exactly (no mojibake, no encoding damage).
8. Downloadable Arabic and English CSV **templates** are provided.

---

### F-P1-04 — Groups and roster

**User story:** As a teacher who runs several classes, I want a group per class with its schedule and
room, so that sessions and rosters are organised.

**Dependencies:** F-P0-06, F-P1-02.

**Acceptance criteria**
1. A group has: name, subject, grade, room, colour, and a recurring weekly slot (weekday + start time
   + optional end time + optional teacher note).
2. A group's name defaults to a composed label (e.g. `Physics — Saturday 4 PM`) but is fully editable.
3. Group cards show subject, name, schedule, room, and enrolled student count; they are arranged in a
   responsive grid (1 column ≤ 480 px, 2 columns ≤ 900 px, 3+ above).
4. Opening a group shows: roster table (name, attendance %, status), upcoming sessions, and actions to
   add a session for this group and to enrol/unenrol students.
5. Enrolling a student in a second group keeps both rosters consistent; group-scoped attendance and
   grades are recorded per group.
6. A group can be archived; its history is retained and it disappears from pickers.
7. A **conflict warning** is shown when a new slot overlaps an existing group slot for the same
   workspace (the teacher may still confirm).
8. Group colour is chosen from a fixed accessible palette and is used consistently as the accent on
   session rows and cards (as in the prototype).

---

### F-P1-05 — Schedule and sessions

**User story:** As a teacher, I want my week laid out as a calendar, so that I know what I am teaching
and can reschedule a single lesson.

**Dependencies:** F-P1-04.

**Acceptance criteria**
1. A week view shows seven day columns starting **Saturday** (`A-02`), each listing that day's
   sessions with time, group name, expected count, and quick actions.
2. The prototype's week-view inconsistency (grid labels ordered Sunday-first while `startOfWeek` uses
   `getDay()`, and seeded groups scheduled on Saturday/Monday) is **resolved** in favour of a
   Saturday start, with the grid, the "previous/next" navigation, and the generated sessions all
   agreeing.
3. Navigation: previous week / this week / next week, plus a "Today" shortcut. The current week is
   highlighted and today's column is visually distinguished.
4. Sessions are auto-generated from group weekly slots for a rolling horizon (default 4 weeks ahead,
   configurable) and are individually editable (date/time/group) and cancellable.
5. Cancelling a session does **not** delete the group slot and is marked as cancelled rather than
   removed, so that history stays explainable. A cancelled session is excluded from attendance and
   from attendance-rate denominators.
6. Creating a one-off session outside the regular slot is supported.
7. Timezone is explicit: sessions are stored with a UTC instant plus the workspace timezone for
   display; the prototype's `toISOString()` UTC-shift bug (dates can be off by one around midnight in
   `Africa/Cairo`) must not occur.
8. On mobile, the week view becomes a single-column agenda list grouped by day, with a day picker.
9. A past session with no attendance recorded is visibly marked as **unrecorded** and appears in the
   teacher's to-do list.

---

### F-P1-06 — Manual attendance

**User story:** As a teacher at the start of a session, I want to mark each student present, absent,
late, or excused in a few taps, so that my records are accurate without slowing the lesson.

**Dependencies:** F-P1-05, F-P1-02.

**Acceptance criteria**
1. Two-pane layout on tablet/desktop: a scrollable session picker on the side, and the roster on the
   main canvas. On mobile it becomes a stacked flow: pick session → mark roster.
2. The roster is the group's **enrolled students** for that session. Students enrolled mid-week are
   included; students archived before the session date are excluded.
3. Each student row offers exactly four marks: present, absent, late, excused. The selected mark is
   visually distinct via the status colour and is exposed to assistive technology as a radio group.
4. "Mark all present" sets every unmarked row to present and is undoable.
5. The roster shows a live count of marked/unmarked students and the running attendance rate for the
   session.
6. Saving persists **all** marks for the session in one atomic server-side transaction and shows a
   success toast; the saved state is reflected immediately in the session list, dashboard, and student
   profile.
7. Attendance can be re-saved for the same session, which **creates a revision** rather than
   overwriting silently (see F-P1-07).
8. The picker lists recent and upcoming sessions (prototype window: from 3 days ago, 24 items) and
   shows a check mark for sessions already recorded, a "Today" badge for today's, and the group colour
   dot.
9. A student who has never been marked is excluded from the attendance rate denominator and shown as
   "not recorded" — never silently counted as absent.
10. With 60 students in a roster, scrolling and tapping remains responsive on a mid-range Android
    phone (no input lag beyond 100 ms per mark).
11. Attendance is the **only** path to compute attendance rate; the prototype's stored-and-never-
    recomputed `attendancePct` field is removed as a source of truth.

---

### F-P1-07 — Attendance corrections and history

**User story:** As a teacher, I marked a student absent by mistake, so I want to correct it and still
see that a correction happened.

**Dependencies:** F-P1-06, F-P0-07.

**Acceptance criteria**
1. Re-opening a recorded session and changing a mark creates an **immutable revision** capturing:
   student, session, old mark, new mark, actor, timestamp, and an optional free-text reason.
2. Revision history is visible on the session (per-student "history" affordance) and on the student
   profile's Attendance tab, showing the current mark plus a dated list of corrections.
3. The current value shown everywhere is the head of the revision chain; the chain itself is never
   mutated or deleted.
4. **Bulk correction**: the teacher can select multiple students and apply one mark, and each change
   creates its own revision attributed to the same actor and batch.
5. A correction never changes the **attendance rate denominator** retroactively: excused remains
   excluded, and a mark changed from absent to present changes the rate from that session forward in
   the recomputation.
6. Every revision is written to the audit log with a field-level diff.
7. A session whose attendance was corrected shows a distinct badge ("corrected") in the session list
   and on the student's attendance history, with the correction date.
8. Corrections are available to the owner and to assistants holding the `attendance` permission; a
   correction made by an assistant is attributed to that assistant.

---

### F-P1-08 — Homework

**User story:** As a teacher, I want to assign homework to a group and track who submitted, so that I
know who is keeping up.

**Dependencies:** F-P1-04.

**Acceptance criteria**
1. Create a homework item: title (required), group or selected students, due date, instructions
   (optional), and optional permitted resources. A resource must be an existing clean file that the
   teacher may access and share with every assigned student.
2. Every assigned student has a **submission record** with status `not_submitted` / `submitted` /
   `late` / `excused`, plus optional teacher feedback, optional grade, and optional submitted-at
   timestamp. The current teacher workflow records status manually; it does not accept online file
   submissions.
3. The teacher can mark each student's record individually. A bulk action, if added, must write an
   individual submission record per student (never a single shared boolean).
4. Each homework card shows group, title, due date, and a completion bar with `submitted/assigned`
   count and a percentage.
5. The group completion rate shown on cards and on the dashboard is computed from submission records,
   not from a stored float.
6. Homework can be edited (title, instructions, due date) and archived; archives keep history.
7. In the prototype, `submittedIds` only ever came from seeded random data and there was no way to
   record a submission — this is the gap this feature closes.
8. A student/parent sees only their own submission status (P2 portal) and only for homework assigned
   to a group they are enrolled in.
9. The session attendance screen shows the **latest active homework** for the session's group and,
   per student, a one-tap **yes / no** answer to "did they do the homework". The answer is stored as
   a `homework_completion_mark` row (`completed` / `not_completed`) linked to that session, upserted
   per (homework, student). It is written in the same transaction as its audit event. An absent mark
   means **not recorded** — the UI shows the answer only after the teacher taps; it never defaults to
   a claimed answer. When the group has no active homework, the whole question is hidden; the
   attendance screen never fabricates a homework context. The chips render only for members with
   `homework:write` (same server-side gate the payment toggle uses); other members do not see them,
   and the gate is enforced server-side, not by the client.

---

### F-P1-09 — Paper assessments and grade entry

**User story:** As a teacher, I want to enter the marks from a paper exam I graded myself, so that
progress is tracked over the term.

**Dependencies:** F-P1-04.

**Acceptance criteria**
1. Create a paper assessment or quiz: title, group, date, assessment type, maximum score (default
   100), and optional note. The prototype's "Quiz" entity maps to this (`A-06`).
2. Score entry shows the group roster and per-student result status: `graded`, `missing`,
   `excused`, or `not_taken`. A graded result has a numeric score; `0 ≤ score ≤ max_score` unless
   the assessment has an explicitly configured extra-credit allowance (additional points, disabled
   by default). A live group average and highest/lowest are shown.
3. Scores save individually as typed (debounced, per-student) and are idempotent — re-entering the
   same value does not create a spurious audit event.
4. Every score **change** creates an audit event with the old and new value, so a corrected mark is
   distinguishable from the original. The audit entry is the teacher's only proof of a mark change.
5. A student's average per group and overall is the arithmetic mean of the graded assessment
   percentages (`score / max_score`). `missing`, `excused`, and `not_taken` results are excluded,
   never treated as zero. If there are no graded results, the average is `—`.
6. An assessment can be locked ("marks final"), after which edits require an explicit unlock that is
   itself audited.
7. Scores are never negative and never exceed the configured maximum plus allowance; the server and
   database enforce both and the UI shows an inline error.

---

### F-P1-10 — Parent updates via prepared WhatsApp message (no delivery claim)

**User story:** As a teacher, I want to prepare an accurate attendance or results update for a parent
and send it from my own WhatsApp, so that parents hear from me without me retyping numbers.

**Dependencies:** F-P1-06, F-P1-09, F-P1-08.

**Acceptance criteria**
1. Message types: attendance update, homework reminder, assessment result, progress report, group
   announcement, and free-text custom message.
2. Selecting a type and a student (or a group for announcements) **pre-fills a draft** from real
   record data. The teacher may edit the draft before sending.
3. The action opens WhatsApp on the teacher's device with the parent number and the draft text
   prefilled, using a `wa.me` deep link. On desktop, a copy-to-clipboard fallback is offered.
4. The UI labels this action **"Open in WhatsApp"** and the resulting record states **"opened in
   WhatsApp"**. Kashkol **never** shows "sent", "delivered", or "read" for a parent message, because
   the platform cannot observe any of those. (Non-negotiable — see §12.)
5. Phone numbers are normalised to **E.164** (`20` + Egyptian national number). The prototype's
   `wa.me/2` + already-`01`-prefixed concatenation produces a malformed number; this is fixed.
6. If a parent phone is missing or malformed, the button is disabled with an explanatory inline
   message and the teacher can still copy the message text.
7. Each prepared message is saved as a **draft record** with the type, student/group, and body, so the
   teacher can see what was prepared. The draft is visible only to workspace staff.
8. The draft body uses real values from records and re-generates if the underlying data changes
   before the teacher opens WhatsApp (the draft is rebuilt from the record at open time, not a frozen
   snapshot).
9. Group announcements do not include a specific parent phone in the link; the teacher sends to a
   group chat.

---

### F-P1-11 — Files and PDFs

**User story:** As a teacher, I want a private library of organized learning materials, so I can
share each document only with the intended class or student.

**Dependencies:** F-P0-01, F-P1-04.

**Acceptance criteria**
1. Upload and organize a file with a title, description, subject/topic, uploader, workspace, and one
   access scope: **teacher-only**, **selected groups**, or **selected students**. A file may target
   multiple groups or students.
2. Accepted types: PDF, images (PNG/JPG), and document formats (DOCX/XLSX/PPTX). Max size 25 MB.
   Extension, declared MIME type, and file signature are validated; executables and unsafe Office
   archives are rejected with a clear Arabic message.
3. Every upload is virus-scanned by the configured private scanner; a file is not downloadable
   until the scan passes. A detected file is blocked; scanner failure leaves it pending and
   non-downloadable with a retry action.
4. The file list shows title, scope targets, size, upload date, scan status, and actions (download,
   rename, archive/restore, delete); storage usage is computed from stored file records.
5. Files are stored outside PostgreSQL under generated keys that do not contain user filenames.
   Local disk is development-only; non-local environments require private S3-compatible storage.
6. Archiving removes a material from active lists and parent/student access without deleting its
   history or object. Deleting removes it from all scopes, removes the stored object, and is audited.
7. Teacher-only files are invisible to parents and students. Assistants need the corresponding
   server-enforced `files` permission; hiding a control is not authorization.
8. Group-shared files are visible only to authorized student/parent portal accounts linked to
   currently enrolled students in one of the selected groups. Student-shared files are visible only
   to an explicitly linked student or parent for one of the selected students.
9. Each download request rechecks workspace, scope, scan status, and the requesting staff/portal
   grants before issuing a short-lived URL (three minutes). A URL is not the authorization boundary.
10. Owners can rename, describe, subject/topic-organize, archive, restore, and delete their
    workspace's materials. No video hosting or streaming capability is claimed without a configured
    and tested provider.

---

### F-P1-12 — Basic reports

**User story:** As a teacher, I want to see how attendance and grades are trending, so that I can spot
a group going wrong.

**Dependencies:** F-P1-06, F-P1-09, F-P1-08.

**Acceptance criteria**
1. Reports page shows: attendance trend over a selectable period, homework completion trend, average
   assessment score by group, and the list of students needing attention.
2. Every figure is computed from records for the selected period and workspace.
3. The period selector defaults to the last 30 days and offers week / month / term / custom range.
4. Empty periods render as an explicit "no data in this period" state, not as a zero chart that
   implies a 0 % attendance.
5. "Students needing attention" uses the current rule set and links to each student.
6. Charts are theme-aware, direction-aware (axis order follows the reading direction), and have an
   accessible tabular alternative for screen readers.
7. **Export is out of P1 scope**; the prototype's export button only fired a toast. Export ships in
   P2 (F-P2-10) — the P1 button is hidden rather than shown-and-faked.

---

### F-P1-13 — Search

**User story:** As a teacher, I want one search box that finds students and groups, so that I don't
navigate to find what I need.

**Dependencies:** F-P1-02, F-P1-04.

**Acceptance criteria**
1. The top-bar search returns matching students and groups, grouped by type, capped at a reasonable
   result count, and is keyboard-navigable.
2. Matching is diacritic- and case-insensitive, and handles Arabic orthographic variants conservatively
   (normalisation is limited to tatweel and Arabic-Indic digit folding in P1; full normalisation is
   an open question — `OQ-07`).
3. Each result navigates to the correct destination (student profile / group detail).
4. Search is scoped to the signed-in user's workspace.
5. On mobile the search collapses to an icon that expands into the top bar.

---

### F-P1-14 — Account, profile, and sign-out

**User story:** As a teacher, I want to see and edit my profile and sign out, so that my account
stays accurate.

**Dependencies:** F-P0-02.

**Acceptance criteria**
1. Profile shows name, email, workspace, locale, and theme; name and email (verified) are editable.
2. Changing email requires re-verification; the previous address remains active until the new one is
   verified.
3. Sign-out clears the session server-side and returns to the sign-in screen.
4. "Delete workspace" is reachable from Settings, behind a typed confirmation, and is executed by a
   queued job with a visible progress state (P0-08).

---

### F-P1-15 — Accessibility, performance, and responsive quality gate

**User story:** As a teacher using an older phone with a screen reader, I want Kashkol to be usable, so
that the tool works for everyone.

**Dependencies:** all P1.

**Acceptance criteria**
1. All interactive elements are reachable and operable by keyboard; a visible focus ring is present.
2. Modals, tabs, and the session picker expose correct ARIA roles and state.
3. Colour is never the sole carrier of meaning: attendance marks and status badges carry a text label
   in addition to colour.
4. Tap targets are ≥ 44×44 px on touch breakpoints; the prototype's `min-height: 42px` global rule
   is raised to 44 px.
5. Contrast meets WCAG AA (4.5:1 text, 3:1 UI) in both themes — verified by an automated contrast
   check over the token set plus manual review of screenshots.
6. Performance budget on a representative mid-range Android device: first contentful paint < 2.0 s,
   largest contentful paint < 2.5 s, interaction to next paint < 100 ms, list scroll ≥ 50 fps.
7. No layout shift exceeding 0.1 CLS when the attendance roster loads.
8. The mobile drawer behaviour is verified in both directions: in RTL the drawer slides from the right
   (prototype already handles this with `html[dir="rtl"] .sidebar`), and the scrim closes it.
9. RTL-specific review: the prototype's mobile media query at line 443 and the "FINAL MOBILE SHELL
   FIX" block at line 450 duplicate and contradict each other (one makes the sidebar a 100 %-width
   sticky bar, the other restores it to a drawer). This must be reduced to **one** coherent mobile
   layout in the real implementation.

---

## 7. P2 — Expansion requirements

### F-P2-01 — Assistants, invitations, and enforced permissions

**User story:** As a busy teacher, I want to give my assistant the ability to take attendance and
enter grades but not see money, so that I can delegate without giving away the whole business.

**Dependencies:** F-P0-01, F-P0-02, F-P0-07.

**Acceptance criteria**
1. The owner invites a member by email; the invitee sets a password and joins **that** workspace only.
2. Permission grants are explicit and cover at least: `students` (read/write), `grades` (read/write),
   `attendance` (read/write), `homework` (read/write), `files` (read/write), `messages` (read/write),
   `payments` (read/write), `settings` (read/write), `team` (read), `audit` (read).
3. **Enforcement is server-side.** An assistant without `payments` receives `403` from the payments
   API, not merely a hidden menu item. An automated test enumerates every permission × endpoint
   combination and asserts the expected status.
4. The owner role always has all permissions; permission checkboxes are disabled for owners (as in
   the prototype) and this is enforced server-side too.
5. An assistant can never invite members, change the owner's permissions, delete the workspace, or
   change billing. Enforced server-side.
6. Removing a member revokes their sessions immediately and removes their access; their historical
   audit entries remain (audit is immutable) but display their name snapshot.
7. Every permission change is audited with before/after grant sets.
8. The permissions matrix UI matches the prototype's shape (name, role, then one column per
   permission) but reads from the server, so the checkboxes reflect reality.

---

### F-P2-02 — Parent portal (authenticated, read-only)

**User story:** As a parent, I want to see my child's attendance and results on my phone without
asking the teacher, so that I know how things are going.

**Dependencies:** F-P0-02, F-P1-06, F-P1-09, F-P1-08, F-P1-11, F-P2-01.

**Acceptance criteria**
1. A parent is linked to one or more students by a **verified** mechanism: the workspace owner selects
   the parent contact on the student record and issues a one-time access link / code, OR the parent
   requests access and the teacher approves. The teacher must be able to see and revoke links.
2. The parent signs in with a phone number (OTP) or email link; the link authenticates only that
   parent, never grants workspace access.
3. The portal shows, per linked child: next session, attendance rate and recent marks, assessment
   results, homework list with submission status, shared files, and teacher updates.
4. The portal is **read-only**: no mutation of teacher records is possible, by any API path.
5. A parent sees **only** their own child/children. A parent with two children in different groups
   (even the same workspace) sees both and nothing else.
6. The parent's view never exposes another student's name, count, or aggregate that could identify
   them (e.g. group averages that would let a parent infer other children). Group-level aggregates
   are hidden from the parent portal.
7. The parent portal is visually distinct from the teacher app (no teacher navigation, no teacher
   quick actions) and is reachable only by an authenticated parent/student session.
8. The prototype's parent portal is a **hardcoded mock** bound to `data.students[3]` with no auth —
   in production it is replaced by the authenticated implementation. Teacher-side "Preview parent
   view" remains available but is explicitly labelled as a preview and is not a substitute for the
   portal.
9. All portal access and every record viewed is written to the audit log with the parent as actor.

---

### F-P2-03 — Student portal (authenticated)

**User story:** As a student, I want to see my schedule, my homework, and my marks, so that I know what
to prepare.

**Dependencies:** F-P2-02 (shared access model), F-P1-08.

**Acceptance criteria**
1. A student is linked to their own student record, verified the same way as parents (teacher-issued
   code, or OTP to the student's phone on file).
2. The portal shows: next session (date, time, room, group), own attendance history and rate, own
   homework with submission status and a **submit** action, own assessment results, and files shared
   with them or their group.
3. A student sees only their own data. No peer data, no group aggregates.
4. Submitting homework sets the submission status to `submitted` with a server timestamp and updates
   the teacher's completion bar immediately.
5. The prototype's student portal is a hardcoded mock bound to `data.students[3]`; it is replaced by
   the authenticated implementation.
6. A student session can never read teacher-side endpoints — an API test asserts `403` across the
   teacher surface.

---

### F-P2-04 — Manual payment tracking

> **Status: superseded by `ADR-0028`** (2026-11-13). Manual tracking remains, but it is
> **session-scoped**: the teacher records one receipt per session, and expected revenue is
> price × (present + late marks). The per-student model described below (criteria 2, 3, 4, the
> per-student fee rules in 2, the "paid" toggle in 9, and the balances report in 10) is removed.
> Criteria 5 (append-only, idempotent), 6 (assistant permission gate), 7 (no settlement claim),
> 8 (EGP-only), and 11 (no parent access) continue to apply. Criterion 1 is replaced by: a
> session receipt records session, amount (EGP), method, date, optional reference/note, and the
> authenticated operator.

**User story:** As a teacher, I want to record what each parent paid and what is still outstanding, so
that I know who to follow up with.

**Dependencies:** F-P1-02, F-P0-01.

**Acceptance criteria**
1. A payment record: student, period covered (e.g. `2026-10`), amount, currency (default **EGP**),
   method (`cash` / `transfer` / `other`, with a label for `other`), date, optional receipt
   reference, optional note, and the authenticated operator.
2. The teacher can define a **monthly fee** per student or per group; outstanding balance is then
   computed in integer piastres as (fee × expected periods) − recorded payments plus adjustments,
   per student. Amounts are never calculated with floating-point currency arithmetic.
3. Outstanding students are listed with amount due and days overdue.
4. The teacher can record a **partial** payment; the remaining balance stays outstanding.
5. Payments, fee rules, and adjustments are append-only. A discount, refund, or correction is a
   separate record with a required reason and authenticated operator; a past payment is never
   silently amended or deleted. Refunds against a receipt cannot exceed its remaining refundable
   amount. Duplicate submissions are idempotent and conflicting reuse of an idempotency key fails.
6. The payments screen is **not** visible to assistants without the `payments` permission, and the
   API enforces this (F-P2-01).
7. Kashkol never contacts a bank, never reconciles with a gateway, and never claims a payment is
   "settled" — only that the teacher recorded it.
8. EGP is the only supported currency for this stage; every amount is explicitly labelled EGP.
9. Attendance does not reduce monthly fees by itself. Monthly/group fees are period-based and are
   unaffected by cancelled or make-up sessions; an exception requires a separately reasoned adjustment.
   **Per-session billing is supported as an explicit, implemented policy** (`ADR-0025`,
   superseding in part `ADR-0018`): a group with `default_price_per_student_minor > 0` (or a session
   with `price_per_student_minor` set) accrues expected charges equal to price × (present + late marks)
   for every non-cancelled session; groups priced at session level do not accrue monthly `fee_rule`
   rows for their enrolled students; the teacher's per-student "paid" toggle writes or reuses a real
   session-linked `payment` row in the same transaction (and audits it); voided payments never count as
   collected revenue. Nothing about this policy weakens the append-only invariant for `fee_rule`,
   `payment`, or `payment_adjustment`.
10. The payment ledger report covers collected transactions and adjustments. A separate student
    balances report computes expected, received, adjustment, and outstanding/credit amounts as of a
    required date. Both honor group/student filters; the ledger honors its date range and the balance
    report uses its as-of date. Exports apply the same filters, are authorization-checked, paginated
    or capped, asynchronous, tenant-scoped, and protected against spreadsheet formula injection.
11. Parent balance or receipt access is disabled until an explicitly authorized parent projection is
    implemented; no parent can use a staff payment route.

---

### F-P2-05 — QR attendance

**User story:** As a teacher, I want students to scan a code on the door to mark themselves present, so
that I am not calling the register one by one.

**Dependencies:** F-P1-06, camera permission handling, token lifecycle.

**Acceptance criteria**
1. The teacher generates a **short-lived token** for a specific session (default 30 minutes, max 4
   hours), displayed as a QR code with the session identity visible beside it.
2. The token is stored **hashed**; the plaintext is shown only at generation time.
3. Scanning is performed in the teacher's own device (the teacher scans students' codes) or via a
   student-facing page — the exact capture flow is an open question (`OQ-05`); either way the check
   is **server-side** and the same check applies regardless of client.
4. A scan is accepted only if: the token is unexpired, not already rotated, belongs to the session,
   the student has at least one **active enrolment in the workspace**, and the student has not already
   been marked present for that session. A student eligible only through a different group is marked
   cross-season (`isCrossSeason = true`), appended to the attendance roster on first mark, and
   highlighted amber on the screen. A student with no active enrolment anywhere in the workspace is
   rejected.
5. Every accepted scan writes the same attendance record shape as a manual mark, with
   `source = qr` and the device id.
6. A QR scan that would mark a student absent is **not possible** — a scan can only mark present or
   late (teacher picks the late flag at the scanner). Absences and excusals remain manual.
7. Rotating the token invalidates the previous one immediately; the UI shows the remaining validity.
8. A scan by an unenrolled or unknown student is rejected with a clear message and is **logged** for
   teacher review.
9. Token rotation, generation, and every rejected scan are audited.
10. QR attendance is never simulated in a demo build; a build that lacks a real camera/scanner path
    does not expose the feature.
11. The scanner is built for speed: the camera stream is acquired **once** and persists across scans;
    decode frames are downscaled to at most 480 px and sampled at ~15 fps; `BarcodeDetector` is used
    where the browser exposes it (hardware/OS-backed) with a `jsQR` fallback on the same downscaled
    frame; a per-token ~4 s suppression window stops the camera from POSTing the same code on every
    frame, while the server keeps the authoritative atomic duplicate-scan rejection (`409 CONFLICT`).
    A successful scan shows the student's name and a checkmark immediately (optimistic UI), a success
    sound/haptic, and an `aria-live` banner.

---

### F-P2-06 — Academic progress and follow-up

**User story:** As a teacher, I want to see whether a student is improving and be able to record that
I followed up with their parent, so that students do not silently fall behind.

**Dependencies:** F-P1-06, F-P1-09, F-P1-08, P2-04.

**Acceptance criteria**
1. A **progress view** per student shows attendance rate over time, average assessment score over
   time, and homework completion over time, each with a direction (improving / steady / declining)
   computed from the series (not a stored enum).
2. The prototype's `trend` field is seeded at random and never recomputed; it is replaced by a
   computed series.
3. Each attention rule is explicit and its threshold is visible. The shipped rules are:
   consecutive absences within a group at the workspace `at_risk_after` threshold (default 2); an unsubmitted homework item past its due time;
   and a latest-three graded assessment average below the preceding-three average. Missing,
   excused, and not-taken assessment results are excluded.
4. Every flagged student lists the **rule and source records** that caused the flag. Source data is
   omitted when the viewer lacks the corresponding attendance, homework, or grades read permission.
5. An authorized teacher or assistant can create a follow-up task with an owner, optional due date,
   and private note; record an outcome; and review the task history. Mutations are audited.
6. Follow-up notes and grade/feedback details are private staff data. Parent-facing access to any
   such field requires an explicitly authorized route and field projection; this release adds none.
7. Students with an open follow-up are visible to assistants with the `students` permission, so a
   shared teacher can pick up the conversation.
8. The attention list is empty-state aware: "Nobody needs urgent attention today" (prototype copy).

---

### F-P2-07 — Notifications expansion

**User story:** As a teacher, I want to be told when a student's attendance drops or homework is due,
so that I act before it becomes a problem.

**Dependencies:** F-P0-10.

**Acceptance criteria**
1. Rule-generated notifications include: student crossed the at-risk threshold, group has an
   unrecorded past session, homework due within 48 hours, assessment marks not entered, and an
   outstanding payment beyond N days.
2. Notification rules are workspace-configurable and produce no duplicate notification for the same
   condition within a cooldown window.
3. Notifications deep-link to the relevant screen (student profile, session, homework).
4. **Optional** email digest is available and explicitly opt-in per workspace; it contains no note
   bodies or phone numbers beyond what the teacher configured.
5. No push notifications in P2 (no mobile app).

---

### F-P2-08 — Multi-workspace switching

**User story:** As a teacher who runs two separate businesses, I want to switch between my workspaces,
so that each has its own students.

**Dependencies:** F-P0-01, F-P0-02.

**Acceptance criteria**
1. A user may belong to more than one workspace; the current workspace is explicit in the sidebar
   brand block and switchable.
2. Switching changes the active `workspace_id` in the server session and clears all cached
   workspace-scoped state (no data bleed between workspaces in the client).
3. A workspace switch is audited.
4. The prototype supports exactly one implicit workspace; this feature introduces the explicit model
   without changing the underlying isolation guarantees.

---

### F-P2-09 — Teacher-side preview of portals

**User story:** As a teacher, I want to see exactly what a parent will see before sharing it, so that
I don't send something confusing.

**Dependencies:** F-P2-02.

**Acceptance criteria**
1. The teacher can preview the parent portal for a specific student.
2. The preview is **visibly labelled as a preview** (a persistent banner stating it is not the real
   portal and no real parent session is involved) and is rendered by the same component tree the real
   portal uses, so it cannot drift.
3. The preview never creates a real parent account, never sends anything, and is audited.

---

### F-P2-10 — Reports and export

**User story:** As a teacher, I want to export my attendance and grades to a spreadsheet, so that I can
analyse or share them.

**Dependencies:** F-P1-12, F-P0-08.

**Acceptance criteria**
1. Exportable reports: student roster, attendance records (with corrections applied and the revision
   chain available as a separate sheet), assessment scores, homework submissions, payments.
2. Formats: CSV (UTF-8 with BOM for Excel), XLSX, and PDF summary. Filenames are localised.
3. Exports are generated asynchronously; the UI shows a queued/processing/ready state and notifies on
   completion (F-P0-10).
4. Export generation is **server-side** and reads through the same tenant-scoped data layer, so an
   export can never contain another workspace's data.
5. The export file is stored in the workspace's own storage with a signed, expiring download link, and
   the export is audited.
6. Every sheet has an Arabic and an English header row option, and Arabic content is not corrupted.

---

### F-P2-11 — Data import/export and backup (server-side)

**User story:** As a teacher, I want to download a full backup of my workspace, so that I am never
dependent on the platform.

**Dependencies:** F-P0-08, F-P2-01.

**Acceptance criteria**
1. A full workspace export (JSON) includes all tenant data with a schema version and a generated-at
   timestamp.
2. Import/restore is available to the owner only, and is executed as a background job with a clear
   "this replaces current data" confirmation, a pre-flight validation report, and a post-restore
   integrity check.
3. The prototype's restore path replaced the live client state wholesale with no validation — the
   production restore validates and reports before committing.
4. A restore preserves audit history by appending a "workspace restored" event rather than erasing
   history.

---

### F-P2-12 — Session correction workflow for schedule changes

**User story:** As a teacher, I moved a lesson to another day, so I want the session history to explain
it, so that my attendance percentages stay meaningful.

**Dependencies:** F-P1-05, F-P1-07.

**Acceptance criteria**
1. Editing a session's date/time after attendance was recorded requires a reason and creates a
   session revision, similar to an attendance correction.
2. Moving a session does not silently move recorded attendance to a different session id; the
   attendance stays attached to the session, and the revision explains the move.
3. Cancelling a session that already has attendance recorded requires confirmation and states that
   the recorded attendance will be retained but excluded from rates.

---

## 8. P3 — Advanced requirements

### F-P3-01 — Online quizzes and exams (later phase)

**User story:** As a teacher, I want to build an online exam, share a link, and see results
automatically, so that I can assess students without printing papers.

**Dependencies:** P2 foundations; exam-taking surface; anti-abuse design.

**Acceptance criteria**
1. Question types: multiple choice, true/false, and essay (manually graded) — matching the prototype's
   three types.
2. Question types also include, at minimum by launch: short answer and numeric, if the target
   curriculum needs them (`OQ-11`).
3. Per-question points; exam total is the sum.
4. Exam configuration: title, target group, duration in minutes, open/close window, whether the score
   is shown immediately after submission, and a share code/link.
5. The student-taking flow: identify (phone lookup, as in the prototype) → answer → submit → result.
6. Automatic scoring for objective questions; essays are flagged `manual_pending` and appear in a
   grading queue where the teacher enters the essay score.
7. A manual essay grade **replaces** the automatic total (the prototype keeps `autoScore` and `total`
   separately, which is the right shape and is carried forward).
8. Exam status lifecycle: `draft` → `open` → `closed`; a closed exam accepts no new attempts.
9. The attempt records: answers, submitted_at, auto score, manual total, and the identifying method.
10. Attempt limits: one attempt per student per exam by default, configurable; a re-attempt is
    possible only if the teacher enables it.
11. Results view: per-student submitted/score/manual-grade columns, group average, and distribution.
12. The exam link, when opened by someone not on the roster, shows a neutral "this exam is not
    available for you" — it does not confirm or deny that a given phone number is a student.
13. Every exam action (create, publish, close, manual grade) is audited.

---

### F-P3-02 — Recorded video via external provider

**User story:** As a teacher, I record a lesson with an external tool and attach it to a group or a
session, so that students can watch it later.

**Dependencies:** External video provider contract and API; P1-11 file/attachment model.

**Acceptance criteria**
1. The provider is **external** and chosen before P3 begins; Kashkol does not host or transcode
   video. Provider selection is an open question (`OQ-08`).
2. The teacher pastes or imports a provider asset reference (or uploads through the provider's
   SDK); Kashkol stores the provider asset id, a display title, duration, and a playback reference.
3. Attachments use the file scopes: teacher-only, selected groups, or selected students.
4. Playback uses the provider's own player/embed or a direct signed playback URL — Kashkol never
   re-hosts the video and never claims to have recorded anything.
5. If the provider becomes unavailable, the attachment shows "unavailable" with a clear message; the
   metadata and the teacher's notes remain visible.
6. Provider webhook events (e.g. `ready`, `processing`, `failed`) are consumed idempotently and are
   signed/verified.
7. No credentials for the provider are exposed to the client.
8. Videos attached to a group are visible to that group's students and parents (P2 portal).

---

### F-P3-03 — Platform administration console

**User story:** As a platform operator, I need to see workspace status and support a teacher in
trouble, without reading their students' data by default.

**Dependencies:** F-P0-01, F-P0-07.

**Acceptance criteria**
1. The console shows operational metadata only: workspace id, created date, plan, status, member
   count, last activity timestamp, and aggregate record counts.
2. Support access to tenant content requires an explicit **break-glass** action: a stated reason
   ticket, a time-boxed grant (default 1 hour), a banner visible in the tenant UI while active, and
   an audit event that the workspace owner can see. (`A-12`)
3. There is no bulk export of tenant content.
4. Admin actions are rate-limited and themselves audited in a platform-level log.
5. The console is not reachable with a teacher session, and a teacher session cannot call admin APIs.

---

### F-P3-04 — Subscription, plan, and billing

**User story:** As a teacher, I want to know what my plan allows and how much I owe, so that the
service is predictable.

**Dependencies:** Payment provider (a real one — this is separate from the *manual* payment tracking
of F-P2-04, which tracks teacher↔parent money, not teacher↔Kashkol money).

**Acceptance criteria**
1. Plans define limits on students, groups, and file storage, with over-limit behaviour that is
   explicit (block or prompt upgrade) and communicated **before** the limit is hit.
2. Billing state (active / past due / cancelled) is visible to the owner in Settings.
3. Downgrading does not delete data; it restricts new writes and says so.
4. The billing provider's webhooks are the source of truth for subscription state, consumed
   idempotently.
5. An Arabic and English invoice/receipt is available for each charge.

---

### F-P3-05 — Scale, performance, and reliability hardening

**User story:** As a teacher with 1,500 students, I want the app to stay fast, so that it is usable
every day.

**Acceptance criteria**
1. Performance budgets from F-P1-15 hold at 10× the seed dataset.
2. Attendance save for a 200-student roster completes in a single transaction under 2 seconds.
3. Reports for a full academic year complete asynchronously within a stated SLA.
4. Read replica / query caching strategy is documented and load-tested at the target concurrency.
5. Graceful degradation: if the file service or the email provider is down, the core flow (attendance,
   grades) keeps working and the failure is surfaced clearly rather than swallowed.
6. A documented RTO and RPO exist and are exercised by a drill.

---

### F-P3-06 — Rich notification channels

**User story:** As a teacher who is not in the app all day, I want to be nudged on my phone about an
unrecorded session, so that I do not lose data.

**Acceptance criteria**
1. Push notifications (web push and/or a mobile app) become available.
2. Every notification type has an Arabic and English rendering, correct per-user timezone, and a deep
   link.
3. Per-type opt-in, with a workspace-wide default.
4. Notification frequency is capped (digest rather than a burst).

---

### F-P3-07 — Advanced reporting and academic-year handling

**User story:** As a teacher, I want term boundaries and printable report cards, so that I can run a
school year.

**Acceptance criteria**
1. Academic terms (start/end dates) are definable per workspace and per grade.
2. Reports default to the current term and can be compared against the previous one.
3. A printable student report (PDF, Arabic) can be generated per student per term, including
   attendance, homework, assessments, and teacher notes.
4. Generated report cards are reproducible: regenerating with unchanged data yields an identical
   document except for a generation timestamp.

---

### F-P3-08 — Duplicate-student detection and roster hygiene

**User story:** As a teacher who imported a messy spreadsheet, I want to know about likely duplicate
students, so that my roster is not wrong.

**Acceptance criteria**
1. During import and on request, likely duplicates are surfaced by normalised name + phone similarity
   and a shared parent phone.
2. The teacher decides: merge, keep both, or ignore. Kashkol never merges automatically.
3. A merge preserves both students' attendance, grades, and payments on the surviving record, and
   records the merge in the audit log with both original ids.
4. Merging is irreversible only by re-creating the merged-away record; the merged-away row is
   retained in a tombstone state for audit.

---

### F-P3-09 — Forms and surveys foundation

**User story:** As a teacher, I want to collect structured answers from students or parents with a
form, so that I do not have to reconcile free-text replies by hand.

This flow covers the **server-side foundation only**. A visual form builder is deliberately out of
scope; a later flow adds it on top of these endpoints and data.

**Acceptance criteria**
1. A member with `forms:write` can create a draft form with a title, description, submission mode,
   public-form settings, sections, and ordered questions.
2. A form supports the question types `short_answer`, `long_answer`, `multiple_choice`,
   `checkboxes`, `dropdown`, `number`, `date`, `time`, `file_upload`, `rating`, and `linear_scale`,
   each with type-specific configuration validated on the server.
3. A draft may be edited, duplicated into a new draft, published once it has at least one question,
   and archived. Published and archived forms reject definition edits; archived forms reject
   responses.
4. A published form may be marked public and receives a globally unique slug. The public response
   route is **not part of this flow** and stays disabled until a later flow adds it.
5. Conditional logic is stored relationally and supports `show`, `hide`, and `require` actions
   against a question or a whole section, with `equals`, `not_equals`, `contains`, `is_answered`,
   `is_not_answered`, `greater_than`, and `less_than` operators.
6. Submission adds a response only when the form is published and accepting responses. Required
   questions are enforced only while they are visible; answers to hidden questions are not stored.
7. Identified submissions link to an existing `student` and/or submitting user. Anonymous
   submissions leave both identity columns null. A submission whose identity does not match the
   form's mode is rejected.
8. A file-upload answer references existing `file` rows in the same workspace that are neither
   archived nor deleted and have a `clean` scan status. No separate file store or upload bypass is
   introduced.
9. Every answer value is validated against its question type and configuration before it is stored.
10. All form and submission reads require `forms:read`; all definition and lifecycle writes require
    `forms:write`. Both permissions are sensitive and grantable to assistants by the owner.
11. Every form mutation and every received submission writes an audit event in the same transaction.
12. No response, statistic, public link, or delivery state is fabricated. There is no seeded demo
    form and no claim that a form was shared or delivered.

---


## 9. Privacy-sensitive data register

| Data | Class | Why sensitive | Controls |
|---|---|---|---|
| Student full name, grade | Personal | Identifies a minor; Arabic names are less ambiguous than Latin but still identifying | Tenant-scoped; never in logs; export gated by `settings`/owner |
| Student phone | Personal | Direct identifier, contactable | Stored E.164; masked in lists (`01x *** ***`); shown LTR |
| Parent name, parent phone | Personal | Identifies a household; a parent may have several children | Separate entity; parent sees only own children; no group aggregates |
| Attendance records and rates | Sensitive | Reveals a minor's behaviour and can imply health or family circumstance | Teacher-scoped; portal read-only; export audited |
| Assessment scores | Sensitive | Academic performance of a minor | Same as attendance; portal read-only |
| Teacher notes about a student | **Highly sensitive** | Free text; may contain health, behaviour, or family circumstances | Teacher-only by default; excluded from audit diffs; excluded from parent/student views unless explicitly shared; excluded from logs |
| Files (worksheets, answer keys) | Confidential | Answer keys are teacher-only material | Scope model (`teacher_only`/`groups`/`students`); signed URLs; teacher-only never shared |
| Payment records | Sensitive financial | Family financial information | Separate permission; not visible to parents; never in logs |
| Message drafts | Personal | Contains a parent's contact and a student's data | Staff-only; no delivery claim |
| Audit log | Sensitive | Contains names of minors and staff | Owner-only (or `settings`); immutable; long retention |
| IP addresses / device ids | Personal | Identifies a person | Short retention (90 days default); audit-logged but redacted from user-visible views |
| Session cookies / tokens | Secret | Account takeover | `HttpOnly`/`Secure`; never logged; rotated on privilege change |

**Explicit data-collection prohibitions:** no national ID, no date of birth, no religion, no political
affiliation, no biometrics, no precise location, no third-party behavioural tracking of students.
(`A-11`)

---

## 10. Integration dependencies

| Integration | Needed for | Tier | Type | Risk / mitigation |
|---|---|---|---|---|
| Transactional email (signup, reset, invites, digests) | P0 auth, P2 invites/digests | P0 | Hard dependency | Provider outage must not block sign-in for existing sessions; queue and retry; surfaced to the user |
| Object storage (S3-compatible) | P1 files | P1 | Hard dependency | Signed URLs; separate buckets per environment; lifecycle rules |
| Virus scanning (private ClamAV service) | P1 files | P1 | Hard dependency | File unavailable until clean; scanner outage leaves pending state and retry |
| WhatsApp deep link (`wa.me`) | P1 parent updates | P1 | Soft dependency | No API, no delivery receipts; only "opened in WhatsApp" may be claimed |
| SMS/OTP provider | P2 parent/student portal login | P2 | Hard dependency for portal | Fallback to emailed link; rate-limited; cost per OTP |
| Push provider | P3 rich notifications | P3 | Hard dependency | Opt-in only |
| External video provider | P3 recorded video | P3 | Hard dependency | Provider outage ⇒ "unavailable", never a broken player |
| Billing provider | P3 subscription | P3 | Hard dependency | Webhook-driven state; never store raw card data |
| Background job runner | P2 exports, P3 heavy reports | P2 | Hard dependency | Idempotent jobs; visible job status in UI |
| Error monitoring / analytics | P0-09 | P0 | Hard dependency | Must redact PII (P0-08) |

---

## 11. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-01 | Tenant isolation bug leaks one teacher's students to another | Medium | **Critical** | DB-level RLS + repository scoping + cross-tenant test matrix in CI; release blocker (F-P0-01) |
| R-02 | Derived statistics (attendance %, quiz avg) drift from raw records, as in the prototype where `attendancePct` was never recomputed | High | High | Single source of truth = records; no stored derived fields; unit tests recompute from fixtures |
| R-03 | Parent communication implies delivery it cannot verify | Medium | High | Hard product rule: never show "sent/delivered/read"; label "opened in WhatsApp"; enforced in copy review (F-P1-10) |
| R-04 | Feature creep from the prototype's full surface (exams, meetings, files, portals) into the first release | High | High | P1 gate: no second role, no outbound network except auth email, no money/camera/video (F-P1-15) |
| R-05 | Arabic RTL defects that pass visual review but break layout | High | Medium | Logical properties only + RTL CI lint + bilingual screenshot review per release |
| R-06 | Egyptian phone-number handling produces malformed WhatsApp links (prototype bug) | Medium | Medium | E.164 normalisation at the data layer + unit tests with `010`, `+20 10`, `002010`, and malformed inputs |
| R-07 | Date/timezone bugs shift sessions by a day around midnight (prototype `toISOString()` bug) | Medium | High | Store UTC instant + workspace timezone; test with `Africa/Cairo` and a DST-free assumption stated explicitly; tests around month/year boundaries |
| R-08 | Attendance corrections silently rewrite history | Medium | High | Immutable revision chain (F-P1-07); every correction audited |
| R-09 | Photocopying the prototype's dark-mode tokens without a real theme toggle leaves dark mode unreachable for most users | Medium | Medium | Ship a real `light/dark/system` control in P0, not just OS-follow (F-P0-04) |
| R-10 | Prototype's contradictory mobile CSS (two overlapping media-query blocks) is copied forward | Medium | Medium | Reimplement mobile layout once, from the token system; explicit single-source mobile rules (F-P1-15) |
| R-11 | Data growth (files, audit) outpaces the initial infra budget | Medium | Medium | Lifecycle policies, quotas, async exports; cost model validated before P2 |
| R-12 | Legal/regulatory requirements for minors' data in Egypt are unknown to the team | Medium | High | Legal review before P2 launch (external dependency, not resolvable by engineering alone); privacy notice in Arabic (F-P0-08) |
| R-13 | Parents/students resist OTP-based portal access (low digital literacy) | Medium | Medium | Teacher-issued codes as an alternative path; a paper fallback of "ask the teacher for a screenshot" is explicitly **not** a substitute for the portal |
| R-14 | The prototype's brand, copy, and seeded data leak into production (e.g. "Madar", "Mona", mock phone numbers) | Medium | Medium | Rename and content audit as a P1 checklist item; no seeded/demo data in production builds |
| R-15 | Non-teacher roles are given too much access by permissive defaults | Medium | High | Deny-by-default permissions; explicit grant per member; enforced server-side (F-P2-01) |
| R-16 | Recording video raises expectations of hosting/streaming Kashkol does not provide | Low | Medium | P3 product copy states the external provider explicitly; no upload-to-Kashkol video path exists |

---

## 12. What must not be faked

These are **prohibitions**, not preferences. A build that violates any of them is not shippable,
regardless of tier.

| # | Prohibition | Why |
|---|---|---|
| NF-1 | **No fabricated statistics.** Every attendance rate, average, trend, completion %, and count must be computed from stored records. Seeded/random demo data must never reach a production build. | The prototype's `attendancePct`, `quizAvg`, `homeworkCompletion`, and `trend` were random and never recomputed. Shipping that would make the product lie to teachers. |
| NF-2 | **No simulated delivery.** Parent messages may only be described as "opened in WhatsApp" / "prepared". Never "sent", "delivered", "read", "received". | Kashkol has no WhatsApp Business API integration and cannot observe any of those states. |
| NF-3 | **No mocked portals.** The parent and student portals require real authentication and real authorisation. A teacher-side preview must be labelled as a preview. | The prototype's portals render a hardcoded student with no auth. Shipping that as "the portal" would misrepresent data protection. |
| NF-4 | **No mocked QR attendance.** A scan must be validated server-side against a real hashed token, real session, and real enrolment. No client-side "simulate scan" in a shipped build. | Attendance is the highest-trust record in the product. |
| NF-5 | **No mocked payments or settlement.** Payments are teacher-recorded facts. No "paid", "settled", "reconciled" claim beyond "recorded by the teacher". | Kashkol moves no money. |
| NF-6 | **No mock video hosting or a fake player.** Recorded video must come from the real provider, or the feature ships as absent. | A fake player that "works" but streams nothing is worse than absence. |
| NF-7 | **No fake audit trail.** Audit events are written server-side in the same transaction as the mutation. | A client-written log can be lost or forged. |
| NF-8 | **No UI-only authorisation.** A hidden button is not a permission. Every restricted endpoint enforces the rule server-side. | The prototype's permission checkboxes were purely cosmetic. |
| NF-9 | **No fake tenant isolation.** Isolation is enforced in the data layer and verified by tests that run on every build. | Cross-tenant leakage is the single most damaging failure mode for this product. |
| NF-10 | **No fake theme, locale, or direction.** Dark mode and Arabic RTL must be fully functional, not token-only scaffolding. | The prototype defines dark tokens but never sets `data-theme`, so dark mode was reachable only via OS preference. |
| NF-11 | **No placeholder buttons.** A control that does nothing must not ship. The prototype's "Export summary" (toast only) and "Open file" (`window.alert`) are the canonical examples. | A teacher who clicks a button and sees nothing will assume the app is broken and lose trust in the data. |
| NF-12 | **No seeded demo content in production.** Demo accounts are clearly separated and labelled, and cannot be promoted to a paid workspace. | The prototype's seed data (64 students, fake phone numbers, "Ahmed Physics") is presentation-only. |
| NF-13 | **No silent data loss.** A failed import, restore, or export reports exactly what happened, including partial outcomes. | Silent partial failure in a teacher's roster is unacceptable. |

---

## 13. Appendix A — Prototype sections actually observed

The reference file is `madar-teacher-prototype.html` at the **repository root** (not
`reference/Madar-Prototype.html`, which does not exist). It is a single-file React 18 (UMD) +
Babel-standalone prototype, 4,750 lines, with all state in `localStorage` under `ots_state_v1` and
the language under `ots_lang`. It was read read-only; it was not modified.

**Observed screens and sections**

| # | Section | Observed at | What was actually present |
|---|---|---|---|
| 1 | Design tokens & themes | L14–96 | Full light/dark token sets, `prefers-color-scheme` fallback, `:root[data-theme="dark"]` |
| 2 | Base typography & layout CSS | L79–608 | Manrope/Fraunces/Cairo, logical-property RTL, card/table/badge/button/modal/chart CSS, two overlapping mobile media-query blocks (L443 and L450) |
| 3 | Mock data generators | L614–882 | Subjects, groups, 64 students (seeded PRNG `mulberry32(7788)`), sessions, attendance, homework, quizzes, notifications, exams, meetings, files, team, audit seed |
| 4 | i18n catalogue | L884–1660 | ~330 keys × `en` + `ar` |
| 5 | Icon set | L1661–1707 | ~28 hand-rolled thin-stroke SVG icons |
| 6 | UI primitives | L1708–1907 | Icon, Avatar, Badge, Button, Card, Input, Textarea, Select, Modal, Tabs, EmptyState, StatCard, BarChart, LineChart, ProgressBar, Toast |
| 7 | Data store | L1908–2173 | `localStorage` persistence, `logAction`, `recomputeStatus`, `saveAttendance`, import/restore |
| 8 | Lang context | L2182–2197 | `lang`/`dir` toggle persisted in `localStorage` |
| 9 | Navigation structure | L2199–2226 | 5 groups / 15 items + 3 sidebar-footer items |
| 10 | Sidebar & topbar | L2228–2330 | Sidebar groups, language switch, notification popover with unread badge, search box, avatar |
| 11 | Auth | L2331–2393 | Split-panel login (with demo button) and signup (name, teaching name, subject, email, password) |
| 12 | Dashboard | L2394–2544 | Greeting, 4 stat tiles, 6 quick actions, today's sessions, needs-attention, weekly bar chart, upcoming, deadlines |
| 13 | Students | L2545–2637 | Filter row, table, empty state, search integration |
| 14 | Student profile | L2638–2787 | 5 tabs (overview / attendance / homework / quizzes / notes), edit + message-parent actions, note composer |
| 15 | Groups | L2788–2881 | Card grid, group detail with roster table and upcoming sessions |
| 16 | Sessions | L2882–2956 | Week grid, prev/next/today, take-attendance and cancel links |
| 17 | Attendance | L2957–3056 | Session picker + roster, 4 marks, mark-all-present, save |
| 18 | Homework | L3057–3089 | Card grid with submission progress bars |
| 19 | Quizzes | L3091–3156 | Table + "enter scores" sub-screen with numeric inputs |
| 20 | Results | L3158–3216 | Tabs: by group / by student |
| 21 | Reports | L3217–3268 | 2 line charts, 1 bar chart, attention list, export button (toast only) |
| 22 | Student Attention | L3270–3318 | Flagged students with reason chips, view-student / contact-parent actions |
| 23 | Parents / WhatsApp | L3320–3399 | 6 message types, student/group picker, editable preview, `wa.me` deep link |
| 24 | Student Portal | L3400–3462 | Next session, attendance, homework, results, announcements — bound to a hardcoded student |
| 25 | Parent Portal | L3464–3523 | 5 tabs — bound to a hardcoded student |
| 26 | Settings | L3525–3670 | 3 tabs: General (name, thresholds, language), Data (backup export/import, CSV import/export, permissions note), Team (embedded) |
| 27 | Online Exams | L3672–3878 | Exam table, create-exam modal (MCQ/TF/essay, points, show-after), student take flow (phone identify → answer → submit), results + manual grading |
| 28 | Online Meetings | L3880–4005 | Meeting cards, create modal, mock meeting room (fake video area, participants, chat, mute/cam/share/hand/leave/end) |
| 29 | Files | L4007–4065 | Scope filter, table, upload modal, `window.alert` "open", delete |
| 30 | Team & permissions | L4067–4122 | Permission matrix table with checkboxes, add-member modal |
| 31 | Activity Log | L4124–4151 | Audit list |
| 32 | Modals | L4152–4621 | AddStudent (also used for edit), CreateGroup, CreateSession, AddHomework, CreateQuiz, CreateExam, CreateMeeting, UploadFile, AddTeamMember, ContactParent |
| 33 | App shell & routing | L4623–4749 | View-based state machine, `view` string routing, no URL routing, modal dispatch |

**Explicitly observed as absent from the prototype**

- **QR attendance** — no occurrence of "QR" anywhere in the file. Not designed, not stubbed.
- **Payment tracking** — only a `finance` permission label and an `audit_action_add_payment` string
  literally marked "(placeholder)". No data model, no screen.
- **Video recording** — no occurrence of "record"/"recording". The Meetings screen is a simulated
  meeting room, not recording.
- **Multi-workspace / tenancy** — one implicit workspace; no concept of switching.
- **Session correction history** — attendance can be re-saved and silently overwritten; there is no
  revision chain.
- **Enforced permissions** — the permission matrix is cosmetic; nothing reads `permissions` except to
  disable the owner row's checkboxes.
- **Dark-mode toggle** — tokens exist, but no control sets `data-theme`; dark mode is reachable only
  through the OS preference.
- **Notifications** — a static list of four, with no generation rules.
- **Homework submission capture** — `submittedIds` is only ever produced by the seeded PRNG.
- **Computed derived stats** — `attendancePct`, `quizAvg`, `homeworkCompletion`, `trend` are seeded
  and never recomputed from the attendance/quiz/homework records the app itself writes.
- **Working student edit** — the edit-student modal calls `addStudent` only when there is no `initial`,
  so edits do not persist.
- **Working file open** — `window.alert(f.name)`.
- **Working report export** — a toast with no file produced.
- **Real auth** — login/signup buttons set a local state flag; there is no credential check, no
  session, no server.
- **URL routing / deep links** — navigation is an in-memory `view` string; there are no shareable
  URLs, so browser back and refresh do not work.
- **Global search** — the top-bar query filters only Students and Groups.

---

## 14. Appendix B — Prototype defects to not carry forward

Observed in the reference file. Each is a requirement in disguise.

| # | Location | Defect | Requirement |
|---|---|---|---|
| DEF-01 | L4361 | WhatsApp link builds `"https://wa.me/2" + num` where `num` already begins with `01` → malformed | E.164 normalisation (`20` + national number) — F-P1-10 |
| DEF-02 | L2180, L2891, L3056 | `toISOString()` used for local dates → sessions can shift a day in `Africa/Cairo` | Store UTC instant + workspace timezone — F-P1-05 |
| DEF-03 | L2883–2899 | `startOfWeek` uses `getDay()` (Sunday) while the grid renders `["sun"… "sat"]` and seeded groups are Sat/Mon | Single week-start rule (Saturday) — F-P1-05 |
| DEF-04 | L443 vs L450 | Two overlapping mobile media-query blocks contradict each other (sticky 100 %-width bar vs slide-out drawer) | One coherent mobile layout — F-P1-15 |
| DEF-05 | L4176–4180 | Edit-student path never persists (`if (!initial) addStudent(...)`) | Edit works and is audited — F-P1-02 |
| DEF-06 | L2448–2451 | `reports_export` shows a toast only | Real async export in P2 — F-P2-10 |
| DEF-07 | L4051 | "Open" file calls `window.alert(f.name)` | Real viewer/download — F-P1-11 |
| DEF-08 | L1994–2049 | `attendancePct` never recomputed from `ATTENDANCE`; only `consecutiveAbsences` and `status` update | Compute rates from records — F-P1-06 |
| DEF-09 | L672–697 | `quizAvg`, `homeworkCompletion`, `trend` seeded randomly; never recomputed | Computed derived metrics — F-P2-06 |
| DEF-10 | L758–777 | Homework `submittedIds` only from the PRNG; no way to record a submission | Explicit submission records — F-P1-08 |
| DEF-11 | L2034–2049 | Re-saving attendance silently overwrites, with no revision | Immutable revision chain — F-P1-07 |
| DEF-12 | L4095–4098 | Permission checkboxes are decorative; no enforcement | Server-side enforcement — F-P2-01 |
| DEF-13 | L40, L70 | Dark tokens defined but `data-theme` is never set by any control | Real theme control — F-P0-04 |
| DEF-14 | L4062–4065 | Parent/student portals render a hardcoded student with no auth | Authenticated portals + labelled preview — F-P2-02/03/09 |
| DEF-15 | L2433 | Dashboard greeting hardcodes "Mona" | Use the signed-in teacher's name — F-P1-01 |
| DEF-16 | L1324–1325 | `greeting_afternoon` and `greeting_evening` are both "مساء الخير" | Distinct afternoon/evening greetings — F-P1-01 |
| DEF-17 | L1411–1412 | `day_thu` is "خميس", `day_tue` "ثلاثاء", `day_wed` "أربع" — colloquial and inconsistent with the formal register used elsewhere | Consistent Modern Standard Arabic day names — F-P0-03 |
| DEF-18 | L4023 | The Files scope filter labels its "all" option with the students-screen string "All groups" | Correct per-screen label — F-P1-11 |
| DEF-19 | L3854 | The exam-results table uses the status key `exam_status_open` ("Open") as a column header for submitted/draft | Correct header — F-P3-01 |
| DEF-20 | L4624–4669 | View-based routing with no URL state → no deep links, no browser back/refresh | URL-based routing with real URLs — F-P0-05 |
| DEF-21 | L4188 | The add-student modal hardcodes the English placeholder "Last name" | Catalogue-driven placeholder — F-P0-03 |
| DEF-22 | L143, L289, L355 | `text-transform: uppercase` is applied to Latin labels but correctly disabled for Arabic | Keep the Arabic exception; also never uppercase Arabic text anywhere — F-P0-03 |
| DEF-23 | L372–379, L2740 | Several places reuse the wrong key for context (e.g. homework "not submitted" is labelled with the due-date string) | Context-correct keys — F-P0-03 |

---

## 15. Appendix C — Decision index

| ID | Decision |
|---|---|
| D-01 | Arabic/RTL is the default locale and direction; English/LTR is fully supported. |
| D-02 | Light and dark themes both ship, with a `system` option; the choice persists per user. |
| D-03 | A group carries a recurring weekly slot; a session is a single dated occurrence of that slot. |
| D-04 | Attendance marks are exactly four: present, absent, late, excused. |
| D-05 | Student status is derived from attendance records and workspace thresholds, never stored as truth. |
| D-06 | `excused` neither increments the absence streak nor enters the attendance denominator. |
| D-07 | A student may be enrolled in multiple groups. |
| D-08 | Attendance percentage is computed from records, never stored or estimated. |
| D-09 | Homework submissions are explicit per-student records. |
| D-10 | Attendance corrections create immutable revisions; history is never destroyed. |
| D-11 | The prototype's "Quiz" is the brief's paper assessment with manual grade entry. |
| D-12 | Permissions and tenancy are enforced server-side, never only in the UI. |
| D-13 | Platform administrators have no standing access to tenant content; break-glass access is audited and time-boxed. |
| D-14 | Payments are manually recorded facts about money the teacher received. Kashkol moves no money. **Superseded by `ADR-0028`** (session-scoped receipts). |
| D-15 | File visibility has exactly three scopes: teacher-only, selected groups, and selected students. |
| D-16 | Parent messages are prepared drafts; Kashkol never claims delivery. |
| D-17 | Online live meetings are never in scope; only externally produced recordings, in P3. |
| D-18 | Online quizzes/exams are a later phase (P3), distinct from paper assessments (P1). |
