# Real-device QR camera verification protocol

**Status:** Protocol only. **Not executed in this checkout.** No camera hardware, no real device,
and no browser camera stream were available here. This document is a procedure for a human to run
and record; it is not evidence that the camera path works, and it must not be read as a claim that
`F-P2-05` camera capture has been verified.

**Owners:** the person who runs it must have a teacher account, a physical device with a camera,
and a physical or second-device QR card. Unless every applicable row of §7 is recorded with a pass,
`F-P2-05` stays `◐` in `docs/STATUS.md` and `docs/RELEASE_PLAN.md`.

---

## 1. Why this exists

The scanner decode path is implemented and unit-tested, but a unit test cannot exercise
`getUserMedia`, a real camera stream, `BarcodeDetector`, or a printed QR. Acceptance criteria
`F-P2-05` AC-10 and AC-11 (`PRODUCT_REQUIREMENTS.md` 1064–1072) require a real camera/scanner path:

- the feature is never simulated in a demo build;
- the camera stream is acquired **once** and persists across scans;
- frames are downscaled to at most 480 px and sampled at ~15 fps;
- `BarcodeDetector` is used where the browser exposes it, with a `jsQR` fallback on the same frame;
- a ~4 s per-token suppression window stops repeat POSTs while the server keeps the authoritative
  atomic duplicate rejection;
- success shows the student's name, a checkmark, a beep/haptic, and an `aria-live` banner.

These are observable only on a device. Everything else about QR attendance (hashing, expiry,
rotation, enrolment checks, cross-season marking, audit events, rejection codes) is already covered
by unit and PostgreSQL integration tests and is **not** re-tested here.

**Capture flow:** `OQ-05` remains open. The code currently ships both the teacher-held scanner
(`src/components/sessions/qr-scanner-panel.tsx`) and a student self-check-in path using the session
code plus the student's attendance QR card (`src/components/students/student-attendance-qr.tsx`).
This protocol verifies the teacher-held camera scanner; the student-facing path is listed separately
in §6 so the result is not overstated.

---

## 2. What this protocol does and does not claim

**Does claim, once §7 is complete and signed:** on the tested device/browser, the camera stream
opens, a printed QR is decoded by whichever decoder the browser provides, a scan writes one
attendance mark with `source = qr`, repeat reads are suppressed client-side, and the documented
error states render.

**Does not claim:** verification of a different device/browser/version; throughput under a full
class; the `BarcodeDetector` branch if the tested browser does not expose it (record which branch
ran in §7); correctness of a navigation flow on a device not listed; that any scan was "sent" or
"delivered" anywhere — attendance is written locally to the workspace database, nothing is sent to
a student or parent by this action.

---

## 3. Preconditions

| # | Requirement | How to confirm |
|---|---|---|
| 1 | A build with `F-P2-05` enabled and no mocked camera. | The scanner panel is reachable from a session page; `qr-scanner-panel.tsx` is the production component, not a stub. |
| 2 | A physical device with a rear ("environment") camera. | The device has a camera and it is not covered or disabled by policy. |
| 3 | A modern browser with `getUserMedia` over HTTPS or `localhost`. | `https://` in the address bar (or `localhost` in development); `navigator.mediaDevices?.getUserMedia` exists. |
| 4 | Camera permission granted to the site. | Browser site settings show "Allow" for camera. If denied, the UI must show the `cameraDenied` message — that is case E1, not a setup failure. |
| 5 | Teacher account signed in, with a workspace that has at least one group and two active students. | The group roster shows the students. |
| 6 | One session for that group in `scheduled` or `started` state. | The session page opens the attendance client. |
| 7 | A scannable student attendance QR, printed or on a second device. | The student's **Portal Access** tab shows the QR card (title "Attendance QR" / "كود الحضور"), or its SVG/PNG download is available. It encodes `kqr_v1.<studentId>.<nonce>.<signature>` and carries no personal data. |
| 8 | A second, different student QR for the duplicate/other-student cases. | Same as 7, for a different active student. |
| 9 | A QR that is known invalid (e.g. a random `kqr_v1.`-prefixed string entered through the manual field). | Prepared in advance; never use a real student token for negative tests. |
| 10 | Browser devtools console available (optional, for branch detection). | Console open on the device or via remote debugging. |

**Never use a real student's name, phone, or personal QR data in a bug report or screenshot.** The
QR itself is opaque; screenshots should show only the scanner status banner and no roster personal
data beyond what is necessary to identify the test record. Use seeded test students.

---

## 4. Test matrix

| Case | Acceptance criterion | Scenario | Expected outcome |
|---|---|---|---|
| C1 | AC-11 | Camera opens on a supported browser. | Video viewport shows live camera; no warning alert. |
| C2 | AC-11 | Printed student QR held in the reticle. | Exactly one success banner with the student's name; mark written with `source = qr`; success beep/haptic. |
| C3 | AC-11 | Same QR held in front of the camera for ~6 s. | Only one mark; no repeated POST flood; a duplicate warning may appear after the suppression window, but no second mark is written. |
| C4 | AC-11 | A different student's QR scanned immediately after. | Second student marked, separate success banner; stream did **not** restart (video image is continuous). |
| C5 | AC-6 | "Mark as late" checked before scanning a fresh session/student. | The mark is recorded as late, shown in the roster. |
| C6 | AC-8 / flow step 8 | Invalid `kqr_v1.` token via manual field. | "Invalid or unverified QR code" (en) / equivalent (ar); no mark; no personal data in the message. |
| C7 | AC-8 / flow step 8 | QR of a student with no active enrolment, or a QR from another workspace. | "Student not enrolled in any active group" (en) / equivalent (ar); no mark; rejection logged for review. |
| C8 | AC-4 / flow step 4 | A student eligible only through a different group is scanned. | Student appended to the roster with an amber "Cross-group" badge; never hidden. |
| C9 | AC-7 | Token/card re-issued on the student's card between scans. | The old QR is rejected; the new QR works. |
| C10 | AC-10 | Manual attendance still available with the scanner open. | The three manual buttons and Late remain usable; scanning is not required to mark attendance. |
| E1 | F20 edge case | Camera permission denied. | `cameraDenied` message shown, scanner viewport replaced by warning; manual attendance still works. |
| E2 | F20 edge case | Browser without `BarcodeDetector`. | `jsQR` fallback decodes the same printed QR; record "jsQR" in §7. |
| E3 | F20 edge case | Browser with `BarcodeDetector`. | Hardware/OS detector decodes; record "BarcodeDetector" in §7. |

If the device/browser exposes only one decoder, record the other case as **N/A — not available**
and state that branch remains unverified. Do not mark it passed.

---

## 5. Procedure

### 5.1 Setup (once)

1. Sign in as a teacher on the physical device.
2. Open `https://<your-host>/en/app/sessions/<sessionId>` (replace with the real host and a test
   session id). Use `/ar/...` for a second pass if Arabic RTL rendering is in scope.
3. Confirm the group roster contains the two test students from §3.
4. If the session is `scheduled`, tap **Start attendance** — the session starts and the scanner
   opens immediately (F20 steps 1–2). Otherwise open the QR scanner mode explicitly.
5. In devtools console, determine the decoder branch and record it in §7:

   ```js
   "BarcodeDetector" in window ? "BarcodeDetector" : "jsQR"
   ```

6. Keep the browser tab in the foreground while running cases. Do not switch apps between C2 and
   C4: a backgrounded tab may pause frames and invalidate the "stream persists" observation.

### 5.2 Run the cases

1. **C1.** With permission granted, confirm the live video fills the viewport and no warning alert
   is visible. Record the result.
2. **C2.** Hold the printed student QR inside the dashed reticle, still for ~1 s. Confirm one
   success banner shows the student name and a checkmark. Confirm the roster row now shows a
   present mark with `source = qr` (open the session roster if needed). Record the result.
3. **C3.** Keep the same QR in front of the camera for ~6 s after the first success. Watch the
   network panel (optional): repeated POSTs of the same token should not occur while it stays
   visible. Confirm the roster still has exactly **one** present mark for that student. Record the
   result.
4. **C4.** Immediately present a second student's QR without closing the scanner. Confirm a second
   success banner and a second roster mark. Confirm the video image never blanked or restarted.
   Record the result.
5. **C5.** Start a fresh session (or use a student not yet marked), tick **Mark as late**, scan that
   student's QR, and confirm the roster shows a late mark. Untick the checkbox afterwards.
6. **C6.** Enter a random `kqr_v1.…` string in the **Manual QR token input** field and submit.
   Confirm the exact error message and that no mark is written.
7. **C7.** Use the QR of a student with no active enrolment, or one issued by another workspace.
   Confirm the "not enrolled" message and that no mark is written. Confirm the rejection is logged
   for teacher review (review surface, not a log containing personal data).
8. **C8.** Scan a student who belongs only to a different group but has an active enrolment in the
   workspace. Confirm the amber "Cross-group" row appears and stays visible.
9. **C9.** Re-issue the student's QR from their Portal Access tab (**Re-issue** → confirm), then scan
   the old card (expect rejection) and the new card (expect success). Re-issue invalidates the old
   token immediately.
10. **C10.** With the scanner still open, use the manual **attended / absent / absent-with-excuse**
    buttons on a different student. Confirm the mark is written and the scanner remains usable.
11. **E1.** In browser site settings, deny camera permission and reload the session page. Confirm
    the denial message and that manual attendance still works. Restore permission afterwards.
12. **E2 / E3.** Record which decoder branch was present from 5.1 step 5; if both are available on
    different devices, run C2 on each device and record both.

### 5.3 Arabic pass (optional but recommended)

Repeat C1, C2, and C6 under `/ar/`. Confirm RTL layout, the Arabic status banner, and that the QR
itself is unchanged (the token is locale-independent). Record as `C1-ar`, `C2-ar`, `C6-ar`.

---

## 6. Student-facing check-in path (separate scope)

This document does **not** claim the student self-check-in path was verified, because it requires
student accounts on real phones. To verify it separately, repeat the relevant positive and negative
cases using the session QR displayed to students and the `?checkin=` flow described in
`docs/STATUS.md` §5.X (Phase 2, item 7), then record the results with a `S-` prefix. Do not fold
those results into the teacher-scanner verdict.

---

## 7. Evidence record (fill in when executed)

| Field | Value |
|---|---|
| Executed by | |
| Date (UTC) | |
| Device make/model | |
| OS and version | |
| Browser and version | |
| Origin (HTTPS host) | |
| Decoder branch used (`BarcodeDetector` / `jsQR`) | |
| URL locale(s) tested (`en` / `ar`) | |
| Build commit / version | |

| Case | Result (`pass` / `fail` / `N/A — reason`) | Observed behaviour (brief) |
|---|---|---|
| C1 | | |
| C2 | | |
| C3 | | |
| C4 | | |
| C5 | | |
| C6 | | |
| C7 | | |
| C8 | | |
| C9 | | |
| C10 | | |
| E1 | | |
| E2 | | |
| E3 | | |
| C1-ar / C2-ar / C6-ar | | |

**Verdict:** ☐ verified on the listed device/browser ☐ not verified — gaps listed above

**Sign-off (name, date):** ______________________________

If any applicable row is `fail`, do not mark `F-P2-05` complete: file the failure with the device
and browser details, and keep the manual attendance path as the supported fallback.

---

## 8. References

- `docs/PRODUCT_REQUIREMENTS.md` §F-P2-05, AC-10 and AC-11 (lines 1064–1072).
- `docs/USER_FLOWS.md` §F20 (lines 811–862).
- `docs/OPEN_QUESTIONS_AND_ASSUMPTIONS.md` `OQ-05` (capture flow open).
- `docs/STATUS.md` §5.5, §5.6, §5.17, and §5.X (QR attendance verification history; repeatedly
  records that real-hardware camera capture was **not** performed).
- Implementation: `src/components/sessions/qr-scanner-panel.tsx`,
  `src/components/students/student-attendance-qr.tsx`, session page
  `src/app/[locale]/app/sessions/[sessionId]/page.tsx`.
- API: `POST /api/sessions/[sessionId]/attendance/scan`,
  `GET|POST|DELETE /api/students/[studentId]/qr`.
