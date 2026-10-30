# Kashkol — OpenCode Prompt Pack

A staged build plan for a production-minded, Arabic-first SaaS for Egyptian private teachers. Send **one prompt at a time, in order**. Do not paste the entire pack into one request; each stage should end with passing checks before the next one begins.

## Before you start

1. Create a new, empty Git repository/folder named `kashkol-teachers`. This is a new product build, not a continuation of an older Kashkol codebase.
2. Put the existing HTML prototype in `reference/Madar-Prototype.html` inside that repository. Treat it as a read-only visual/product reference, not production code. If you don't want it in the repository, keep it locally and adjust Prompt 1 to point at its path.
3. Open a terminal in the repository and start OpenCode there.
4. Use the normal build/editing agent. Review terminal commands and approve actions that create accounts, spend money, delete data, or deploy publicly. Do not paste real secrets into prompts.
5. Send Prompt 1 first, read its summary, then Prompt 2, and continue. If a prompt's exit criteria fail, ask OpenCode to fix those failures before moving on.

## Product decisions used throughout this pack

- Product: Kashkol, a multi-tenant SaaS for Egyptian private teachers who manage physical classes/groups and may employ assistants.
- Language: Arabic-first, excellent RTL behavior; complete English translation with LTR behavior. Light and dark themes. Mobile-first because attendance is often handled on a phone/tablet.
- Main product path: teacher/workspace → students and groups → calendar/sessions → attendance → individual parent updates → academic follow-up. Also plan payments, learning materials, reports, team roles, student/parent portals, and recorded-video support.
- First release focus: students, groups, schedule/sessions, reliable manual + QR attendance, session closeout, private parent notifications, basic payments, and useful reports. Homework/exams, portals, files, videos and advanced automation can follow in later stages.
- Do not build online meetings in this project’s first roadmap. Do not invent a differentiator or claim a feature is unique. Build a reliable, flexible product and keep the offer/positioning separate from engineering.
- Architecture preference: one maintainable full-stack web app instead of microservices. Use current stable versions of Next.js App Router + TypeScript, PostgreSQL, Prisma ORM, a compatible maintained authentication library, Tailwind CSS, and accessible UI components. Verify current official documentation and compatibility before selecting exact versions. Do not use prerelease dependencies for core infrastructure. If Prisma/Auth compatibility has changed, select a compatible stable combination and explain the choice in `docs/decisions/` before implementing it.
- Deployment target: Railway for the app and potentially PostgreSQL. Use S3-compatible object storage such as Cloudflare R2 or another supported provider for production uploads; do not depend on a local disk for durable production uploads. Implement providers behind adapters so credentials/providers can be configured later.
- Authentication/permissions: teacher workspace owners, assistants with limited permissions, parents, students, and a tightly restricted platform administrator. Every query and mutation must enforce workspace and record-level authorization on the server.
- Privacy: every parent sees only their own linked child/children; every student sees only their own allowed data. Never send a whole class’s attendance roster to a shared parents’ WhatsApp group. Parent communication must be private and individually scoped.
- Pricing/billing: initially support internal plan/status metadata and manually recorded student payments. Do not integrate a payment gateway or hardcode subscription prices until the owner chooses a provider and pricing.
- Integration rules: WhatsApp integration must use the official supported API/provider and be disabled cleanly when secrets are absent. Provide a development/test adapter that never sends real messages. Do not promise unlimited messages or assume group messaging is available. Video storage/streaming must use an external provider/adapter; do not build transcoding infrastructure.

## Definition of done for every stage

- Read the current repo and relevant docs before editing. Respect `AGENTS.md`.
- Implement the complete stage in small coherent changes; do not just describe the code or leave empty placeholders.
- Add or update tests. Run formatting/lint, type-check, relevant unit/integration tests, and production build where possible.
- Fix failures introduced by the stage. If a failure depends on missing external credentials or infrastructure, provide a clearly labelled mock/test path and a precise manual setup note; never pretend the live integration was tested.
- Keep `.env` and all secrets out of Git. Update `.env.example` with variable names only, never real values.
- Keep `docs/STATUS.md` up to date with implemented features, tests run/results, known limitations, required environment variables, and the next stage.
- At the end of each stage report: files changed, behavior delivered, commands/tests run, failures/limitations, and what I need to do manually. Do not move on to another stage automatically.

---

# Prompt 1 — Read the prototype and write the product specification

```text
We are starting Kashkol from scratch. Do not implement the application yet.

First inspect the repository and, if present, read `reference/Madar-Prototype.html` as a read-only reference. Study its actual screens, labels, layout, colors, typography, RTL/dark-mode styles, and visible interactions. Do not assume a feature exists in the prototype unless you find it. If the file is missing, say so and create the spec from the product brief below.

Create these documents:
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/USER_FLOWS.md`
- `docs/RELEASE_PLAN.md`
- `docs/OPEN_QUESTIONS_AND_ASSUMPTIONS.md`
- `docs/STATUS.md`

Product brief: Kashkol is an Arabic-first SaaS for Egyptian private teachers who manage in-person teaching groups and sessions. It should eventually support dashboard, students, groups, schedules/sessions, manual and QR attendance, session corrections/history, assistants and permissions, private parent updates, parents’ portal, student portal, homework, paper-exam grade entry, online quizzes/exams as a later phase, academic progress and follow-up, PDF/file sharing, recorded video through an external provider, manual payment tracking, and reports. Support Arabic/RTL and English/LTR, light and dark themes, and mobile/tablet use. Online meetings are explicitly out of initial scope.

Split requirements into P0 foundation, P1 first usable release, P2 expansion, and P3 advanced features. For each feature, define a user story and testable acceptance criteria. Identify dependencies, risks, privacy-sensitive data, integration dependencies, and what must not be faked. Describe the main roles: workspace owner/teacher, assistant, parent, student, and platform administrator. Design for multiple teacher workspaces with strict tenant isolation.

Do not claim a market gap or unique positioning. This is an implementation specification, not marketing copy. Mark assumptions distinctly from decisions. Keep the first release realistic. Do not ask me questions unless genuinely blocked; choose a conservative default and record it as an assumption.

At the end, summarize the scope, list any prototype sections you actually observed, and confirm no application code was implemented.
```

# Prompt 2 — Choose architecture and create the permanent project rules

```text
Using `docs/PRODUCT_REQUIREMENTS.md`, `docs/USER_FLOWS.md`, and the prototype reference, create a practical architecture for Kashkol before writing feature code.

Research current official documentation for the intended stack and verify compatible stable versions. Preferred direction: Next.js App Router + TypeScript, PostgreSQL, Prisma ORM, a currently maintained authentication library compatible with the selected Prisma version, Tailwind CSS, and accessible UI components. Do not assume the newest version of every package is mutually compatible. Avoid beta/canary packages for core infrastructure. Deployment should be possible on Railway.

Create:
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md` (initial ERD in Mermaid or another readable form)
- `docs/SECURITY_AND_PRIVACY.md`
- `docs/INTEGRATIONS.md`
- `docs/decisions/` with short architecture decision records for major choices
- A phased implementation checklist in `docs/STATUS.md`

The architecture must cover authentication/session handling, multi-tenant data boundaries, roles/permissions, database migrations, form validation, file storage abstraction, WhatsApp provider abstraction, notification/outbox/retry design, audit history, logging, automated tests, background work if needed, and deployment/migrations. Prefer a modular monolith; do not add microservices or Redis unless there is a demonstrated need.

Before implementing, identify any dependency compatibility issue from official docs. Pick a compatible stable stack and explain why. Define folder structure, naming rules, error handling, and test strategy. Ensure secrets are server-only. Do not put credentials in code.

Update or create `AGENTS.md` with durable instructions: use the requirements docs as source of truth; protect tenant/parent/student data; add tests for each behavior; run lint/typecheck/tests/build; update docs/STATUS.md; don't silently broaden scope; don't leave fake buttons or TODO placeholders in finished flows; inspect official docs before adopting uncertain APIs. If OpenCode supports `/init`, you may use it after the initial project files exist, then merge its useful findings into `AGENTS.md` without deleting project-specific security rules.

Do not implement business features in this stage. Report architecture decisions and remaining risks.
```

# Prompt 3 — Scaffold the application and developer experience

```text
Implement the application foundation from `docs/ARCHITECTURE.md`. Use the chosen compatible stable stack and exact versions documented in the architecture decisions.

Create the app scaffold, package scripts, `.gitignore`, `.env.example`, database/ORM setup, migration workflow, test setup, linting/formatting, type-check, production build, and a minimal health/status endpoint or page. Add a clear README with prerequisites and exact local setup commands. Provide a development database option that doesn't require production credentials. Add deterministic seed data for local development only, with fake people/data and clearly documented dev-only credentials if any. Prevent seeds/demo accounts from running automatically in production.

Set up a clean modular structure for feature modules and server-side services. Ensure all secrets are excluded from client bundles. Make the production build runnable on Railway and document the expected migration command. Don't add every feature yet and don't use fake data as if it were production data.

Run install, lint, typecheck, tests, database validation/migration checks, and production build. Fix all errors before finishing. Update `AGENTS.md`, `.env.example`, README, and `docs/STATUS.md`. Stop after the foundation works.
```

# Prompt 4 — Authentication, multi-tenancy, roles, and data security foundation

```text
Implement secure authentication and the multi-tenant authorization foundation according to `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, and `docs/SECURITY_AND_PRIVACY.md`.

Requirements:
- A user can sign up/sign in/sign out and recover access using a supported configured flow. If outbound email isn't configured, document the limitation and provide a safe development-only approach; never expose recovery tokens in production.
- A teacher can create/own a workspace. A workspace is the tenant boundary.
- Model workspace memberships and roles for owner/teacher and assistant. Support limited assistant permissions, not just a visual hide/show.
- Parents and students can later be linked to specific student records without being granted workspace-wide access. Leave a clear, tested authorization design for these links.
- Use secure, HTTP-only cookies/sessions, safe password handling through the chosen auth library, CSRF protections appropriate to the stack, server-side authorization, rate limiting for sensitive auth actions, validation, and safe error messages.
- No tenant-owned database read/write may rely only on a client-supplied workspace ID. Derive authorized workspace scope from the verified session and membership.
- Add tests proving workspace A cannot read or mutate workspace B data; assistants cannot perform owner-only actions; unauthenticated requests cannot access private routes; parents/students cannot gain access by changing a URL or ID.
- Add audit-event infrastructure for security-sensitive changes without logging passwords, tokens, or unnecessary personal data.

Use the official, current documentation for the chosen auth library. Do not write home-grown password crypto or roll a custom authentication protocol. Add migration files and `.env.example` updates. Run all relevant tests and report any setup that still requires manual secrets/configuration.
```

# Prompt 5 — Design system, app shell, Arabic/English, RTL/LTR, light/dark mode

```text
Build Kashkol's reusable UI system and authenticated application shell, using `reference/Madar-Prototype.html` as the visual reference where available. The HTML prototype is not production code; rebuild its useful design patterns using the app's component system.

Visual direction to preserve where useful: warm off-white/light surfaces, deep teal primary, restrained amber accent, charcoal dark mode, Cairo/Manrope-like readable typography, subtle borders, compact data tables, clear hierarchy, rounded but not overdecorated cards. Use actual values from the prototype when identifiable. Arabic is the default language and must render in true RTL; English must render in LTR. Do not merely translate labels while leaving alignment, icons, tables, dates, forms, or navigation direction wrong.

Implement:
- Shared app layout, responsive sidebar/navigation, top bar, workspace switch/context where relevant, breadcrumbs/page titles, profile menu, global search placeholder only if it actually works or omit it.
- Language switch Arabic/English, persisted safely per user/browser; translations stored in organized locale files, not scattered inline conditionals.
- Light/dark/system theme handling with persistence and correct contrast.
- Shared buttons, inputs, selects, dialogs, tables, cards, tabs, badges, dropdowns, empty states, skeletons, loading states, error states, toasts, confirmation dialogs, and form validation patterns.
- Responsive desktop/tablet/mobile design. Critical session/attendance actions must be comfortable on mobile.
- Keyboard navigation, visible focus states, semantic labels, accessible dialogs, and no color-only status meaning.

Wire the shell to real routes and authorization. For not-yet-built modules, show a clearly labelled planned state only in development; do not present nonfunctional controls as finished features. Add component/smoke tests and screenshots or a manual verification checklist where supported. Run all checks and update status docs.
```

# Prompt 6 — Students, guardians, groups, enrollment, import/export

```text
Implement the Students and Groups modules from the requirements and design docs. This stage must use the real database and authenticated server-side operations, not localStorage or hardcoded frontend arrays.

Students:
- Create/edit/view/archive students; list/search/filter/sort/paginate; student profile with relevant timeline sections prepared for attendance, grades, homework, and payment history.
- Store only necessary personal information. Support a student's name, school grade/level, subject/context where needed, student contact if appropriate, guardian contact details, internal notes, status, and workspace ownership. Validate Egyptian phone number input sensibly without assuming every number is valid merely because it has 11 digits.
- Prevent accidental duplicates with a reasonable matching/confirmation flow; do not silently merge records.
- Support CSV/XLSX import/export only with a maintained library and strict validation. Show a preview, row-level errors, duplicate warnings, and a final confirmation before committing. Protect against spreadsheet formula injection in exports.
- Archive rather than hard-delete students who have linked academic/attendance/financial records unless a safe data-retention workflow is explicitly implemented.

Groups:
- Create/edit/archive groups with subject, level, schedule defaults, location/room, capacity, and assigned assistants if applicable.
- Enroll and remove students with enrollment history; support a student belonging to more than one group where valid.
- Support group transfers without erasing historic attendance or grade records.

Apply tenant authorization to every operation, validate on server and client, provide empty/loading/error states, add tests for CRUD, invalid input, concurrent/duplicate operations, import validation, and cross-tenant access. Include safe sample seed data only for development. Update docs and run checks.
```

# Prompt 7 — Calendar, recurring schedules, and sessions

```text
Implement the Schedule/Calendar and Session modules backed by the database.

Requirements:
- Calendar views: agenda/list, week, and month if they remain usable on mobile.
- Create one-off and recurring group sessions; store date/time with a clearly documented timezone strategy appropriate for Egypt. Avoid silently changing session times when the browser timezone differs.
- Session details include group, start/end, room/location, responsible teacher/assistant, status, roster snapshot or an equivalent model that preserves the correct attendance context, and notes as appropriate.
- Session statuses: scheduled, started, completed, cancelled. Make state transitions explicit and validated.
- Edit a single occurrence or the series in recurring schedules with clear confirmation. Prevent duplicate generation and handle daylight/timezone edges.
- Detect obvious room/teacher/group time conflicts and explain the conflict before saving; do not silently reject without feedback.
- Handle group changes, substitute sessions, make-up sessions, cancellations, and students attending a different group without corrupting prior records. Keep a history of important changes.
- Provide create/edit/cancel/reschedule flows, authorization, confirmations, loading/empty/error states, and tests for recurring rules, conflicts, timezone serialization, and tenant isolation.

Don't implement attendance scanning yet except a clear route/action to start an eligible session. Run all tests, type-check and build; update docs/STATUS.md.
```

# Prompt 8 — Attendance, QR scanning, exceptions, and session closeout

```text
Implement the production-minded Attendance workflow. This is one of Kashkol's core modules, so prioritize reliability and speed on phones/tablets.

Workflow: authorized teacher/assistant opens a scheduled session → sees the relevant roster → records attendance by QR scan or manual selection → resolves exceptions → reviews the complete roster → closes/submits the session → attendance records are persisted and an event is created for any configured parent notification.

Requirements:
- Attendance statuses at minimum: present, absent, late, excused. Use a clear representation for not-yet-recorded rather than treating it as absent.
- QR codes must contain an opaque random token or appropriately signed identifier, not exposed personal details, phone numbers, or predictable student IDs. Support issuing/rotating a student's attendance QR and scanning through a phone/tablet camera using a maintained library. Explain camera permission/HTTPS requirements. If camera access fails or a code is missing, manual attendance remains available.
- Prevent duplicate check-ins, scans for a different workspace, scans outside the authorized session, and accidental double submission. Show clear messages for unknown QR, already checked-in student, inactive student, or unexpected attendee.
- Support a valid student attending a different group/make-up session without changing their original enrollment history. Require the authorized operator to record the reason/context.
- Allow edits before closeout. Post-close corrections require permission, a reason, and an audit history of who/when/old value/new value. Never silently overwrite history.
- Session closeout summary must show present/late/absent/excused/unrecorded counts, warn about unrecorded students, and require explicit confirmation if the operator closes with incomplete records.
- Persist an idempotent attendance event/outbox item for private parent notifications; the attendance transaction should succeed even if WhatsApp is unavailable.
- Handle poor connectivity transparently. Do not claim offline support unless it is actually implemented and tested; if adding a local pending queue, resolve sync conflicts and make unsynced status visible.

Add tests for every status transition, duplicate scan, simultaneous scan requests, session/workspace mismatch, correction auditing, closeout counts, partial submissions, and QR-token privacy. Use a simulated scanner test path so automated tests don't require a camera. Run checks and update docs.
```

# Prompt 9 — Parent contact, notifications, WhatsApp adapter, delivery log

```text
Implement private parent communication and a reliable notification pipeline, starting with attendance notifications.

Requirements:
- Model the relationship between a student and one or more authorized guardians. Verify that a guardian can only see linked children. Avoid exposing a whole group's roster or another child's information in message text, URLs, logs, or portal responses.
- Build an in-app notification/outbox model with idempotency keys, status, attempts, timestamps, provider reference, and a safe last-error summary. Retry transient errors with bounded backoff; do not retry invalid numbers or permanent rejection forever. Provide a way to inspect failed messages and retry where authorized.
- Create a provider interface. Implement a fake development/test provider that never sends external messages, plus a production adapter for the official supported WhatsApp Cloud API or another explicitly configured provider, based on current official documentation. If credentials are missing, the integration must remain disabled and say so clearly.
- Send one-to-one private messages to the relevant guardian only. Do not send class rosters to WhatsApp groups. Keep message content minimal and privacy-conscious. Handle opt-out/consent/preferences and required provider template rules as applicable.
- Keep secrets server-only. Verify provider webhook signatures if webhooks are supported, make webhook handling idempotent, and avoid logging access tokens or entire personal message bodies unnecessarily.
- Add templates for attendance status, session cancellation/reschedule, homework notice, and exam result, but only send types triggered by working flows. Support Arabic and English templates and ensure Arabic text direction is correct.
- Add per-workspace notification settings, quiet/delivery controls if required, provider config status, delivery log, and estimated usage count so later pricing can account for message costs. Do not promise unlimited messages.

Tests must prove that one student's attendance never generates a message containing another student's data, failed messages don't undo attendance, duplicate events don't duplicate messages, unauthorized users cannot inspect logs, and the fake provider never sends live traffic. Document manual Meta/provider configuration and any limitations. Run all checks.
```

# Prompt 10 — Homework, paper exams, online quiz foundation, grades, follow-up

```text
Implement Homework, Assessments/Exams, Grades, and Student Follow-up based on the release plan.

Homework:
- Create assignments for a group or selected students with title, instructions, due date, attached permitted resources, and status.
- Record completion/submission status and teacher feedback/grade where applicable. Do not imply online file submission works until implemented.

Assessments:
- Support paper exams/quizzes where the teacher manually records a student's score, max score, date, assessment type, and optional note.
- Validate score range and prevent a score above the maximum unless an explicit extra-credit policy is configured.
- Show per-student results and group summaries, averages, trends, and assessment history. Define how missing/excused/not-taken results affect averages; don't treat missing data as zero without making that rule explicit.
- Keep changes to grades auditable; restrict edit permissions appropriately.

Student follow-up:
- Add transparent, rule-based flags such as repeated absences, overdue homework, or declining assessment results. The rule and source records must be visible; avoid unexplained AI labels or claims about a student.
- Let authorized teachers/assistants create a follow-up task/note, set owner and due date, mark outcome, and review history.
- Parent-facing grades/notes must only be available through explicitly authorized fields and routes.

Do not build a full online exam authoring engine in this stage; record it as a later phase unless a minimal prerequisite is needed. Add tests for calculations, missing grades, grade correction audit, flags' rules, permissions, and tenant isolation. Run all checks and document behavior.
```

# Prompt 11 — Learning materials, secure files, and recorded-video integration seam

```text
Implement the Learning Materials library and a production-appropriate file-storage abstraction.

Requirements:
- Upload, list, organize, rename, and archive PDFs/images/documents with title, description, subject/topic, owner, access scope, and workspace association.
- Access scopes: teacher-only, selected groups, selected students, or explicitly authorized parent/student access where appropriate. Verify permission on every download/view request; obscuring a URL in the UI is not authorization.
- Set file size/type limits; validate MIME type and extension; generate safe storage keys rather than using user file names as paths; prevent path traversal; do not allow executable content. Add safe filenames on download and appropriate response headers.
- Use local/dummy storage only for development if needed, and a documented S3-compatible adapter for production object storage. Prefer signed short-lived URLs after authorization. Do not store large uploads in the PostgreSQL row or rely on ephemeral app disk for durable production files.
- Show upload progress, error/retry behavior, storage usage, and useful empty states. Never leak private materials between tenants.
- Add a video-provider abstraction and a placeholder configuration/status UI only if useful. Do not claim Kashkol hosts protected video until a specific provider is configured and tested. Keep video streaming/transcoding external; plan secure playback authorization and storage/egress limits.

Test denied cross-tenant downloads, denied student/parent access outside assigned resources, invalid file types/sizes, expired signed URLs where testable, and deletion/archive behavior. Document required storage variables and run all checks.
```

# Prompt 12 — Manual payments, fees, and operational reports

```text
Implement manual student payment tracking and reports. Do not integrate an online payment gateway in this stage.

Requirements:
- Record a payment against a student, including amount in EGP, payment date, method (cash/other configured method), period or purpose, reference/receipt number if applicable, and authorized operator. Use decimal-safe money handling; never use floating-point arithmetic for currency.
- Support partial payments, outstanding balances, discounts/adjustments with reasons, and refunds/corrections as separate auditable records rather than silently rewriting past payments.
- Allow a teacher to configure simple fee conventions such as monthly/group fee or another agreed structure. Do not invent an invoicing/tax/accounting product beyond scope.
- Show student balance and collection history. Reconcile totals from persisted transactions and define handling of cancelled sessions/make-up sessions explicitly; don't automatically bill based on attendance unless the workspace opted into that rule.
- Reports: attendance by date/group/student, enrollment, academic results, homework completion, and collected/outstanding amounts. Apply active filters in the exported report. Export CSV and/or PDF with authorization, pagination/limits, and spreadsheet-formula injection protection.
- Restrict payment pages/reports to owners and explicitly authorized assistants; parents may see only their own linked child's approved balance/receipts if enabled.
- Handle empty data, date range/timezone, large datasets, invalid amount, duplicate submission, and corrected/refunded payment states.

Add tests for currency rounding, partial payment balances, corrections/refunds, report filtering, export security, permissions, and tenant isolation. Run checks and update status docs.
```

# Prompt 13 — Assistant management and fine-grained workspace settings

```text
Complete teacher workspace administration and assistant collaboration.

Requirements:
- Invite/create an assistant using the configured safe account flow, assign them to the correct workspace, suspend/revoke access, and handle an invitation expiring or being reused.
- Define server-enforced granular permissions for actions such as view/edit students, manage groups, run sessions, record/correct attendance, view grades, manage homework, view financial data, export records, configure integrations, and manage team members. Owners retain full workspace control; assistants do not implicitly get every permission.
- Provide a clear permission editor with safe defaults and a warning for sensitive capabilities. Verify changes server-side on every action, not just by hiding menu entries.
- Provide workspace profile, name/subject/grade conventions, locale, timezone, attendance rules, parent-notification preferences, and other settings already supported by real logic. Do not show toggles that have no effect.
- Add audit history for permission, membership, financial, and post-close attendance changes. Ensure audit logs themselves are access-controlled and don't contain secrets.
- Add tests proving every role/permission boundary works through direct requests as well as UI navigation, and that revoking a membership immediately blocks further access.

Run checks and update docs/STATUS.md.
```

# Prompt 14 — Parent/student portals and installable PWA notifications

```text
Implement the parent and student experiences as separate role-protected areas. These are privacy-sensitive; default to minimum necessary access.

Parent portal:
- A parent can view only explicitly linked children, their permitted attendance, relevant grades, assigned homework, published resources, approved payment/balance data, schedule changes, and private notifications.
- A parent cannot browse the teacher's full student list, other guardians, other children's data, private teacher notes, or internal assistant activity.
- Provide invitation/account linking/revocation with a verified process. No linking merely because someone types a student's name or guesses a phone number.

Student portal:
- A student can view only their own upcoming sessions, attendance where allowed, assigned homework, published grades, and materials shared with them.
- Ensure unpublished grades/drafts/private notes do not appear.

PWA/push:
- Add a web app manifest, suitable icons, service worker and installable experience where supported. Add web-push notifications only with a documented provider/configuration and explicit permission. The app must continue to work if push is unsupported or permission is denied; never repeatedly nag for permission.
- Document platform-specific limitations, especially iOS Home Screen installation/permission requirements. Keep a reliable in-app notification center as a fallback.
- Notification payloads must not expose grades or sensitive details on a locked screen unless the user explicitly opts in; default to generic text with secure link to the portal.

Test direct URL/API access across parent/student accounts, multiple children, revoked links, unpublished/private records, and tenant boundaries. Add end-to-end tests where feasible; run all checks and document any push configuration that requires secrets.
```

# Prompt 15 — Video lessons through an external provider; optional online exams

```text
Implement the P3 learning-media and online-assessment expansion only after the core product is stable. First inspect the existing architecture and verify this work will not disrupt attendance or parent/grade access.

Recorded videos:
- Integrate through a provider adapter, not self-built video transcoding. Use the selected provider's current official API/docs. Support title, description, course/group/topic association, publication state, thumbnails/metadata, and access permissions. Don't expose provider secrets or unrestricted private playback URLs.
- Provide clear setup docs and a working fake provider for tests. When no provider is configured, show a setup state rather than fake hosted videos.
- Track limits/cost drivers where possible (storage, bandwidth, video count); don't promise unlimited storage.

Online exams/quizzes only if the core test suite remains green:
- Teacher can create a basic question set, assign it to a group/selected students, set availability window and attempts, and preview before publishing.
- Student enters only via authenticated/verified access—not an unprotected name/phone lookup alone. Enforce exam assignment and time window on the server.
- Support clear question types and deterministic grading rules, save responses safely, prevent accidental duplicate final submissions, and provide results only according to publish settings. Record grade corrections/audit events.
- Treat cheating prevention claims conservatively; don't claim lockdown-grade protection in a browser.

If any provider or exam design decision isn't supported by available credentials, implement only the provider interface/settings and report what is unverified. Add focused tests, update docs, and run all checks.
```

# Prompt 16 — SaaS platform administration, workspace plan flags, and usage visibility

```text
Implement only the minimum platform-level administration needed to operate Kashkol as a SaaS. This is different from a teacher's workspace dashboard.

Requirements:
- A secure platform-admin role provisioned through a documented, non-public process; never make the first user or a hardcoded email an automatic super-admin in production.
- Admins can view high-level workspace/account status, created date, plan/status metadata, integration readiness, and usage summaries needed for support. Avoid default access to private student notes, grades, or guardian data. Any break-glass support access must be explicit, time-limited, reasoned, auditable, and preferably avoided in the MVP.
- Workspace plan/status fields and feature/usage limits must be centralized and configurable rather than scattered across UI and API code. For now, do not charge cards or integrate an online SaaS billing provider, and do not hardcode final prices. Support manual plan assignment/status for pilots.
- Usage visibility for message counts and file/video storage where the system can measure it. Display that measurements may be estimates when provider data is unavailable.
- Admin actions must use strong authorization, confirmation for destructive/sensitive actions, and audit history. Do not build a general-purpose backdoor.

Add tests that normal teachers/assistants/parents/students cannot access platform-admin routes and that plan/feature limits are enforced on server actions, not merely hidden in navigation. Run checks and document the support runbook.
```

# Prompt 17 — Integrate workflows, remove dead ends, and polish the experience

```text
Review the entire product against `docs/PRODUCT_REQUIREMENTS.md` and `docs/USER_FLOWS.md`. Do not add new major features in this stage. Integrate the working features end-to-end and eliminate dead ends.

Verify the real end-to-end teacher journey:
1. Sign up/sign in and create workspace.
2. Add/import students and create groups.
3. Schedule a recurring session.
4. Open a session, scan QR/manual attendance, handle an exception, review and close it.
5. Verify persisted attendance and correct private parent notification outbox events.
6. Review a student history and add homework/grade/follow-up as available.
7. Record a payment and run a date-filtered report/export.
8. Add an assistant with limited permissions and verify a forbidden action fails.
9. Link a parent/student account and verify each sees only allowed data.
10. Upload/share a file, and verify unauthorized access fails.

Review every route and visible button. No button should do nothing: implement its behavior, provide a truthful disabled/setup state, or remove it from the release. Ensure loading/empty/error/success states, validation messages, useful confirmation dialogs, mobile session operation, Arabic RTL, English LTR, and dark mode all work. Preserve design consistency and avoid unnecessary animations/decorations.

Add or fix Playwright end-to-end tests for the highest-risk workflows. Use test data and fake notification/storage/video providers; tests must never send real messages or expose production information. Run the full lint, typecheck, unit/integration, e2e (where configured), migration checks, and production build. Update the known-limitations list accurately.
```

# Prompt 18 — Security, privacy, accessibility, and production-readiness audit

```text
Act as an independent reviewer of Kashkol. First inspect the entire codebase and docs without making changes, then produce a prioritized audit in `docs/PRODUCTION_READINESS_AUDIT.md`. Focus on exploitable issues and data loss, not style preferences. After presenting the findings, fix the critical and high-severity findings in a second pass and add regression tests.

Audit at least:
- Cross-tenant access and insecure direct object references in every server action/API route.
- Parent/student record scoping and authorization of files, grades, notes, payments, notifications, and exports.
- Authentication/session/logout/password recovery, rate limits, CSRF, secret exposure, and security headers.
- Input validation, SQL/ORM misuse, stored/reflected XSS, unsafe uploads/downloads, file size/content checks, signed URL lifetime, and spreadsheet formula injection.
- QR token entropy/leakage/revocation and replay/duplicate behavior.
- Notification/outbox idempotency, webhook signature verification, retry loops, sensitive logs, and prevention of real messages in tests.
- Audit-log integrity and permissions, destructive actions, data retention, backups/restore documentation, database migrations, error handling, and rate/resource limits.
- Accessibility of forms/tables/dialogs and RTL/LTR layout correctness.
- Dependencies with known advisories using the package manager's supported audit tools; don't automatically upgrade major versions without compatibility checks.

Use automated scanning and tests where available. Do not claim a penetration test was performed unless an actual test was run. Do not modify or expose real production data. Fix high-risk issues, run relevant tests, and document anything that requires human action or external configuration. Keep the audit factual with severity and evidence.
```

# Prompt 19 — Deployment to Railway and operational runbooks

```text
Prepare Kashkol for deployment to Railway with PostgreSQL, using official current Railway and framework documentation. Do not deploy publicly or run destructive database commands without my explicit approval.

Create/update:
- `Dockerfile` or a supported Railway build configuration, health check, production start command, and safe graceful shutdown behavior where appropriate.
- `README.md` deployment steps and `docs/DEPLOYMENT.md` with exact steps for creating Railway app + PostgreSQL, configuring environment variables, domain/HTTPS, storage provider, auth URL/cookie settings, email/recovery provider, WhatsApp provider/webhooks, video provider if used, and PWA push keys if used.
- `.env.example` listing every required/optional variable by purpose, with no real secret values.
- A safe production migration strategy using versioned migrations and Railway's pre-deploy command if appropriate. Do not auto-reset, drop, or seed a production database.
- Logging/health checks and basic error visibility without logging secrets or unnecessary student/parent personal data.
- Backup/restore guidance and a tested restore procedure against a disposable local/test database if feasible. State exactly what was and wasn't tested.
- A smoke-test checklist after deployment covering sign-in, tenant isolation, create student/group, schedule session, attendance, notification fake/live config, upload access, report, and mobile/RTL behavior.

Run local production build and tests first. Validate config without printing secret values. Stop before live deployment and ask me to approve the actual deploy and any paid service setup. If a live deployment is approved later, verify the deployed health endpoint and logs without exposing private data.
```

# Prompt 20 — Final acceptance test and handoff

```text
Perform final acceptance testing using the release acceptance criteria in `docs/PRODUCT_REQUIREMENTS.md`. Do not add new product features unless a blocking defect requires it.

Deliver the following documents:
- `docs/FINAL_ACCEPTANCE_REPORT.md` with each P0/P1/P2/P3 item marked implemented, partial, not implemented, or unverified, supported by evidence/tests.
- `docs/LOCAL_DEVELOPMENT.md` with copy-paste commands for a non-expert to install dependencies, configure a local database, apply migrations, seed development data, run tests, and start the app.
- `docs/OPERATIONS_RUNBOOK.md` for backups, migrations, failed notifications, storage/provider errors, user access problems, and rollback basics.
- `docs/KNOWN_LIMITATIONS.md` listing all external credentials/services, provider costs to investigate, security/privacy caveats, and anything not production-verified.

Run the complete automated test suite, lint, typecheck, migration validation, dependency audit, and production build. Resolve failures caused by our code. Never mark a feature complete just because a route or UI exists: it must persist data, enforce authorization, handle errors, and have meaningful verification. Distinguish automated tests from manual checks and external services that weren't configured.

Finish with a concise handoff: what currently works, the exact local run command, exact environment variables I must configure (names only), test/build results, whether production deployment has actually happened, and the three most important remaining actions. Do not claim production-ready if any blocking security, data integrity, or deployment issue remains.
```

---

## If OpenCode gets stuck or starts changing too much

Use this recovery prompt:

```text
Stop adding scope. Re-read `AGENTS.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, and `docs/STATUS.md`. Summarize the current broken behavior and reproduce it with a test or command. Make the smallest safe fix, add a regression test, run the relevant checks, and update `docs/STATUS.md`. Do not rewrite the architecture, replace major libraries, delete existing functionality, or proceed to another stage without explaining why the current stage passes its acceptance criteria.
```

## Official references for OpenCode and the stack

- OpenCode project instructions / `AGENTS.md`: https://docs.opencode.ai/docs/rules/
- OpenCode overview and initialization: https://docs.opencode.ai/docs/
- Prisma + Better Auth + Next.js compatibility guide: https://www.prisma.io/docs/guides/authentication/better-auth/nextjs
- Railway + Next.js + PostgreSQL deployment: https://docs.railway.com/guides/nextjs
- Railway PostgreSQL: https://docs.railway.com/databases/postgresql
