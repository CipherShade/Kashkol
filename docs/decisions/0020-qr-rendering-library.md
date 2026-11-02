# ADR-0020 — QR rendering uses `qrcode-generator`, pinned

Date: 2026-11-01 · Status: Accepted · Supersedes: none · Related: `INTEGRATIONS.md` §9 (IN-6), `docs/OPEN_QUESTIONS_AND_ASSUMPTIONS.md` `OQ-05`, ADR-0012

## Context

`F-P2-05` needs the teacher's device to display a short-lived rotating attendance
code that the linked student scans with their own phone (`OQ-05` default (a)).
The scan service (`/api/attendance/scan`, the hash-at-rest token store) was
already implemented, but no screen could display a QR image, so the flow ended
in a dead end: tokens could be issued by API but never shown to a student.

QR *generation* is an internal capability (`IN-6`), but *rendering* the payload
as an image needs an encoder. Options considered:

- **Hand-written encoder** — error-prone for a correctness-critical field (a
  single wrong matrix makes the code unscannable) and six hundred lines of code
  to review for no product value.
- **`qrcode` npm package** — full-featured; pulls in PNG/terminal encoders and
  their dependencies, more of which ends up in the client bundle.
- **`qrcode-generator` npm package** — a single-file, zero-dependency encoder
  (MIT) with an SVG output mode, beginning with an ISO-8859-1/byte-mode
  data path that fits the signed-token URL payload.

## Decision

Pin `qrcode-generator@1.4.4` exactly, as an application dependency, and declare
its types locally in `src/types/qrcode-generator.d.ts`. The attendance QR panel
renders the code as an SVG produced by this library from the payload URL
`{origin}/{locale}/portal/student?checkin={token}`.

## Consequences

- No PII is embedded in the QR payload (`IN-6` §9.2): the payload carries only
  the opaque token.
- Types are in-repo, so dep updates cannot silently change the QR API.
- Scan integrity still rests on the server-side check
  (`findActiveQrTokenByHash`) — the rendering library is presentation only.
- The SVG is rendered inside a white container so the code stays scannable in
  dark mode; this is a functional constraint, not a styling choice.

## Revisit trigger

If a stronger payload contract arrives (per-item signed payloads per `IN-6`
§9.2), re-evaluate the encoder choice together with the token service.
