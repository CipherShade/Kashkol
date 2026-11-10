# Architecture Decision Records

This directory holds the Architecture Decision Records (ADRs) for Kashkol.

An ADR captures a decision that is **expensive to reverse** and that a future engineer would
otherwise have to re-derive from the code. Anything that can be changed in an afternoon without
architectural consequence does not belong here — it belongs in the code.

## Format

Every ADR uses the same sections:

| Section | Contents |
|---|---|
| **Header** | Status, date, deciders, milestone scope |
| **Context** | The forces: requirements, constraints, and the problem being solved |
| **Decision** | What was decided, in the present tense, concretely |
| **Consequences** | Positive, negative, and neutral consequences, stated honestly |
| **Alternatives considered** | What was rejected and **why** |
| **Revisit when** | The concrete trigger that should reopen the decision |

## Index

| ADR | Title | Status | Scope |
|---|---|---|---|
| [0001](0001-modular-monolith-nextjs.md) | Modular monolith on Next.js App Router | Accepted | M0–M3 |
| [0002](0002-postgresql-prisma-7.md) | PostgreSQL with Prisma 7 | Accepted | M0–M3 |
| [0003](0003-better-auth-over-authjs.md) | Better Auth instead of Auth.js v5 | Accepted | M0–M3 |
| [0004](0004-tailwind-v4-shadcn-radix.md) | Tailwind v4 with Radix primitives and shadcn/ui patterns | Accepted | M0–M3 |
| [0005](0005-url-locale-routing-next-intl.md) | URL-prefixed locales with next-intl | Accepted | M0–M3 |
| [0006](0006-server-enforced-tenancy-rls.md) | Server-enforced tenancy with PostgreSQL RLS | Accepted | M0–M3 |
| [0007](0007-derived-state-is-computed.md) | Derived state is computed, not stored | Accepted | M0–M3 |
| [0008](0008-transactional-outbox-job-runner.md) | Transactional outbox and an in-deployment job runner | Accepted | M0–M3 |
| [0009](0009-object-storage-signed-urls-scan-pipeline.md) | Private object storage with signed URLs and a scan pipeline | Accepted | M1 |
| [0010](0010-whatsapp-deep-link-abstraction.md) | WhatsApp as a client-side deep link only | Accepted | M2 |
| [0011](0011-deploy-on-railway.md) | Deploy on Railway | Accepted | M0–M3 |
| [0012](0012-testing-and-isolation-matrix.md) | Generated testing and isolation matrices | Accepted | M0–M3 |
| [0013](0013-defer-redis-and-microservices.md) | Defer Redis, queues, and microservices | Accepted | M0–M3 |
| [0014](0014-audit-log-append-only.md) | Append-only audit log | Accepted | M0–M3 |
| [0015](0015-shared-zod-validation-schemas.md) | Shared Zod validation schemas | Accepted | M0–M3 |
| [0016](0016-spreadsheet-library-exceljs.md) | Spreadsheet processing with exceljs | Accepted | M1–M3 |
| [0017](0017-clamav-and-learning-materials.md) | ClamAV scanning and the learning-materials library | Accepted | M1 |
| [0018](0018-monthly-fees-and-cancelled-sessions.md) | Period-based fees and session cancellation | Accepted (partially superseded by ADR-0025) | M2 |
| [0025](0025-per-session-attendance-billing.md) | Per-session attendance-based billing | Accepted | M2 |
| [0020](0020-qr-rendering-library.md) | QR rendering uses `qrcode-generator`, pinned | Accepted | M2 |
| [0021](0021-forms-foundation.md) | Relational forms foundation with server-side conditional logic | Accepted (partially superseded by ADR-0022) | M3a |
| [0022](0022-forms-visual-builder.md) | Forms visual builder supersedes revision deferral | Accepted (approved 2026-11-04) | M4 / extension |
| [0023](0023-interface-visual-refresh.md) | Interface visual refresh — the Kashkol canvas | Accepted (approved 2026-11-08) | M0–M3 |
| [0024](0024-worker-cross-workspace-enumeration.md) | Worker workspace enumeration via a `SECURITY DEFINER` function | Accepted | M0–M3 |

## Conventions

- **Numbering** is sequential and never reused. A withdrawn ADR keeps its number and is marked
  `Superseded by ADR-XXXX`.
- **Status** is one of `Proposed`, `Accepted`, `Deprecated`, `Superseded`.
- **Immutability.** An accepted ADR is not edited to change a decision. A change creates a new ADR
  that supersedes the old one. Typo fixes are the only permitted edit.
- **Every ADR links** to the requirement or requirement flow it serves, so a reviewer can trace a
  decision to a source of truth.
- **Version pins** recorded here are exact. A dependency upgrade that changes a recorded pin
  requires a new ADR or an explicit amendment in this index.

## Requirement traceability

`F-Pn-nn` are the requirement flows in `PRODUCT_REQUIREMENTS.md` §5–§8. `R-nn` are entries in the
risk register (`PRODUCT_REQUIREMENTS.md` §11). `NF-n` are the hard prohibitions
(`PRODUCT_REQUIREMENTS.md` §12). `A-nn` and `OQ-nn` are the assumptions and open questions
(`OPEN_QUESTIONS_AND_ASSUMPTIONS.md`).

| ADR | Primary source references |
|---|---|
| 0001 | `R-04`, `R-11` |
| 0002 | `R-01`, `R-02`, `F-P0-09` |
| 0003 | `F-P0-02` |
| 0004 | `R-05`, `R-09`, `F-P0-05` |
| 0005 | `R-05`, `R-07`, `A-03` |
| 0006 | `R-01`, `NF-9`, `F-P0-01`, `F-P0-09` |
| 0007 | `R-02`, `NF-1`, `F-P1-06`, `F-P1-07`, `F-P1-09` |
| 0008 | `F-P0-08`, `F-P1-11`, `F-P2-10` |
| 0009 | `F-P1-11`, `F-P2-10`, `A-09` |
| 0010 | `F-P1-10`, `R-03`, `NF-2` |
| 0011 | `F-P0-09`, `R-11` |
| 0012 | `R-01`, `R-15`, `NF-9`, `F-P0-01`, `F-P2-01` |
| 0013 | `R-04`, `R-11`, `OQ-01` |
| 0014 | `F-P0-07`, `R-08`, `NF-7` |
| 0015 | `F-P1-02`, `F-P1-03`, `NF-13` |
| 0016 | `F-P1-03`, `F-P2-10`, `NF-13` |
| 0017 | `F-P1-11`, `F-P0-01`, `A-09` |
| 0018 | `F-P2-04`, `R-02`, `NF-1` |
| 0025 | `F-P2-04`, `R-02`, `NF-1` |
| 0020 | `F-P2-05`, `OQ-05` |
| 0021 | `F-P3-09`, `R-01`, `R-02`, `R-15`, `NF-1`, `NF-8`, `NF-9`, `NF-13` |
| 0022 | `F-P3-09`, `F-P3-12`, `NF-1`, `NF-12` |
| 0023 | `F-P0-04`, `F-P0-05`, `F-P1-01`, `F-P1-02`, `F-P1-15`, `NF-10`, `DEF-13` |
| 0024 | `F-P2-07`, `F-P2-10`, `R-01`, `NF-9` |
