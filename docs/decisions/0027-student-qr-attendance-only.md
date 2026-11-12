# ADR-0027: Student QR codes are attendance identification only

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** Product and Engineering
- **Scope:** `F-P2-03` (student portal, authenticated), `F-P2-05` (QR attendance), `F18` (student links to their record)
- **Serves:** `F-P2-03`, `F-P2-05`, `F18`, `R-01` (cross-tenant isolation), `R-06` (phone handling), `NF-1`, `NF-9`
- **Supersedes:** the QR-access portion of [ADR-0026](0026-student-portal-credentials.md) (decision item 8) and assumption `A-20`; resolves the contradiction between the password-only login and the printed sign-in QR

## Context

ADR-0026 shipped a teacher-side QR that encoded `/{locale}/portal?t=<token>` — a signed,
30-day, single-target *prefill* token. It was never an authentication secret: the QR only
filled the phone field; the password was still required.

A product review concluded the prefill QR is the wrong tool regardless:

1. It trains users to treat the printed card as a sign-in artifact, which is exactly how
   minors' credentials get handled casually.
2. The password on the card is the only secret that matters; the QR added no security and
   a permanent visual hint of a "login URL".
3. The QR cards teachers actually print and hand out to students for **attendance** are
   a different artifact (`student.qr_token_hash`) with a different lifetime and threat
   model. Two QR artifacts for one student invited confusion.

This ADR decides the separation: the student QR is for **attendance identification only**
and never authenticates.

## Decision

1. **No QR sign-in surface exists.** The `/{locale}/portal?t=<token>` prefill flow is
   removed from the sign-in page, the API and the docs. A student signs in with phone +
   password only (ADR-0026 stands for the credential itself).
2. **The attendance QR** is the only student QR. It is the signed opaque token
   `kqr_v1.<studentId>.<nonce>.<signature>` (HMAC-SHA256, server secret), stored hashed
   in `student.qr_token_hash` (per workspace), created atomically with the student row in
   the student-creation transaction (`createStudentQrForTx`), downloadable and printable
   from the student profile (`StudentAttendanceQr`), and revocable/re-issueable at any
   time. Revocation clears the hash; re-issuing invalidates the previous identifier
   immediately.
3. **Scanning is attendance-only.** The scan route verifies the HMAC signature, then the
   student's `qr_token_hash` against the record hash, then the workspace, then the group
   of the target session, then duplicate marks for that session. The 10-per-minute-per-IP
   rate limit applies (`attendance:scan:<ip>`). A scanned code cannot enumerate, cannot
   reset a password, cannot enable a disabled login, and cannot read any student data
   beyond what attendance marking itself reveals.
4. **Authorization rules for scanning are the attendance rules.** Source of truth is
   `attendance:write`. Assistants without the permission receive `403`; a disabled
   session is rejected before any mark is written; cross-workspace phones disambiguate by
   password for portal sign-in and by workspace-scoped hash for scanning.

## Consequences

- **Positive.** One QR concept per student. The printed card on the wall says "scan for
  attendance" and nothing else. The minors-safety review (all credentials opaque or
  single-target) is preserved with less surface.
- **Negative.** Teachers who relied on "print this and the student can tap it to sign in"
  lose the convenience; that was never a requirement.
- **Neutral.** Existing `student.qr_token_hash` rows remain valid. All `portal_login.qr_*`
  data is dropped by migration `20261113000000_drop_portal_login_qr`.

## Alternatives considered

- **Keep the prefill QR but stop advertising it.** Rejected: an unadvertised bearer of
  the sign-in URL is still a sign-in URL; the vulnerability is the concept, not the UI.
- **A second, attendance-only sign-in code for minors.** Rejected: adds a parallel
  credential (`OQ-21` default (a) remains correct) for zero product gain.
- **Rename the attendance token instead of removing the prefill QR.** Rejected: the two
  artifacts would remain visually similar and confusable.

## Revisit when

This decision is revisited if (a) a beta cohort reports that students sign in on paper
credentials alone in an unsafe pattern, or (b) a legal review requires attendance-only
verification to be re-auditable and linkable to a named session — in either case a new
ADR supersedes this one.
