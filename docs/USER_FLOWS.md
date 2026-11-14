# Kashkol — User Flows

**Status:** Draft v0.1 · **Date:** 2026-10-21 · **Companion to:** `PRODUCT_REQUIREMENTS.md`

Flow IDs map to the feature IDs in `PRODUCT_REQUIREMENTS.md`. Every flow states its **tier** (P0–P3),
its **actor**, its **preconditions**, the numbered **steps**, the **system behaviour** at each step, the
**data written**, and the **error / edge cases**. Flows are written to be implementable as-is; they are
not navigation sketches.

**Conventions used throughout**

- **Screens** are named as they will appear in the product, in Arabic and English.
- "Server" means an authoritative server-side action with a transaction; "client" means the browser.
- Any step that writes data is marked **[WRITE]** and names the audit event it produces.
- Steps that cross a trust boundary (auth, tenant scoping, role checks) are marked **[BOUNDARY]**.
- Every flow lists the **AC references** it satisfies.

---

## Index

| ID | Flow | Actor | Tier |
|---|---|---|---|
| F1 | Create an account and a workspace | Teacher | P0 |
| F2 | Sign in | Any user | P0 |
| F3 | Choose language and theme | Any user | P0 |
| F4 | Create a group and its weekly slots | Teacher | P1 |
| F5 | Add a student | Teacher | P1 |
| F6 | Import students from a spreadsheet | Teacher | P1 |
| F7 | Review the dashboard | Teacher | P1 |
| F8 | Take attendance for a session | Teacher | P1 |
| F9 | Correct an attendance record | Teacher | P1 |
| F10 | Move or cancel a session | Teacher | P1 |
| F11 | Assign homework and record submissions | Teacher | P1 |
| F12 | Enter paper-exam grades | Teacher | P1 |
| F13 | Prepare a parent update | Teacher | P1 |
| F14 | Share a PDF | Teacher | P1 |
| F15 | Read reports | Teacher | P1 |
| F16 | Invite an assistant and set permissions | Owner | P2 |
| F17 | Parent links to a child and uses the portal | Parent | P2 |
| F18 | Student links to their record and uses the portal | Student | P2 |
| F19 | Record a manual payment | Teacher | P2 |
| F20 | Take attendance by QR | Teacher | P2 |
| F21 | Review a student's progress and follow up | Teacher | P2 |
| F22 | Export data | Teacher / Owner | P2 |
| F23 | Build and publish an online exam | Teacher | P3 |
| F24 | Take an online exam | Student | P3 |
| F25 | Attach a recorded lesson (external provider) | Teacher | P3 |
| F26 | Platform support access (break-glass) | Platform admin | P3 |

---

## F1 — Create an account and a workspace

**Actor:** New teacher · **Tier:** P0 · **Preconditions:** none

1. Teacher opens the app. The **sign-in** screen is shown with the Arabic/English switch in the corner
   (top-right in LTR, top-left in RTL — matching the prototype's `inset-inline-end` placement).
2. Teacher selects **"Create an account"**.
3. **[BOUNDARY]** Teacher submits: teaching display name, personal name, main subject, email, password.
   - Client-side validation runs first; server-side validation is authoritative.
   - Password rules: ≥ 10 characters, not in the breached-password list.
   - Email must be a valid address and must not already be registered.
4. **[WRITE]** The server creates the user record in a `pending_verification` state and sends a
   verification email containing a single-use link (24 h validity).
   - Audit: `user.created`.
   - **No workspace is created yet** — this avoids orphaned workspaces (F-P0-06 AC-2).
5. Teacher opens the verification link. **[WRITE]** `user.email_verified`. Audit: `user.email_verified`.
6. **[BOUNDARY]** Teacher is signed in. The server creates the **workspace** and its `owner` membership
   in one transaction, and materialises the workspace settings with defaults:
   `at_risk_after = 2`, `inactive_after = 4`, locale `ar`, theme `system`, timezone `Africa/Cairo`,
   currency `EGP`.
   - Audit: `workspace.created`.
7. **[BOUNDARY]** Teacher lands on an onboarding checklist: set teaching name → set grades taught →
   create first group → add students. Each step is skippable; the checklist persists server-side and
   shows progress.
8. Teacher completes onboarding and lands on the **dashboard**.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Email already registered | Generic "an account with this email already exists" message. Do **not** reveal which accounts exist. |
| Verification link expired | Show "link expired" + a resend button with a 60-second cooldown. |
| Email provider down | Show a retryable banner "we could not send the email"; the account exists and can be verified later. Do not delete the account. |
| Workspace creation fails after user creation | Transaction rolls back; the user lands on a retry screen. The user must never end up with an account and no workspace, or vice versa. |
| Teacher abandons onboarding | Account and workspace remain; the dashboard shows the checklist. |
| Workspace name collision | Allowed — workspaces are not globally named. |

**AC:** F-P0-01, F-P0-02, F-P0-06

---

## F2 — Sign in

**Actor:** Any user · **Tier:** P0 · **Preconditions:** user exists and email is verified

1. Teacher enters email and password on the **sign-in** screen.
2. **[BOUNDARY]** The server verifies the password hash, checks the lockout counter, and issues a
   server-side session.
   - Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefixed.
   - The `workspace_id` and `role` are bound into the session record, not trusted from the client.
   - Audit: `auth.signed_in` (with IP and user agent).
3. Teacher lands on the dashboard for the session's active workspace.
4. If the account is not verified, the flow diverts to a "verify your email" screen before the
   dashboard, with a resend option.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Wrong password | Identical message to "email not found" — no account enumeration. |
| 5 failures / 15 min | Temporary lockout with a countdown; a generic message. Audit: `auth.lockout`. |
| Email unverified | Divert to verification. |
| Session expired mid-task | On the next request, the app shows "your session expired, sign in again" and returns the user to their last screen after signing in. In-progress form content is preserved in memory (not persisted across the redirect). |
| Signed in on two devices | Both sessions are valid; both are listed under "active sessions" (P2) and can be revoked. |

**AC:** F-P0-02, F-P0-07, F-P0-09

---

## F3 — Choose language and theme

**Actor:** Any user · **Tier:** P0 · **Preconditions:** signed in

1. Teacher taps the **language** control in the top bar (globe icon + the *other* language's name, so
   the control always shows what you will switch **to**).
2. **[WRITE]** The server persists the locale for the user and returns the workspace's UI strings for
   the new locale. Audit: `settings.locale_changed`.
3. The client applies `lang` and `dir` on the document root. Layout mirrors instantly: sidebar moves
   to the right in RTL, the drawer opens from the right, directional chevrons flip, the table aligns
   to the start edge.
4. Teacher opens **Settings → General → Theme** and chooses `light`, `dark`, or `system`.
5. **[WRITE]** The server persists the theme. Audit: `settings.theme_changed`.
6. The client sets `data-theme` on `<html>` **before first paint** on subsequent loads, so there is no
   light flash.

**Error / edge cases**

- Missing catalogue key → falls back to English; never renders a raw key.
- Switching language while a modal with unsaved input is open → the modal stays open, its form state
  is preserved, and its strings re-render.
- `system` theme with OS set to dark → dark tokens apply and the `color-scheme` property is updated so
  native controls (scrollbars, date pickers) match.

**AC:** F-P0-03, F-P0-04

---

## F4 — Create a group and its weekly slots

**Actor:** Teacher · **Tier:** P1 · **Preconditions:** signed in; workspace exists

1. Teacher opens **Groups** and taps **"Create group"**.
2. Teacher fills: name (pre-filled from subject + slot as a suggestion, fully editable), subject, grade,
   colour, and **one or more weekly slots**. Each slot has a weekday, a start time, an optional end
   time, an optional room, and an optional capacity (`ADR-0029`).
3. The form validates: name required; at least one slot; times parse; end time (if present) is after
   start time; capacity is between 1 and 500 when present.
4. The form checks each slot for an **overlap** against the teacher's other groups and shows a warning
   banner: "This overlaps <Group X> on Saturdays at 4:00 PM." The teacher may continue anyway.
5. **[WRITE]** The group and its slots are created, with a generated set of sessions for **each slot**
   over the next 4 weeks. Audit: `group.created`.
6. Teacher lands on the group detail page: roster (empty), upcoming sessions, and actions to enrol
   students and add a one-off session.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Duplicate group name | Allowed (names are not unique), but the list shows a "same name" hint. |
| Slot overlap | Warning, not a block. |
| Two slots on the same weekday and time | Refused by validation; one meeting cannot be listed twice. |
| Room or capacity omitted on a slot | Allowed; the slot inherits no room and no roster cap. |
| Group with 0 students | Allowed. The group appears in pickers; sessions show "0 students expected". |
| Group archived | Archived groups disappear from pickers but keep their history. |

**AC:** F-P1-04, F-P1-05, F-P0-07, `ADR-0029`

---

## F5 — Add a student

**Actor:** Teacher · **Tier:** P1 · **Preconditions:** signed in; at least one group (or the teacher is
adding to no group yet)

1. Teacher taps **"Add student"** (from the Students screen, the dashboard quick actions, or the group
   roster).
2. Teacher enters: first name (required), last name (required), grade, phone, parent name, parent
   phone, and group enrolment (optional at creation — a student can be added before a group exists).
3. Client-side validation runs; the server validates authoritatively.
   - Phone: Egyptian mobile `01[0125]\d{8}` or an international `+…` form. Normalised to E.164 on
     save (`20…`).
   - Parent phone: optional, same rules if present.
4. **[WRITE]** The student is created with `status = active`, `consecutive_absences = 0`, and derived
   metrics empty (not zero-filled). Audit: `student.created`.
5. The toast confirms: **"Saved"**. The student appears in the list and in the group roster.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Missing required name | Inline error under the field; form does not submit. |
| Duplicate phone in the workspace | Warning (not a block): "A student with this phone already exists — Add anyway / Cancel". |
| No parent phone | Allowed; the parent link is unavailable until a phone is added. |
| Student added before a group exists | Allowed; `status = active`, no attendance yet. |
| Arabic names with diacritics | Stored and displayed exactly as typed. |

**AC:** F-P1-02, F-P0-07

---

## F6 — Import students from a spreadsheet

**Actor:** Teacher · **Tier:** P1 · **Preconditions:** signed in; at least one group exists (or the
teacher is willing to let groups be created)

1. Teacher opens **Settings → Data → Import students** (also reachable from the Students empty state).
2. Teacher selects a `.csv` or `.xlsx` file.
3. The client parses the file **only to preview**; the server re-parses and re-validates on commit.
4. The server returns a **preview**: matched columns (with the detected header names), the mapping it
   inferred, and a per-row table — `Create` / `Update` / `Skip` — with the reason for each skip.
5. Teacher reviews **group mapping**: unmatched group names are offered as "create this group" or
   "map to an existing group". The teacher chooses per mapping. Nothing is discarded silently.
6. Teacher chooses an import mode:
   - **All or nothing** (default) — if any row fails, nothing is written and the error report is
     offered.
   - **Valid rows only** — failing rows are skipped and listed in a downloadable CSV error report.
7. **[WRITE]** Students are created/updated in a single transaction (or in one batch per the chosen
   mode). Audit: `student.imported` (batch) plus per-row `student.created` / `student.updated` events.
8. The toast reports the outcome: **"Students imported (118)"** or **"Students imported (115) — 3
   skipped"** with a link to the error report.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Unreadable file | "Could not read the file. Check the columns." (prototype copy, kept) + the expected column list. |
| Wrong encoding | Detect UTF-8/UTF-8-BOM; if the file is Windows-1256 (common for Arabic Excel), detect and convert with a note shown to the teacher. |
| More than 5,000 rows | Rejected with a clear message and a split-file suggestion. |
| Duplicate rows inside the file | Detected and flagged in the preview as `Skip — duplicate in file`. |
| Match on "name + phone" | Only that rule; a name-only match is `Update` **with an explicit warning row** the teacher must acknowledge. |
| Arabic content | Preserved byte-exact; verified by a round-trip assertion in the import test suite. |
| Import interrupted | Transaction rolls back; the teacher sees a failure, never a half-imported roster. |

**AC:** F-P1-03, F-P0-07, F-P0-08

---

## F7 — Review the dashboard

**Actor:** Teacher · **Tier:** P1 · **Preconditions:** signed in

1. Teacher opens the app. The **dashboard** loads in three independent groups so a slow query in one
   does not block the rest:
   - **A.** Stat tiles (expected students today, attendance recorded today, homework completion,
     average assessment score).
   - **B.** Today's sessions + "Needs your attention" + weekly attendance chart.
   - **C.** Upcoming sessions + upcoming deadlines.
2. Greeting: time-of-day phrase + the teacher's workspace display name.
3. Each tile is computed from records at request time. Where no data exists, the tile shows `—` or an
   explicit empty state — never a fabricated number.
4. Teacher taps a session row → jumps to that session's attendance screen (F8).
5. Teacher taps an at-risk student → opens the student profile (F7 sub-view below).
6. Teacher taps a quick action → the corresponding modal or screen opens with the current context
   preserved.

**Student profile sub-view** (reached from the dashboard, Students, Group roster, or Attention):

1. Profile header: avatar, name, group(s), grade, status badge, and actions **Edit student** and
   **Message parent**.
2. Tabs: **Overview** (grade, group, joined date, consecutive absences, trend, parent contact, big
   attendance and quiz-average metrics) · **Attendance** (per-session history with badges and a
   "corrected" marker) · **Homework** (per-assignment submission status) · **Assessments** (per-assessment
   score) · **Notes** (composer + list).
3. Notes are teacher-only and are **never** shown to parents or students. **[WRITE]** Audit:
   `note.created` (note body is redacted from the diff).
4. Editing the student opens the modal; saving updates the record and shows **"Saved"**. **[WRITE]**
   Audit: `student.updated` with a field-level diff.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| No sessions today | Explicit "No sessions scheduled today." empty state in the sessions card. |
| Attendance not yet taken today | The tile shows `—` with a hint "not recorded yet" — never 0 %. |
| A past session with no attendance | Shown in the teacher's to-do list and as a notification (P2), and in the sessions view marked **unrecorded**. |
| Student with no assessments | Quiz average shows `—`, not 0. |
| Notifications list empty | The bell shows no badge; the panel shows an empty state. |
| Greeting at 12:00 and 18:00 | Distinct afternoon and evening phrases (prototype copy defect DEF-16 fixed). |

**AC:** F-P1-01, F-P1-02, F-P0-10

---

## F8 — Take attendance for a session

**Actor:** Teacher · **Tier:** P1 · **Preconditions:** a session exists and is not cancelled

**Layout**
- Tablet/desktop: two panes — session picker (left, 320 px) and roster (right).
- Mobile: stacked — pick a session, then mark the roster. The picker and roster are separate routes
  with a back link.

1. Teacher opens **Attendance**. The session picker lists sessions from 3 days ago forward (max 24
   items), sorted by date then time, each showing: group colour dot, group name (or grade label, or
   "Independent session"), date, time, and a status indicator — a green check for **recorded**, a
   **Today** badge for today's, nothing otherwise.
2. Today's session is auto-selected on first load if one exists.
3. The roster pane loads the session's **attendance set** (`ADR-0029`):
   - **Group session:** the group's enrolled students, in enrolment order.
   - **Grade-level session:** the snapshot materialised at creation, plus anyone the teacher added.
   - **Independent session:** only the students the teacher has added; the screen offers a workspace
     student search and a per-row add control. It never fills itself from the workspace.
   - **A student with no mark yet shows as "not recorded"** — visually distinct from "absent".
4. Teacher marks each student with one of four buttons: **Present** / **Absent** / **Late** /
   **Excused**. The selected button takes the status colour. Only one mark per student is active at a
   time (radio semantics).
5. On a group-less session the teacher can add or remove a student at any time while the session is
   not cancelled. Removing a student who already has a mark is refused.
6. The header shows a live summary: `12 marked · 3 not recorded` and the running attendance rate for
   the session.
7. Teacher taps **"Mark all present"** → all unmarked rows become Present. The action is undoable
   (a single "Undo" toast action).
8. Teacher taps **"Save attendance"**.
9. **[WRITE]** All marks for the session are written in **one atomic server-side transaction**:
   - Each mark creates or updates the attendance record and appends an **attendance revision**
     (F-P1-07) if the value changed.
   - The session status becomes `completed`. This is a **status marker, not a lock**: the roster and
     its marks stay editable afterwards (`ADR-0029`).
   - Each affected student's `consecutive_absences` and derived `status` are recomputed from the
     **full attendance history**, not incrementally.
   - Audit: `attendance.saved` (session-level) + `attendance.marked` (per student).
10. The toast confirms **"Attendance saved"**. The picker now shows a green check for that session.
11. The dashboard, student profiles, and reports reflect the new values immediately.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Student added to the group after the session date | The student is **excluded** from that session's roster; they appear in later sessions. |
| Student archived before the session date | Excluded from that session's roster. |
| Grade-level session, student enrolled after creation | Not added automatically; the teacher adds them by hand. A roster edit is a visible act, never a silent follow of enrollment. |
| Independent session with no students | Renders an empty-state prompt with the student search; saving with 0 marks is allowed. |
| Add a student already on the roster | Refused with "already on this session's roster"; no duplicate row. |
| Remove a student who already has a mark | Refused with "this student already has attendance recorded"; corrections remain the only way to change a mark. |
| Mark or roster edit on a cancelled session | Refused; cancelled sessions stay excluded from attendance and reports. |
| Save with 0 marks | Allowed; the session is recorded as "recorded, no marks", and the rate shows `—`. |
| Network failure mid-save | The transaction either fully applied or did not. The client shows "could not save — retry"; the retry is idempotent by (session, student, mark) and does not create duplicate revisions. |
| Two devices saving the same session | Last write wins per student, and the losing write produces a revision showing the previous value — never a silent overwrite. |
| Student marked Absent then changed to Present before saving | Only the final value is written; no intermediate revision is created for unsaved edits. |
| `Excused` | Excluded from the absence streak and from the rate denominator; shown as a neutral badge. |
| Very long roster (200 students) | Virtualised list; save is a single transaction completing in < 2 s (F-P3-05). |

**AC:** F-P1-06, F-P1-07, F-P1-05, `ADR-0029`

---

## F9 — Correct an attendance record

**Actor:** Teacher · **Tier:** P1 · **Preconditions:** a session already has attendance recorded and is
not cancelled

Correction is a first-class action, not a reopening: a non-cancelled session can be corrected at any
time, whether it is `scheduled`, `started`, or `completed` (`ADR-0029`). "Close session" records that
the lesson ended; it never freezes the record.

1. Teacher opens **Attendance** and selects a recorded session (it shows a green check).
2. The current marks load. Each student row that has been corrected before shows a small **"corrected"**
   marker with a history affordance.
3. Teacher changes one or more marks.
4. Teacher optionally types a reason (e.g. "student arrived late due to hospital").
5. Teacher taps **"Save attendance"**.
6. **[WRITE]** For each changed mark:
   - The **current** value is updated.
   - An **immutable revision** is appended: student, session, old value, new value, actor, timestamp,
     reason.
   - The student's derived streak and status are recomputed from the **full history including the
     revision**.
   - Audit: `attendance.corrected` with old → new diff.
7. The toast confirms **"Attendance saved"**; the corrected student shows the **"corrected"** badge.
8. Tapping the history affordance shows the dated list of corrections for that student, newest first,
   with the actor's name and the reason.

**Bulk correction**

9. Teacher taps **"Select"** on the roster, selects multiple students, applies one mark, and saves.
   Each change produces its own revision attributed to the same actor and the same save action.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Correcting a session from last month | Allowed. The rate for that session and all subsequent recomputed values update. |
| Correcting a `completed` session | Allowed. `completed` is a status marker, not a write lock. |
| Correcting a cancelled session | Refused; the record is immutable for attendance purposes and remains excluded from reports. |
| Correcting back to the original value | Allowed; it still creates a revision, so the audit trail shows the teacher considered and changed it. |
| Missing reason | Allowed; the revision records `reason = null` and the UI shows "no reason given". |
| An assistant without `attendance` permission | Cannot reach this screen, and the API returns `403` (F-P2-01). |
| Deleting a session | Not possible; sessions are cancelled, never deleted, so corrections always have a referent. |

**AC:** F-P1-07, F-P0-07, `ADR-0029`

---

## F10 — Move or cancel a session

**Actor:** Teacher · **Tier:** P1 / P2 (correction variant in P2) · **Preconditions:** a session exists

**Move**
1. Teacher opens **Sessions** and taps a session.
2. Teacher changes the date or time. If the session already has recorded attendance, a confirmation
   appears: **"This session already has attendance recorded. Moving it will keep the attendance
   attached and record the change."** A reason is required (P2).
3. **[WRITE]** The session's date/time is updated; a **session revision** is created with the old and
   new values, the actor, and the reason. Attendance stays attached to the same session id.
   Audit: `session.rescheduled`.

**Cancel**
1. Teacher taps **Cancel session** on a session row.
2. If attendance was already recorded, the confirmation states: **"Attendance is recorded for this
   session. Cancelling keeps the attendance in the history but excludes the session from attendance
   rates."**
3. **[WRITE]** The session is marked `cancelled` (never deleted), with `cancelled_at` and `cancelled_by`.
   Audit: `session.cancelled`.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Moving a session onto a conflicting slot | Warning, not a block. |
| Moving a session into the past | Allowed, with a warning — teachers do sometimes log a session late. |
| Cancelling a session with attendance | Allowed, with the explicit warning above. |
| Cancelling a session in the past | Allowed; it disappears from the day's agenda and is marked cancelled in the week view. |
| Cancelled session and the attendance rate | The session is excluded from the denominator. |

**AC:** F-P1-05, F-P2-12

---

## F11 — Assign homework and record submissions

**Actor:** Teacher · **Tier:** P1 · **Preconditions:** a group exists

1. Teacher opens **Homework** and taps **"Add homework"** (or the dashboard quick action).
2. Teacher chooses a group or selected students, then enters title (required), due date, optional
   instructions, and optional permitted resources. A resource must be a clean file already shared
   with all recipients.
3. **[WRITE]** The homework is created, and a **submission record** is created for each assigned
   student with status `not_submitted`. Audit: `homework.created`.
4. The homework card shows: group, title, due date, and a completion bar `submitted / assigned` with a
   percentage computed from the submission records.
5. Teacher taps a homework card → a roster view with a submission control per student.
6. Teacher records a student's status (`Submitted`, `Late`, or `Excused`), optionally adding
   feedback and a grade when the assignment has a maximum score.
7. **[WRITE]** The submission record is updated with status and timestamp. Audit:
   `homework.submission_updated`.
8. The completion bar and the dashboard's homework completion rate update immediately.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Student enrolled after a group assignment was created | The new student gets a `not_submitted` record so the denominator is correct. |
| Duplicate submission marking | Idempotent — no new audit event if the status did not change. |
| Homework with no resource attached | Allowed. |
| Homework archived | Hidden from the default list; the completion history is retained. |
| Online file submission | Not available; the teacher records status manually. Student upload is a separate portal capability and is not claimed here. |

**AC:** F-P1-08

---

## F12 — Enter paper-exam grades

**Actor:** Teacher · **Tier:** P1 · **Preconditions:** a group exists

1. Teacher opens **Assessments** (labelled "paper assessments" in Arabic) and taps **"Create
   assessment"**.
2. Teacher enters: title (required), group, date, assessment type, maximum score (default 100), and
   optional note. An optional extra-credit allowance adds points above the maximum; it is disabled
   unless explicitly configured for that assessment.
3. **[WRITE]** The assessment is created with an empty score set. Audit: `assessment.created`.
4. Teacher taps **"Enter scores"** on the assessment row → the roster with result status and score
   per student.
5. Teacher records `graded`, `missing`, `excused`, or `not_taken`. A graded score saves per student
   and is idempotent.
   - The score validates `0 ≤ score ≤ max_score + extra_credit_allowance`.
   - The group average, highest, and lowest are computed from graded percentages only.
6. **[WRITE]** On the first entry for a student, Audit: `assessment.score_set`. On a **change**, Audit:
   `assessment.score_changed` with old → new.
7. Teacher taps **"Lock marks"** when finished. **[WRITE]** Audit: `assessment.locked`.
8. Teacher taps **"Unlock"** to make a correction later; a reason is required. **[WRITE]** Audit:
   `assessment.unlocked` with the reason.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Score above the maximum plus configured allowance | Rejected inline; the previous value is kept. |
| Negative score | Rejected inline. |
| Missing, excused, or not-taken result | Excluded from averages, never treated as zero. |
| Locked assessment | The inputs are disabled and show a "marks are final" badge; unlocking is required to edit. |
| Student enrolled after the assessment | The new student appears with a blank score (so the teacher can enter a mark if they sat the paper). |
| Assessment with no scores | The group average shows `—`. |

**AC:** F-P1-09, F-P0-07

---

## F13 — Prepare a parent update

**Actor:** Teacher · **Tier:** P1 · **Preconditions:** a student exists; a parent phone is on file for
one-to-one messages

> **Non-negotiable:** this flow never produces a "sent", "delivered", or "read" state. The only
> truthful outcome is "prepared" and "opened in WhatsApp". (NF-2)

**From the Communication screen**
1. Teacher opens **Parents / WhatsApp**.
2. Teacher picks a message type: **Attendance update** · **Homework reminder** · **Assessment result**
   · **Progress report** · **Group announcement** · **Custom message**.
3. Teacher picks the student (or the group, for announcements).
4. The **preview pane builds a draft from real records**:
   - Attendance update → attendance rate, consecutive absences, and the last 3 session marks.
   - Homework reminder → homework title, due date, and the student's submission status.
   - Assessment result → the student's score / maximum for a chosen assessment.
   - Progress report → attendance rate + assessment average + homework completion.
5. Teacher edits the draft freely; the text remains editable in full.
6. Teacher taps **"Open in WhatsApp"**:
   - The parent's phone is normalised to E.164 (`20…`) and a `wa.me` link is opened in a new tab with
     the text prefilled.
   - **[WRITE]** The message is recorded as `prepared` and then as `opened_in_whatsapp`, with the body,
     type, student, and the phone used. Audit: `message.prepared`.
   - The toast reads **"Opened in WhatsApp"** — never "Sent".
7. If the parent phone is missing or malformed, the button is disabled with an inline explanation, and
   a **"Copy message"** fallback is offered.

**From the student profile**
8. Teacher taps **"Message parent"** on a student profile → the same modal, pre-set to that student
   and to the attendance type.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Parent phone missing | Button disabled + "Add the parent's phone number first" + a shortcut to the student record. |
| Parent phone malformed (`0100…`, `+201…` with letters) | Rejected at data entry; at message time the button is disabled with the same explanation. |
| Parent has two children | The teacher picks the child; only that child's data appears in the draft. |
| The record changed after the draft was built | The draft is **rebuilt from the record at open time**, not from a frozen snapshot, so the message never contradicts the system. |
| Group announcement | No parent phone is used; the teacher sends in a group chat. The record still stores the body. |
| The teacher closes WhatsApp without sending | Kashkol still only shows "opened in WhatsApp". It never claims more. |
| Desktop with no WhatsApp app | The deep link may fail to open; a **"Copy message + copy phone number"** action is always available. |

**AC:** F-P1-10, F-P0-07

---

## F14 — Manage and share learning materials

**Actor:** Teacher · **Tier:** P1 · **Preconditions:** signed in

1. Teacher opens **Learning materials** and chooses **Upload**.
2. Teacher enters a title, optional description, subject/topic, and chooses access:
   - **Teacher only** — visible to workspace staff with the `files` permission.
   - **Selected groups** — choose one or more groups.
   - **Selected students** — choose one or more students.
3. Teacher chooses a PDF, PNG/JPG image, or DOCX/XLSX/PPTX document (≤ 25 MB).
4. The browser reports upload progress while the server validates the extension, MIME, and file
   signature, generates a safe object key, and writes the private object and tenant-scoped metadata.
5. **[WRITE]** The file record is created with `scan_status = pending`. Audit: `file.uploaded`.
6. The client requests an authenticated scan. `clean` files become downloadable; detected malware
   becomes `blocked`. A scan outage leaves the file pending and the teacher may retry. Audit:
   `file.scan_result`.
7. The library lists title, scope targets, subject/topic, uploader, size, date, and scan status;
   workspace storage usage is computed from non-deleted file rows.
8. Each staff or portal download request rechecks workspace, permission/grant, access scope, archive
   state, and clean scan status before issuing a three-minute signed URL.
9. Teacher may rename and organize a file, archive/restore it, or delete it. Archive retains the
   object but removes the file from active lists and portal access. Delete removes the object.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| File too large | Rejected client-side with the limit shown; server-side check is authoritative. |
| Unsupported or executable content | Rejected with the accepted types; server-side validation is authoritative. |
| Scan blocked | The file stays listed as blocked, with no download URL. |
| Scanner unavailable | The file remains pending and non-downloadable; the teacher can retry. |
| Target group or student archived | Its label is retained with an archived marker; archived students cannot use portal access. |
| Assistant without `files` permission | The page/API is denied; the hidden control is not the security boundary. |
| Portal user not linked to the selected student/group | The request is denied without disclosing whether a foreign file exists. |
| Download link expiry | The URL expires after three minutes; the UI requests a fresh authorized URL. |

**AC:** F-P1-11, F-P0-01

---

## F15 — Read reports

**Actor:** Teacher · **Tier:** P1 (read) / P2 (export) · **Preconditions:** signed in

1. Teacher opens **Reports**.
2. Teacher selects a period: last 7 days / last 30 days / this term / custom range. Default: last 30
   days.
3. The page loads four panels:
   - **Attendance trend** (line) — daily attendance rate over the period.
   - **Homework completion trend** (line) — weekly completion rate.
   - **Average assessment score by group** (bar).
   - **Students needing attention** — the flagged list with reason chips and links.
4. Every value is computed from records within the selected period and the signed-in workspace.
5. **[P2]** Teacher taps **"Export summary"** → a job is queued; the UI shows "Preparing…", then
   "Ready — Download" with an expiring link.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Period with no data | "No data in this period." — not a chart of zeros. |
| A day with no sessions | That day is omitted from the trend line (or shown as a gap), never as 0 %. |
| Export in P1 | The export button is **hidden** in P1 (not shown-and-faked). It appears in P2. |
| Export job fails | The teacher sees the failure and can retry; nothing partial is offered. |

**AC:** F-P1-12, F-P2-10

---

## F16 — Invite an assistant and set permissions

**Actor:** Workspace owner · **Tier:** P2 · **Preconditions:** owner only

1. Owner opens **Teachers & Assistants** (or **Settings → Team**).
2. Owner taps **"Add member"** and enters name + email, then selects the role:
   - **Teacher (full access)** — all permissions, checkboxes disabled.
   - **Assistant** — explicit permission checkboxes.
3. Owner ticks the permissions to grant:
   `Students` · `Grades` · `Attendance` · `Homework` · `Files` · `Messages` · `Payments` · `Settings`
   · `Team (view)` · `Activity log`.
   - The prototype's five (`students`, `grades`, `attendance`, `finance`, `settings`) are the seed; the
     set is extended for P2.
4. **[WRITE]** An invitation is created and an email is sent with a single-use link.
   Audit: `team.invited`.
5. The invitee opens the link, sets a password, and joins **that workspace only**.
   **[WRITE]** Audit: `team.joined`.
6. The owner changes a permission later → **[WRITE]** Audit: `team.permissions_changed` with the
   before/after grant sets.
7. The owner removes a member → their sessions are revoked immediately. **[WRITE]** Audit:
   `team.member_removed`. Their past audit entries remain.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Invite to an email that is already a member | Rejected with "already a member of this workspace". |
| Invite link expires | Resend (rate-limited to 1 per 60 s). |
| Assistant with no permissions | Allowed; the assistant sees an empty workspace and a "you have no access yet" state. |
| Assistant attempts a restricted action | The API returns `403` and the UI shows a clear "you do not have permission for this" message — the control is hidden *and* the action is refused. |
| Assistant tries to invite, change the owner's permissions, or delete the workspace | Refused server-side regardless of what the UI shows. |
| Removed member with an active session | The next request returns `401`; they are signed out. |

**AC:** F-P2-01, F-P0-07

---

## F17 — Parent links to a child and uses the parent portal

**Actor:** Parent · **Tier:** P2 · **Preconditions:** the student record has a parent contact; the
parent has a phone number

**Linking**
1. **Path A (teacher-issued):** the owner opens the student record → **Parent access** → taps
   **"Issue access link"**. A one-time code/link is generated, valid 24 h, single use.
   **[WRITE]** Audit: `parent.access_issued`.
2. **Path B (parent-initiated):** the parent opens the portal, enters the child's name and the parent
   phone on file, and submits a request. The teacher receives a request and approves or declines.
   **[WRITE]** Audit: `parent.access_requested` / `parent.access_approved` / `parent.access_declined`.
   - A request for a phone number that does not match any parent contact is rejected and the attempt is
     logged — it is not a way to enumerate students.
3. The parent signs in with an OTP sent to the verified parent phone, or via the emailed one-time link.

**Using the portal**
4. The portal home shows one card per linked child: name, group, next session, and only the
   explicitly allowlisted summary fields for that portal release.
5. The parent opens a child and sees tabs: **Overview** · **Attendance** · **Results** · **Homework** ·
   **Updates** · **Files**.
   - Attendance: the rate and the per-session mark list, with no other student's data.
   - Results: only fields explicitly projected by the authorized parent-results route for that
     linked child (assessment title/type/date, result status, score, maximum, and percentage).
     Group summaries, teacher notes, homework feedback, and follow-up notes are not exposed.
   - Homework: what was assigned, the due date, and the child's submission status.
   - Updates: the teacher's prepared messages for that child.
   - Files: the files shared with the child's group or assigned to the child.
6. The parent can **download** a shared file via a signed link.
7. Every portal request is audited with the parent as actor.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Parent has two children in the same workspace | Both appear; switching between them is explicit. |
| Parent requests access for a child they are not the recorded contact for | Rejected; the teacher is asked to approve explicitly. |
| Parent loses access | The owner revokes the link; the parent's session ends on the next request. |
| Parent opens another child's data | Impossible by construction: every portal query is scoped to the linked student ids. A cross-link attempt returns `403`. |
| Group averages | **Never** shown in the portal — they could reveal other children. |
| Parent asks for a teacher's note, homework feedback, or follow-up note | These staff-only fields are not exposed by the parent portal. |
| OTP delivery fails | Fall back to an emailed one-time link; the phone path is retried with a cooldown. |
| The child's group is shared with other families | The parent sees only group-scoped **files and homework**, never other students' records. |

**AC:** F-P2-02, F-P2-09

---

## F18 — Student links to their record and uses the student portal

**Actor:** Student · **Tier:** P2 · **Preconditions:** the student record has a phone

1. The teacher issues a one-time access code for the student (on the student record, or a printed code
   handed out in class). **[WRITE]** Audit: `student.access_issued`.
2. The student opens the portal, enters the code plus their name, and signs in (OTP to the phone on
   file, or the emailed link).
3. **[WRITE]** Audit: `student.portal_signed_in`.
4. The portal shows:
   - **Next session** — date, time, room, group.
   - **My attendance** — the rate and the per-session history.
   - **My homework** — assignments with due dates and submission status, and a **Submit** action.
   - **My results** — assessment scores.
   - **Files** — files shared with their group or assigned to them.
5. The student taps **Submit** on a homework item → **[WRITE]** the submission status becomes
   `submitted` with a server timestamp. Audit: `homework.submitted`.
6. The teacher's completion bar updates immediately.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Code already used | Rejected; the teacher issues a new one. |
| Code belongs to another student | Rejected. |
| Student tries a teacher endpoint | `403` on every teacher route. |
| Student sees another student | Impossible by construction; queries are scoped to their own student id. |
| Homework already submitted | The student can re-submit if the teacher allows it; the first timestamp is retained and the latest is shown. |
| Device lost | The teacher revokes access; sessions are invalidated. |

**AC:** F-P2-03

---

## F19 — Record a manual payment

**Actor:** Teacher · **Tier:** P2 · **Preconditions:** a student exists; a monthly fee may be configured

1. Teacher opens **Payments** (owner only, or an assistant holding `payments`).
2. Teacher taps **"Record payment"** and selects: student, period covered, amount, method
   (`cash` / `transfer` / `other`), date, optional receipt reference, and an optional note. The
   authenticated operator is recorded by the server.
3. **[WRITE]** The payment record is created. Audit: `payment.recorded`.
4. The student's outstanding balance is recomputed in piastres from the monthly/group fee rules,
   payment rows, and separate adjustment rows.
5. Teacher records a discount, refund, or correction as a separate record with a required reason.
   The original receipt is never amended or deleted. Refunds cannot exceed the remaining refundable
   receipt amount. Audit: `payment.<kind>_recorded`.
6. The **Outstanding** list shows students with a positive balance and shows overpayments as credits.
7. Teacher opens **Reports** → **Student balances**, chooses an as-of date and optional group/student
   filters, and views the expected, received, adjustment, and resulting balance amounts. Export
   queues a CSV using those same filters.
8. Monthly/group fees accrue by enrolled period, not by attendance. Cancelling a session does not
   reduce a monthly fee; a make-up session does not add a fee. The teacher must record a reasoned
   adjustment for an agreed exception.
9. Per-session billing, when the teacher has priced sessions or a group with a `default_price_per_student_minor`,
   is charged as price × (present + late marks) per non-cancelled session, replacing the monthly fee
   rule for that group's enrolled students. The balance card and the payments list share the same
   computation (`ADR-0025`). The per-student "paid" toggle in a session's attendance view writes or
   voids a real session-linked `payment` row in the same transaction; toggles are disabled when
   no price is configured for the session.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Amount ≤ 0 | Rejected. |
| No fee configured | The teacher can still record payments; outstanding is not computed and the UI says "set a monthly fee to track balances". |
| Partial payment | Allowed; the remainder stays outstanding. |
| Overpayment | Allowed and shown as a credit, not clamped. |
| Payment for a future period | Allowed with a note. |
| Cancelled session | Does not change a period-based monthly/group fee or create a transaction. Session-priced groups accrue 0 from a cancelled session. |
| Make-up session | Does not create an additional fee or transaction. |
| Session-priced group, no fee rule configured | Expected revenue = price × (present+late) marks; collected = real session-linked payments; outstanding = expected − collected. |
| No session price configured | The "paid" toggle is disabled; marking attendance is still possible; no session charge is accrued. |
| Toggle paid for a student with no price on the session | Rejected with `Payment.errors.sessionPriceMissing`. |
| Agreed fee exception | Requires a separately audited adjustment with a reason. |
| Duplicate submission | Same idempotency key and payload returns the existing record; a different payload is rejected. |
| Parent requests a balance or receipt | Denied; parent payment projections are not enabled in this release. |
| Assistant without `payments` | The screen is hidden **and** the API returns `403`. |

**AC:** F-P2-04, F-P0-07

---

## F20 — Take attendance by QR

**Actor:** Teacher · **Tier:** P2 · **Preconditions:** a session exists; the device has a camera

1. Teacher opens the session's attendance screen and taps **"Start attendance"**. If the session is
   `scheduled`, the single tap starts the session **and** opens the scanner; the rest of the flow is
   identical to a session that is already `started`.
2. **[WRITE]** The server applies the session transition (`PATCH /api/sessions/:id` with
   action `start`) and returns the roster; the client refreshes once and opens the scanner
   immediately. Audit: `session.started`.
3. The attendance action now offers two modes on the same screen:
   the **QR scanner** (primary, opens immediately in "Start attendance" mode) and the **three manual
   mark buttons plus Late** (attended / absent / absent-with-excuse), which stay available at all
   times in both modes.
4. **[READ]** The roster renders the session's group first. A student scanned or marked only through
   another group appends into the roster **highlighted amber** (`isCrossSeason = true`) and remains
   visible with a cross-season badge.
5. **[PERF]** The decode path is fast: the camera stream is acquired once and kept open across scans;
   frames are downscaled to at most 480 px and decoded at ~15 fps; `BarcodeDetector` (hardware/OS)
   is used where the browser exposes it, with `jsQR` as the fallback on the same downscaled frame;
   repeated reads of the same code are suppressed client-side for ~4 s, while the server keeps the
   authoritative atomic duplicate rejection (`409 CONFLICT`). A rejection does not re-open or
   re-acquire the stream.
6. **[WRITE]** On success an attendance mark is written with `source = qr`, the device id, and the
   session/student binding. Audit: `attendance.marked` with `source = qr`.
7. The assistant sees, instantly and per student:
   - a checkmark with the student's name (aria-live banner),
   - a light success beep and, where the device supports it, haptic feedback (~60 ms),
   - a per-row yes / no control for **"did they do the homework"**, bound to the **latest active
     homework of the session's group**. The answer is stored as a `homework_completion_mark` row
     (`completed` / `not_completed`) linked to this session, upserted per (homework, student) in the
     same transaction as its audit event. Unrecorded state renders as unrecorded — never as a
     claimed answer. If the group has no active homework, the question is hidden.
8. A rejected scan shows a clear on-screen reason ("This code has expired" / "This student has no
   active enrolment" / "Already recorded") and is logged for teacher review. Audit:
   `attendance.qr_rejected`. Cross-season attendance remains visible and highlighted, never hidden.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Token expired | All scans are rejected with "expired"; the teacher regenerates. |
| Teacher rotates the token | The old token stops working immediately; the new QR is displayed. Audit: `attendance.qr_token_rotated`. |
| Student scans twice | The second scan is rejected as "already recorded" (or idempotently accepted with no second write — the chosen behaviour is configurable per session). |
| Unknown / unenrolled student | Rejected, with a generic message that does not confirm whether the person is a student. Logged. |
| Camera permission denied | The teacher can fall back to manual attendance; the feature never blocks the manual flow. |
| Teacher wants to mark absent by QR | Not possible — QR marks present (or late). Absences and excusals are manual by design. |
| A scan arrives after the session was cancelled | Rejected. |

**AC:** F-P2-05, F-P0-07

---

## F21 — Review a student's progress and follow up

**Actor:** Authorized teacher or assistant · **Tier:** P2 · **Preconditions:** the student has attendance, assessment, and
homework history

1. Teacher opens **Student Follow-up**. The rule list shows only flags whose source records the
   current user may read.
2. Each flag shows the student, the rule, the measured values, and source records with their dates:
   - consecutive absences within a group (threshold from workspace `at_risk_after`, default 2, shown with the flag);
   - homework still `not_submitted` after its due instant;
   - a latest-three graded assessment average below the preceding-three average.
   Missing, excused, and not-taken results do not enter assessment averages.
3. Teacher or authorized assistant creates a follow-up task with a student, title, owner, optional due
   date, and private note.
4. **[WRITE]** The task and its first history event are saved transactionally and audited.
5. The owner records an outcome to resolve the task. **[WRITE]** The outcome and history event are
   saved transactionally and audited. The task appears in the history list.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| No flagged students | A truthful empty state is shown. |
| Source permission missing | That source is omitted from flag calculation; the screen states which source categories are unavailable. |
| Flag condition stops applying | The computed flag disappears; the independent follow-up task and its history remain. |
| Follow-up task has no due date | Allowed and shown without a due date. |
| Assistant lacks a source permission | Cannot see that source's flag or records. |
| Parent or student requests a follow-up note or grade | No parent/student route exposes those staff fields. |

**AC:** F-P2-06, F-P0-10

---

## F22 — Export data

**Actor:** Teacher (own data) / Owner (full workspace + audit) · **Tier:** P2

**Reports export**
1. Teacher opens **Reports** and taps **"Export summary"**.
2. The server creates an export job. The UI shows **Preparing…** → **Ready**.
3. **[WRITE]** The export file is written to the workspace's storage. Audit: `export.created`.
4. Teacher downloads via a short-lived signed link.

**Full workspace export**
1. Owner opens **Settings → Data** and taps **"Download full backup (JSON)"**.
2. **[WRITE]** A full archive is generated including all tenant data **and the audit log**, with a
   schema version. Audit: `workspace.exported`.

**Restore**
1. Owner selects a previously exported archive.
2. The server runs a **pre-flight validation** and shows a report: schema version compatibility,
   entity counts, and any data that cannot be applied.
3. Owner confirms (typed confirmation) → the restore runs as a background job with a visible progress
   state.
4. **[WRITE]** On success, the workspace data is replaced and Audit: `workspace.restored` is appended
   (history is not erased).
5. On failure, the workspace is **unchanged** and the error report is shown.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Export job fails | The teacher sees the failure and can retry; no partial file is offered. |
| Archive from an incompatible schema version | Rejected at pre-flight with an explanation. |
| Restore interrupted | The workspace rolls back to the pre-restore state. |
| Restore by a non-owner | Refused (`403`). |
| Export contents include another workspace | Impossible by construction; a test asserts it. |
| Arabic content in CSV | UTF-8 with BOM so Excel opens it correctly; the header row can be Arabic or English. |

**AC:** F-P2-10, F-P2-11, F-P0-08

---

## F23 — Build and publish an online exam

**Actor:** Teacher · **Tier:** P3 · **Preconditions:** a group exists

1. Teacher opens **Online Exams** and taps **"Create exam"**.
2. Teacher sets: title, target group, duration (minutes), open/close window, and whether the score is
   shown immediately after submission.
3. Teacher adds questions. Each question has a type, text, and points:
   - **Multiple choice** → options + the correct option.
   - **True/False** → auto-generated True/False options.
   - **Essay (manual)** → free text; marked for manual grading.
4. **[WRITE]** The exam is created in `draft`. Audit: `exam.created`.
5. Teacher taps **Publish** → the exam becomes `open` and a share code/link is generated.
   **[WRITE]** Audit: `exam.published`.
6. Teacher copies the link and shares it (e.g. on WhatsApp).

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Question with no text | The exam cannot be published until it is completed. |
| MCQ with no correct answer chosen | The exam cannot be published (a question that can never be scored is a bug, not a feature). |
| Options left blank | Blank options are stripped on save. |
| Duration below the minimum | Clamped/rejected with a message. |
| Publishing with the open window in the past | Rejected. |
| Exam edited after attempts exist | Editing questions after publishing is blocked; the teacher must clone the exam instead. |

**AC:** F-P3-01

---

## F24 — Take an online exam

**Actor:** Student · **Tier:** P3 · **Preconditions:** the exam is `open`; the student is on the roster

1. Student opens the share link and is asked for their phone number (the prototype's flow, retained).
2. **[BOUNDARY]** The server matches the phone to a student **on the exam's roster** and, if matched,
   creates a short-lived attempt session. A non-matching phone gets a neutral message: **"This exam is
   not available for you."** — it does not confirm whether the person is a student.
3. Student answers the questions. The screen shows the exam title, the student's name, the duration,
   question numbers, and points per question.
4. The student taps **Submit**. **[WRITE]** The attempt is stored with the answers and
   `submitted_at`. Audit: `exam.attempt_submitted`.
5. Objective questions are auto-scored. If any essay question exists, the attempt is flagged
   `manual_pending` and the student is told **"Essay questions need manual grading"** — the automatic
   score is not presented as final.
6. If the exam shows the score after submission, the auto score is displayed; otherwise only the
   submission confirmation is shown.
7. The teacher sees the attempt in the **Results** view with a **Manual grade** column for essay
   questions. **[WRITE]** Audit: `exam.manually_graded`.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| Exam closed before submission | The attempt is refused; the student sees "This exam is not open right now." |
| Second attempt | Refused by default; allowed only if the teacher enabled re-attempts. |
| Time limit exceeded | The attempt auto-submits at the deadline with whatever is answered; the UI warns at 5 minutes remaining. |
| Network drop mid-exam | Answers are kept locally until the connection returns and are then submitted; the deadline still applies. |
| Same phone for two students | Rejected as ambiguous; the teacher resolves it by issuing a different link. |

**AC:** F-P3-01

---

## F25 — Attach a recorded lesson (external provider)

**Actor:** Teacher · **Tier:** P3 · **Preconditions:** an external video provider is integrated

1. Teacher opens the group (or session) and taps **"Attach recording"**.
2. Teacher pastes the provider's asset id / share URL, or uploads through the provider's own flow.
3. The server verifies the asset with the provider and stores: provider, provider asset id, title,
   duration, and a playback reference.
4. **[WRITE]** The attachment uses the same scope model as files (teacher-only, selected groups, or
   selected students). Audit: `video.attached`.
5. Students and parents of the group see the attachment in their portal with the provider's player.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| The provider cannot be reached | The attachment is saved as "unavailable — could not verify with the provider" and can be retried. Kashkol never renders a fake player. |
| The asset was deleted at the provider | The attachment shows "unavailable" with the teacher's notes still visible. |
| The provider's credentials | Held server-side only; never in the client bundle. |
| Provider webhook replay | Webhooks are idempotent; a replayed event does not duplicate the attachment. |
| Scope changes | Changing the scope of an existing attachment is allowed and audited. |

**AC:** F-P3-02

---

## F26 — Platform support access (break-glass)

**Actor:** Platform administrator · **Tier:** P3 · **Preconditions:** a support ticket exists

1. Admin opens the workspace in the admin console. The console shows **metadata only** — no student
   names, grades, or notes.
2. Admin needs content access to reproduce a bug → clicks **"Request content access"**.
3. Admin enters a ticket reference and a reason; the system issues a **time-boxed grant** (default
   1 hour) and records it.
4. **[WRITE]** Audit (platform-level and tenant-level): `admin.breakglass_granted` with the admin,
   ticket, reason, and expiry.
5. While the grant is live, the tenant UI shows a persistent banner: **"Platform support has temporary
   access to your workspace for support ticket #1234."**
6. Every read the admin performs during the grant is logged.
7. At expiry, access is revoked automatically; the banner disappears.

**Error / edge cases**

| Case | Behaviour |
|---|---|
| No ticket | The grant cannot be issued. |
| Admin tries to export tenant data in bulk | Not possible; there is no bulk export path. |
| Grant used outside the ticket | Detected by the activity log and reported. |
| Teacher objects | The owner can see the grant in their Activity Log and can contact support. |
| Admin has no content access | The console works normally with metadata only; nothing is blocked. |

**AC:** F-P3-03, F-P0-07, F-P0-08

---

## Appendix — Flow-level invariants

These hold across every flow and are the most likely things to get wrong.

1. **Every write is transactional and audited.** No partial writes, no client-only records.
2. **Every read is workspace-scoped from the session.** Never from a URL parameter, never from client
   state.
3. **Every derived number is computed from records.** No stored aggregates, no seeded values.
4. **Every state label is truthful.** "Opened in WhatsApp", not "sent". "Recorded", not "reconciled".
   "Preview", not "portal".
5. **No destructive delete of history.** Students, sessions, assessments, payments, files, and audit
   entries are archived or voided, never removed.
6. **Every screen has a real empty state** that distinguishes "nothing yet" from "nothing matches".
7. **Every destructive action is confirmed**, and actions that destroy or overwrite recorded history
   name what will be affected.
8. **Every form validates on the server**, and errors are shown inline in the active locale.
9. **Every asynchronous job is visible** with a state (queued / running / ready / failed) and is
   idempotent on retry.
10. **Every screen works at 320 px** and with the keyboard, in both directions and both themes.
