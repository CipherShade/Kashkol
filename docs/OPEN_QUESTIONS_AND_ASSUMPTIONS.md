# Kashkol — Open Questions and Assumptions

**Status:** Draft v0.3 · **Date:** 2026-11-13 · **Owner:** Product
**Change:** `OQ-20` added on 2026-11-11 to record that the direct student-level fee rule vs. group monthly fee interaction in `ADR-0025` is an **open product decision**; the implementation's behaviour is recorded as the default until decided, not as a decided rule.
**Change:** `OQ-20` marked **superseded by `ADR-0028`** on 2026-11-13; student-level fee rules no longer exist, so the question can no longer arise. `F-P2-04` and `D-14` are likewise superseded by `ADR-0028`.
**Companions:** `PRODUCT_REQUIREMENTS.md`, `USER_FLOWS.md`, `RELEASE_PLAN.md`

> **Nothing in this document blocks the build.** Every open question below already carries a
> **conservative default** that the specification assumes. If the question is never answered, the
> default stands and the product is still coherent. If the answer contradicts the default, the
> affected requirements change — this document records that consequence in advance so the change is
> a controlled edit rather than a redesign.

---

## 1. How to read this document

| Marker | Meaning | Where it appears |
|---|---|---|
| **Decision** (`D-n`) | Already settled. Binding. | `PRODUCT_REQUIREMENTS.md` §3 and §15 |
| **Assumption** (`A-n`) | A gap in the brief, filled with a conservative default. Binding until changed. | This document §3 |
| **Open question** (`OQ-n`) | A genuine unknown with more than one reasonable answer. The listed default applies until resolved. | This document §4 |
| **Defect** (`DEF-n`) | An observed flaw in the reference prototype that must not be carried forward. | `PRODUCT_REQUIREMENTS.md` §14 |

**Resolution rules**

1. A default may only be changed by an explicit written decision recorded here, with a date and an
   owner.
2. Changing a default requires a **traceability sweep**: the affected `F-Px-nn` requirements,
   `F1`–`F26` flows, and milestone scope in `RELEASE_PLAN.md` §12 are updated in the same change.
3. No default is ever resolved by "building it and seeing what happens" when the answer affects a
   stored data model. Data-model defaults are the most expensive to change.
4. An open question that is still open at the start of its deadline milestone is **escalated**, not
   silently carried. The default still applies, but the milestone entry criteria are re-checked.

---

## 2. Summary

| Class | Count | Blocking? |
|---|---|---|
| Assumptions | 22 (`A-01`–`A-22`) | No — each has a default |
| Open questions | 22 (`OQ-01`–`OQ-22`) | No — each has a default and a decision deadline |
| External dependencies tracked in §7 | 6 | Yes for the milestone that depends on them — see `RELEASE_PLAN.md` §9 |

**Deadline horizon**

| Milestone | Questions that must be closed by its start | Questions that may remain open |
|---|---|---|
| M0 | `OQ-01` (team), `OQ-18` (audit visibility), `OQ-10` (retention) | all others |
| M1 | `OQ-07` (search scope), `OQ-14` (offline), `OQ-12` (file limits) | portal, payments, QR, video, billing questions |
| M2 | `OQ-02` (parent linking), `OQ-03` (student auth), `OQ-05` (QR capture), `OQ-06` (notes to parents), `OQ-09` (OTP provider) | `OQ-20` moot (superseded by `ADR-0028`); video, billing, exam-bank questions |
| M3 | `OQ-04` (pricing), `OQ-08` (video provider), `OQ-11` (question source) | — |

---

## 3. Assumptions

Each assumption states: the assumption, the default, why this default is the conservative choice,
what would invalidate it, and what it affects.

### 3.1 Product and technical

| ID | Assumption | Default | Why this is conservative | Invalidated if | Affects |
|---|---|---|---|---|---|
| **A-01** | The implementation stack is not specified by the brief. | A TypeScript-first stack with a server-side runtime, a relational database with enforced row-level tenancy, and a component-based UI framework that supports CSS logical properties. Specific products are chosen at project start; the **architecture constraints** are already fixed by the requirements (server-side tenancy, real auth, `localStorage` is not acceptable, URL routing required). | Fixing the *constraints* rather than the *products* avoids rework while leaving procurement free to pick tools. | A mandated stack appears that cannot express the constraints (e.g. no server-side data access). | `F-P0-01`–`F-P0-05`, M0 |
| **A-02** | The week starts on Saturday. | Week start = **Saturday** for every calendar view, matching the Egyptian school week and the prototype's seeded Sat/Mon groups. | The prototype rendered `["sun"…"sat"]` while computing the week from `getDay()` (Sunday) — one rule must win, and the seeded data indicates Saturday. | A workspace needs a different week start (e.g. a corporate training business). | `F-P1-05`, `F-P2-07`, DEF-03 |
| **A-03** | The tenant's operating timezone. | Each workspace stores a timezone; default **`Africa/Cairo`**. Dates are stored as UTC instants plus the workspace timezone, never as naive local dates. | The prototype's `toISOString()` calls shifted sessions by a day in Cairo — storing the timezone explicitly is the only fix. | A workspace operates in another timezone permanently (they can still change it). | `F-P1-05`, `F-P1-07`, DEF-02 |
| **A-04** | Currency. | **EGP** only, no multi-currency, no FX. Amounts stored as integer piastres to avoid float drift. | Kashkol records money the teacher received; multi-currency adds rounding and display complexity with no observed need. | A workspace operates in another currency. | `F-P2-04` |
| **A-05** | The attendance-rate denominator. | Attendance % = `present + late` ÷ `(present + late + absent)`. `excused` sessions are excluded from **both** numerator and denominator. The denominator counts only sessions the student was enrolled in, excluding cancelled sessions. | Matches decision `D-06` and mirrors how Egyptian schools report attendance; excluding excused absences avoids punishing a teacher for a justified absence. | The convention the target teachers actually use differs — this must be confirmed with the beta cohort before M1 ships. | `F-P1-06`, `F-P1-12`, `F-P2-06`, `D-05`, `D-06` |
| **A-06** | Terminology for assessments. | "Assessment (paper)" = the prototype's Quiz feature (teacher-entered scores). "Online exam" = the P3 feature. The word "Quiz" is retired from the UI to avoid confusion. | The brief calls the grade-entry feature a paper exam; the prototype called it a quiz; the P3 feature is an exam. Two similar names cause real user errors. | — | `F-P1-09`, `F-P3-01`, DEF-19 |
| **A-07** | Grade scale. | Each assessment carries its own `max_score`; results are shown as a score and a percentage. No GPA, no class rank, no weighted cumulative average in P1/P2. | Percentage-per-assessment is unambiguous and is what the prototype's score inputs already imply. Cumulative weighting requires a curriculum model that does not exist. | A curriculum model is adopted (then see `OQ-11`). | `F-P1-09`, `F-P1-12`, `F-P2-06` |
| **A-08** | Session materialisation horizon. | Sessions are generated per group on a rolling **8-week** horizon and are individually editable/cancellable. A "generate more" action extends the horizon. | The prototype generated sessions ad hoc; a bounded horizon prevents a 10-group workspace from creating thousands of rows. | Teachers report that 8 weeks is too short to plan term. | `F-P1-05`, `F-P2-12` |
| **A-09** | File limits. | PDF, images (JPG/PNG), and Office documents. Max **25 MB** per file. Every upload is virus-scanned and stored outside the web root with signed, expiring URLs. | A conservative size limit protects shared hosting and the scanner pipeline; signed URLs are the minimum for tenant isolation of files. | The real-world distribution of teacher files shows PDFs of a different size class. | `F-P1-11`, `F-P2-11` |
| **A-10** | Commercial model during the build. | **No pricing is implemented** in P1/P2. The private beta is free; a paid pilot is manual (invoice + access control) until billing exists in P3. | Implementing billing before the product is proven risks charging for the wrong thing; manual access control keeps money out of the P1/P2 codebase entirely. | `OQ-04` resolves differently. | `F-P3-04`, M1/M2 pilot |

### 3.2 Privacy, legal, and operational

| ID | Assumption | Default | Why this is conservative | Invalidated if | Affects |
|---|---|---|---|---|---|
| **A-11** | The categories of personal data Kashkol handles. | Only what the teaching relationship requires: name, grade, phone, parent phone, and teacher-authored notes. **No** national ID, **no** biometrics, **no** precise location, **no** religion/political data, **no** sensitive-category data of any kind. | A private teacher's roster does not need government identifiers. Collecting less is the safest default for minors' data. | A legally required field appears (for example, a national registry obligation). | `F-P0-08`, §9 privacy register |
| **A-12** | Platform-administrator visibility. | Administrators see **operational metadata only** (workspace status, plan, counts). Break-glass content access is explicit, time-boxed, audited, and **visible to the workspace owner in their Activity Log**. | The prototype had no admin concept; the safest default is that a tenant's data is invisible to the platform unless a human, accountable, time-boxed exception is made. | The support model proves unworkable without content access. | `F-P3-03`, `D-13`, `F26` |
| **A-13** | Theme default. | Default follows the operating-system preference; the user can override with an explicit control; the choice persists per user. | The prototype defined dark tokens but never set `data-theme`, so dark mode was only reachable by OS preference. Making the OS preference the default preserves that behaviour while adding a real control. | — | `F-P0-04`, `D-02`, DEF-13 |
| **A-14** | Data retention for deleted workspaces and accounts. | A deleted workspace is soft-deleted for **30 days** (recoverable by the owner), then hard-deleted from the database and from object storage within a further **30 days**. Backups expire on a **35-day** cycle. | Teachers delete a workspace by accident; a reversible window is cheap insurance. Backups must not become an unbounded shadow copy of deleted data. | A legal review requires a different window. | `F-P0-08`, `F-P2-11`, `F-P3-04` |
| **A-15** | How ungraded assessment results affect averages. | Only `graded` results contribute; their percentages (`score / max_score`) are averaged arithmetically. `missing`, `excused`, and `not_taken` results are excluded, never converted to zero. | A zero would misstate a result that is absent or not applicable and would silently depress the student's average. | A curriculum-approved weighted or alternative grading policy is adopted. | `F-P1-09`, `F-P2-06` |
| **A-16** | Extra-credit scoring. | Extra credit is disabled by default. An assessment may explicitly allow a finite number of additional points above its maximum; negative scores remain invalid. | The score limit is unambiguous unless the teacher deliberately configures extra credit for that assessment. | The grading policy needs a different cap or normalization. | `F-P1-09` |
| **A-17** | Transparent follow-up flag rules. | A repeated-absence flag uses the workspace `at_risk_after` threshold (default 2 consecutive absences in one group); overdue homework means `not_submitted` past its due instant; declining results means the latest three graded assessment percentages average below the preceding three. Missing/excused/not-taken results are excluded. | Every flag can be explained from visible source records without inferring a diagnosis. A full rule-editor for every rule is not part of this implementation. | Beta teachers need different homework or assessment windows/thresholds; add workspace configuration through a new requirement/decision. | `F-P2-06` |
| **A-18** | Student portal credential model. | A student signs in at `/{locale}/portal` with a username equal to their normalised E.164 phone and a teacher-generated readable password (`KSH-XXXX-XXXX`). No activation step, no self-set password; the code is shown to the teacher exactly once and stored only as a scrypt hash. Regeneration replaces the hash and revokes sessions atomically. | It reuses the "teacher is the trust anchor" model (`OQ-03` default (a)) without inventing a second credential type, and it needs no student email address — which `A-11` and `OQ-03` both anticipate. The one-time reveal matches how the product already handles parent invitations (codes are shown, not delivered). | A cohort of beta students already has email access and prefers email links; the email-link path (`OQ-09`) can be extended to students then. | `F-P2-03`, `F18` |
| **A-19** | Phone disambiguation for student credentials. | A phone authenticates exactly one student **per workspace** (partial unique index `student_workspace_phone_unique`). The same phone may hold credentials in multiple workspaces; sign-in resolves by phone and the supplied password selects the account. | The candidate scan is bounded (a handful of accounts per phone in practice) and the password check is the discriminator; no tenant context exists at sign-in, so a global lookup is unavoidable. Rejecting cross-workspace reuse would contradict multi-workspace families. | A decision is made to enforce globally unique phones (would need a different username shape or phone portability rules). | `F-P2-03` |
| **A-20** | ~~QR access for student portal sign-in.~~ **Superseded by A-21.** | The printed QR encoded `/{locale}/portal?t=<token>`, a 30-day opaque *prefill* token stored as SHA-256. It was not an authentication secret: the password was still required. Disabling, regenerating, or removing the phone invalidated the token. | Reusing the QR aesthetic (`OQ-05`) without creating a second bearer credential kept the minors-safety bar: the QR alone could never sign in, and revocation was tested. | Teachers require fully touchless sign-in; that is a new requirement with a different threat model, not an extension of this token. | `F-P2-03` |
| **A-21** | Attendance QR is for identification only; portal sign-in is password-only. | The student's QR code is the signed attendance token (`kqr_v1.<studentId>.<nonce>.<signature>`, `student.qr_token_hash`). It never signs a student in, resets a password, or activates an account; scanning it records attendance and cannot authenticate anyone. The `/{locale}/portal?t=<token>` prefill token is removed entirely (`ADR-0027`). Teachers download/print the attendance QR on student creation; regeneration invalidates the old identifier; scanning runs under the same attendance authorization rules as manual marking. | Reusing the QR aesthetic without creating a second bearer credential keeps the minors-safety bar: the QR alone can never sign in, and revocation is tested. The phone-username password is the only portal credential. | Teachers require fully touchless sign-in; that would be a new requirement with a different threat model, not an extension of this token. | `F-P2-03` |
| **A-22** | A grade-level session's roster is a **snapshot taken at creation**, not a live query. | The roster is materialised from every student currently enrolled in a non-archived group whose `grade` matches the session's `grade_label`. Later enrollment changes do not move it; only explicit teacher add/remove edits the roster, and a manual addition is recorded with `origin = manual`. | A live roster would change the meaning of recorded attendance after the fact: a student enrolled later would silently appear marked "not recorded" on a past session, and a student who left every group would silently vanish from one. Materialising the roster keeps every roster change a visible act and preserves unfalsifiable history. | Beta teachers expect grade sessions to follow enrollment changes live, or need to re-snapshot an existing session. | `F-P1-05`, `F-P1-06`, `F8`, `ADR-0029` |

---

## 4. Open questions

Each question records the realistic options, the **default that applies until answered**, the impact
of each answer, and the deadline. No question blocks the build.

### 4.1 Product and delivery

| ID | Question | Options | Default until answered | Impact of a different answer | Decide by |
|---|---|---|---|---|---|
| **OQ-01** | What team shape and delivery model is assumed? | (a) small full-stack team; (b) contract team; (c) founder + specialists; (d) outsourced build | **(a)** — a small cross-functional team owning the whole vertical. | Milestone durations in `RELEASE_PLAN.md` §2–§5 are indicative and scale directly with team size. | Before M0 starts |
| **OQ-07** | What does global search cover? | (a) students only (prototype); (b) students + groups; (c) students, groups, sessions, homework, assessments, files, notes | **(b)** — students and groups, matching the prototype, extended later. | (c) requires an index across many entity types with Arabic normalisation and Arabic substring matching, which is significantly more work than it appears; defer to M2. | Before M1 scope freeze |
| **OQ-14** | Must the app work offline (no signal while taking attendance)? | (a) no — online required; (b) read-only offline cache; (c) offline-first with a local queue | **(a)** — online required, with clear error states and retry. | (c) is a large architectural commitment (conflict resolution, sync semantics) and would change the M1 data layer. If beta teachers in poor-signal areas demand it, it becomes a M2 requirement with an explicit conflict-resolution design, not a silent addition. | Before M1 scope freeze |
| **OQ-10** | What happens to a student's history when the teacher deletes the student? | (a) soft-delete, records retained; (b) hard-delete cascade; (c) soft-delete with anonymisation after N years | **(a)** — soft-delete with full retention; the teacher can reactivate. | (b) risks destroying attendance history a teacher may need for a dispute. (c) requires a background anonymisation job. | Before M0 data-model freeze |
| **OQ-06** | Are teacher notes about a student visible to that student's parents? | (a) no — private; (b) yes; (c) teacher chooses per note | **(a)** — notes are private to the workspace staff. | (b) risks a parent seeing an unflattering observation with no teacher intent; (c) adds a per-note visibility control and a portal filter. | Before M2 portal build |
| **OQ-11** | Where do online-exam questions come from? | (a) teacher-authored only; (b) a platform question bank; (c) import from a source | **(a)** — teacher-authored only, in M3a. | (b)/(c) require a curriculum model, content moderation, licensing, and Arabic-content review — a separate programme, not a feature. | Before M3a scope freeze |
| **OQ-04** | What is the commercial model? | (a) flat monthly per teacher; (b) per student; (c) freemium with a student cap; (d) not yet decided | **Undecided — no billing code until M3b.** During beta, access is granted manually. | Determines plan limits, entitlement checks, upgrade UX, and the admin console's billing views. Building billing before the model is decided is wasted work and a source of customer-hostile behaviour. | Before M3b starts |

### 4.2 Multi-user, portals, and access

| ID | Question | Options | Default until answered | Impact of a different answer | Decide by |
|---|---|---|---|---|---|
| **OQ-02** | How does a parent prove they are the parent of a student? | (a) teacher issues a one-time code; (b) parent requests, teacher approves; (c) parent phone + student data self-declared; (d) national ID verification | **(a)** — the teacher issues a short-lived code/link to the parent's phone. It requires no government identity check, no ID collection, and no third-party data source, and it keeps the trust boundary with the teacher who actually knows the family. | (b) adds a request queue and a verification workload for the teacher. (c) risks a stranger claiming a child. (d) requires collecting national IDs — contradicted by `A-11`. | Before M2 scope freeze |
| **OQ-03** | How do students authenticate to the student portal, given many are minors? | (a) per-student code issued by the teacher; (b) parent-mediated login; (c) student email/OTP; (d) device pairing with the parent account | **(a)** — a per-student code, consistent with the "teacher knows their students" model. | (c) requires collecting student email addresses, which many will not have, and creates an account for every minor. (d) adds a device-trust model. | Before M2 scope freeze |
| **OQ-09** | Which channel carries the portal authentication code? | (a) SMS OTP via a local provider; (b) WhatsApp message via a Business API; (c) email link only; (d) teacher hands the code over in person | **(c) + (d)** — an email link as the default, with the code also readable inside the teacher's app. | (a) needs an SMS provider contract with Egyptian short codes — a 2–6 week external dependency. (b) needs a WhatsApp Business API integration, which would also require re-opening the "no delivery claim" rule in `NF-2` — deliberately not pursued. | Before M2 scope freeze |
| **OQ-16** | Can a teacher belong to more than one workspace? | (a) yes, with switching; (b) no, one workspace per account, forever | **(a)** for P2+ (`F-P2-08`); in P1 a teacher owns exactly one workspace. | (a) requires every query to be workspace-scoped under an explicit active workspace, plus workspace-scoped sessions and notification routing. | Before M2 scope freeze |
| **OQ-21** | Should the bulk student import provision a portal credential per imported row? | (a) no — never; credentials are provisioned per student, explicitly, by a teacher; (b) yes, opt-in per import job; (c) yes, always, with a printable reveal sheet | **(a)** — the import never creates auth accounts. The one-time reveal cannot be shown once per row safely at import time, and an import-time account per row would flood the phone-keyed sign-in path with name guesses. Provision is a separate, deliberate action. | (b)/(c) requires a batch provisioning design (bulk one-time reveal, print/PDF output, per-row opt-out) and its own permission split; not part of `F-P2-11` today. | Before bulk import re-enters active development (`F-P2-11`) |
| **OQ-17** | Should an assistant be able to see money? | (a) no; (b) yes, view-only; (c) yes, full | **(a)** — payment visibility is granted explicitly per assistant, defaulting to **off**, because money is the most sensitive category in the product. | (c) would make the permission matrix near-useless in practice. | Before M2 scope freeze |

### 4.3 Features and integrations

| ID | Question | Options | Default until answered | Impact of a different answer | Decide by |
|---|---|---|---|---|---|
| **OQ-05** | How does QR attendance actually work in the classroom? | (a) teacher shows a rotating code, students scan with their own phones; (b) teacher scans students' codes; (c) teacher taps students from a list with a scanner for attendance only | **(a)** — the teacher displays a short-lived rotating code on their device; enrolled students scan it. The teacher sees live arrival counts. | (a) requires students to have a phone and an installed parent/student account — a real adoption barrier, so QR is P2 and manual attendance remains the primary path. (b) inverts the device load onto the teacher. (c) is closest to today's manual flow and is the natural fallback. | Before M2 scope freeze |
| **OQ-08** | Which external provider delivers recorded video? | (a) a managed video platform (e.g. a hosted player with a signed URL); (b) object storage plus a player component; (c) YouTube/Vimeo unlisted embeds | **No video hosting or protected playback is enabled or claimed until a provider is selected, configured, and tested.** | Provider selection, playback authorization, storage, and egress limits must be validated before the feature is enabled. | Before M3b starts |
| **OQ-12** | Should files be shareable outside Kashkol (a public link)? | (a) no — internal only; (b) yes, expiring public link; (c) yes, per-file password | **(a)** — internal only, scoped to teacher-only / selected groups / selected students. | (b)/(c) create a public surface for children's material; each needs expiry, revocation, watermarking, and an abuse process. | Before M2 scope freeze |
| **OQ-13** | Does the teacher need to record attendance from a shared device or a teacher's own tablet? | (a) teacher's own device only; (b) any device via sign-in; (c) shared classroom device with a PIN | **(a)**, with sign-in supported on any personal device. | (c) raises the authentication bar for a shared classroom tablet; a short-lived session PIN is a possible later addition. | Before M1 scope freeze |
| **OQ-20** | When a student has a **direct student-level fee rule** effective in a month *and* is simultaneously enrolled in a group that has a group-level fee rule for that same month, should the group-level monthly fee still accrue on top of the direct fee, or does the direct fee fully replace it? | (a) direct fee fully replaces the group monthly fee for that month; (b) direct fee and group monthly fee both accrue; (c) per-student choice at the fee-rule level | **Superseded by `ADR-0028`** (2026-11-13). Direct student-level fee rules are removed: fee rules are group-scoped only, and money is session-scoped, so the interaction can no longer arise. | The question and its default are moot. Existing direct-fee rows, if any, remain readable but are never applied (ADR-0028). | Moot (`ADR-0028`) |
| **OQ-22** | Should the attendance QR support scanning with the student's own phone? | (a) teacher-only scans; (b) assistant scans too, under role permission; (c) student scans own code under an active session check | **(b)** — the attendance permission resource (`attendance:write`) covers teacher and assistant scanning alike; a student scanning their own code is not yet a requirement and is not implemented. | (c) would require a student-facing attendance self-mark flow with device/context checks, a different consent model, and an explicit `F-P2-05` amendment; not built or claimed today. | Before M2 scope freeze |

### 4.4 Platform and legal

| ID | Question | Options | Default until answered | Impact of a different answer | Decide by |
|---|---|---|---|---|---|
| **OQ-18** | Who sees the workspace Activity Log, and what does it retain? | (a) owner only; (b) owner plus assistants; (c) owner plus assistants for their own actions | **(a) — owner only** in P1/P2, with an assistant-visible subset added in M2 (assistants see their own actions and the actions of others on the entities they can access). Entries are retained for **24 months**, then aggregated. | (c) is simpler but less useful; (a) is the strictest. Audit retention interacts with `A-14` and with the delete request path. | Before M0 data-model freeze |
| **OQ-15** | Are student names stored in Arabic only? | (a) as entered, single field; (b) separate Arabic/Latin fields; (c) transliteration generated | **(a)** — stored and displayed as entered, with the UI never translating teacher-authored content. | (b)/(c) add a second field, a matching problem, and a merge workflow. | Before M0 data-model freeze |
| **OQ-19** | Where must tenant data be hosted? | (a) any region; (b) Egypt/EU; (c) in-country (Egypt) | **(a)** for build and beta, subject to the legal review. | (b)/(c) constrains provider choice and can materially affect cost and latency. | Before M2 (privacy review) |

---

## 5. Deliberately not asked

These are questions that look open but are already settled by the brief or by `PRODUCT_REQUIREMENTS.md`.
They are recorded here so they are not re-opened in review.

| Topic | Position | Source |
|---|---|---|
| Should live video meetings be built? | **No. Never.** The prototype's meeting room is a UI exploration. | `PRODUCT_REQUIREMENTS.md` §1.2, `D-17` |
| Should Kashkol process payments? | **No.** Money is recorded manually; Kashkol moves no money. | `D-14`, `NF-5` |
| Should the portal show mock data as a demo? | **No.** Portals require real authentication; a teacher-side preview must be labelled a preview. | `NF-3` |
| Should attendance percentages be estimated or shown as "approximate"? | **No.** Every rate is computed from records. | `NF-1`, `D-08` |
| Should the teacher see a "message sent" state? | **No.** Only "opened in WhatsApp" / "prepared". | `NF-2`, `F-P1-10` |
| Should English be dropped to save effort? | **No.** Arabic is the default; English is fully supported. | `D-01` |
| Should dark mode be dropped? | **No.** Light and dark both ship with a `system` option. | `D-02`, `A-13` |
| Should the 23 prototype defects be fixed in place? | **No.** They are re-implemented correctly in the real codebase, not patched in the prototype. | `PRODUCT_REQUIREMENTS.md` §14 |
| Should a second role ship in P1? | **No.** P1 is a single-teacher product. | `PRODUCT_REQUIREMENTS.md` §4 scope discipline |
| Should the online exam feature move earlier because it is impressive? | **No.** It is P3 and it is not faked if it slips. | `D-18`, `RELEASE_PLAN.md` §5.2 |

---

## 6. How a question gets resolved

1. **Raise** — add the question to §4 with options and a recommended default. No change to the
   specification yet.
2. **Default applies** — the specification continues to assume the listed default. The build is not
   blocked.
3. **Decide** — record the decision, the date, the owner, and the rationale in §4, changing the
   default row to a decided row.
4. **Sweep** — update the affected requirements in `PRODUCT_REQUIREMENTS.md`, the affected flows in
   `USER_FLOWS.md`, the milestone scope in `RELEASE_PLAN.md` §12, and any assumption invalidated by
   the answer.
5. **Verify** — re-run the release gates in `RELEASE_PLAN.md` §7 for the affected scope.

**Escalation:** an open question past its deadline is raised to the milestone owner. The default still
applies, but the milestone entry criteria are re-checked against it, and the risk register in
`RELEASE_PLAN.md` §10 is updated if the default is now known to be wrong.

---

## 7. External dependencies that produce open questions

These are not product questions but external facts we do not control. They are tracked here because
they gate milestones.

| Dependency | Produces | Needed by | Consequence of delay | Owner |
|---|---|---|---|---|
| Legal review of minors'-data handling | The validity of `A-11`, `A-14`, `OQ-02`, `OQ-03` | M2 | The parent and student portals cannot ship; M2 splits into wave A and wave B (`RELEASE_PLAN.md` §4.2). | Product + legal |
| SMS/OTP provider contract | `OQ-09` | M2 wave B | Portals fall back to emailed links only — a viable scope reduction. | Engineering |
| Video provider decision and contract | `OQ-08` | M3b | `F-P3-02` is deferred; no placeholder is released. | Engineering |
| Billing provider contract | `OQ-04` | M3b | `F-P3-04` is deferred; the pilot stays manually provisioned. | Product |
| Beta teacher recruitment | The truth of `A-05`, `OQ-07`, `OQ-14` | M1 private beta | The M1 gate cannot be evaluated with real usage; engineering continues. | Product |
| Arabic native-speaker reviewer | The quality of every Arabic string | Every release | The Arabic QA release gate cannot pass. | Product |

---

## 8. Traceability

| ID | Referenced from | Class |
|---|---|---|
| `A-01` | `RELEASE_PLAN.md` §2.2 | Assumption |
| `A-02` | `PRODUCT_REQUIREMENTS.md` §2, `F-P1-05` | Assumption |
| `A-03` | `F-P1-05`, `F-P1-07` | Assumption |
| `A-04` | `F-P2-04` | Assumption |
| `A-05` | `D-05`, `D-06`, `D-08`, `F-P1-06`, `F-P1-12`, `F-P2-06` | Assumption |
| `A-06` | `D-11`, `F-P1-09`, `F-P3-01` | Assumption |
| `A-07` | `F-P1-09`, `F-P1-12`, `F-P2-06` | Assumption |
| `A-08` | `F-P1-05`, `F-P2-12` | Assumption |
| `A-09` | `F-P1-11`, `F-P2-11` | Assumption |
| `A-10` | `F-P3-04` | Assumption |
| `A-11` | `PRODUCT_REQUIREMENTS.md` §1.2, `F-P0-08`, §9 | Assumption |
| `A-12` | `F-P3-03`, `D-13`, `F26` | Assumption |
| `A-13` | `D-02`, `F-P0-04` | Assumption |
| `A-14` | `F-P0-08`, `F-P2-11` | Assumption |
| `A-15` | `F-P1-09`, `F-P2-06` | Assumption |
| `A-16` | `F-P1-09` | Assumption |
| `A-17` | `F-P2-06` | Assumption |
| `A-18` | `F-P2-03`, `F18`, `ADR-0026` | Assumption |
| `A-19` | `F-P2-03`, `F18`, `ADR-0026` | Assumption |
| `A-20` | `F-P2-03`, `F18`, `ADR-0026`, `ADR-0027` | Assumption |
| `A-21` | `F-P2-03`, `F18`, `ADR-0027` | Assumption |
| `A-22` | `F-P1-05`, `F-P1-06`, `F8`, `ADR-0029` | Assumption |
| `OQ-01` | `RELEASE_PLAN.md` §2 | Open question |
| `OQ-02` | `F-P2-02`, `F17` | Open question |
| `OQ-03` | `F-P2-03`, `F18` | Open question |
| `OQ-04` | `F-P3-04` | Open question |
| `OQ-05` | `F-P2-05`, `F20` | Open question |
| `OQ-06` | `F-P2-02`, `F17` | Open question |
| `OQ-07` | `F-P1-13` | Open question |
| `OQ-08` | `F-P3-02`, `F25` | Open question |
| `OQ-09` | `F-P2-02`, `F-P2-03` | Open question |
| `OQ-10` | `F-P1-02` | Open question |
| `OQ-11` | `F-P3-01`, `F23`, `F24` | Open question |
| `OQ-12` | `F-P1-11`, `F-P2-10` | Open question |
| `OQ-13` | `F-P1-06` | Open question |
| `OQ-14` | `F-P1-06` | Open question |
| `OQ-15` | `F-P1-02` | Open question |
| `OQ-16` | `F-P2-08` | Open question |
| `OQ-17` | `F-P2-01`, `F-P2-04` | Open question |
| `OQ-18` | `F-P0-07`, `F-P3-03` | Open question |
| `OQ-19` | `F-P0-08` | Open question |
| `OQ-20` | `F-P2-04`, `ADR-0025` | Superseded by `ADR-0028` |
| `OQ-21` | `F-P2-11`, `ADR-0026` | Open question |
| `OQ-22` | `F-P2-05`, `F20`, `ADR-0027` | Open question |
