# ADR-0026: Teacher-generated student portal credentials

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** Product and Engineering
- **Scope:** `F-P2-03` (student portal, authenticated), `F18` (student links to their record)
- **Serves:** `F-P2-03`, `R-01` (cross-tenant isolation), `R-06` (phone handling), `OQ-03` default (a), `A-18`, `A-19`, `A-20`, `NF-1`, `NF-9`

## Context

The student portal was reachable only through invitation links (`portal_invitation`, verified email,
single-use, `OQ-09`). That path assumes the student (or their parent) has a verified email address
matching an invited address. Many Egyptian students do not have an email address; `A-11` bans
collecting one merely to satisfy that flow. `OQ-03` default (a) says the student authenticates with a
per-student code issued by the teacher — never a self-created account, never an email the product
does not hold.

The invitation flow also cannot answer the practical teacher workflow: "I have 40 students, each
needs to sign in at `/portal` on their own phone this term." It remains for parents and stays
unchanged here.

## Decision

1. **Credential shape.** Username = the student's phone normalised to E.164
   (`normalizePortalPhone`, folding Arabic-Indic digits and separators). Password = `KSH-XXXX-XXXX`
   — 8 characters drawn from an ambiguity-free alphabet (`[2-9A-HJKMNPQRSTUVWXYZ]`, no `0/O`,
   `1/I/L`) with `crypto.randomBytes`. No activation step, no self-set password, no second factor
   beyond the password at this milestone.

2. **Storage and hashing.** A Better Auth `credential` account is the only password store
   (`provider_id = 'credential'`, `account_id = user.id`), hashed with Better Auth's scrypt scheme —
   the same KDF staff passwords use. The `user` row carries a synthetic, non-deliverable email
   (`student-<portal_user_id>@students.kashkol.invalid`, `email_verified = true`); students never
   see or use it. No plaintext, no reversible encoding, no app-specific hashing scheme exists.
   `src/modules/identity/` owns the Better Auth integration; no other module imports it ad hoc.

3. **Issuance in the same transaction.** `portal_login` (global identity table, deliberately **not**
   tenant-scoped, no RLS — sign-in resolves by phone before a tenant exists) and the tenant
   `portal_grant` (`kind = 'student'`) are created in the same tenant-scoped transaction as the
   student when the creator holds `portal_access:write`, or on explicit provision from the student
   record. Creation cannot leave one without the other. An assistant without `portal_access:write`
   creates the student with no credential; the teacher provisions one later.

4. **One-time reveal.** The generated password reaches the browser exactly once, in the issuing
   request's action state (`FormActionState.oneTimeCredential`). It is never persisted, re-served,
   logged, audited, or sent over any channel. There is no "view password" action, ever.

5. **Regeneration.** Any actor with `portal_access:write` may regenerate. Regeneration replaces the
   scrypt hash, sets `status = active`, clears the QR token, and revokes all sessions of the
   credential user in the same transaction, so the old password stops working immediately. If the
   previous grant was revoked, a fresh `user` + `portal_login` + `portal_grant` set is provisioned
   instead of resurrecting the revoked link.

6. **Enable / disable.** Disabling requires `portal_access:write`, flips `portal_login.status` to
   `disabled`, deletes the credential's sessions, and clears the QR token. Enabling restores
   `active` only when the underlying grant is not revoked. A disabled login cannot sign in; the
   error is the same generic invalid-credentials family as any other failure.

7. **Phone change.** `username_phone` is re-pointed to the student's new number; the old number
   stops resolving. If a student with a credential has their phone changed or removed by an actor
   without `portal_access:write`, the update is rejected with `403
   errors.portalPhoneUpdateNeedsPortalAccess` (fail-closed). Removing the phone disables the
   credential and revokes sessions.

8. **QR access.** The QR encodes `/{locale}/portal?t=<token>`. The token is opaque, 32 random
   bytes, 30-day expiry, stored as SHA-256 in `portal_login.qr_token_hash`, single-login-use by
   password gate (the QR only prefills the phone field; it is **not** an auth secret). Unknown,
   expired, disabled, or revoked tokens silently prefill nothing. Disabling, regenerating, or phone
   removal clears the hash.

9. **Sign-in surface.** `/{locale}/portal` (separate from the staff `/sign-in`). The flow:
   `portalSignInSchema` parse → `resolveStudentPortalSignIn` (application lockout: 5 failures per
   15 minutes keyed on hashed `portal:<phone>`, on top of Better Auth's 3-per-10s limit, checking
   scrypt for every candidate sharing the phone) → `signInEmail` on the synthetic email → real
   Better Auth session scoped to the linked student. A portal session can never call a teacher
   endpoint.

10. **Authorization.** New sensitive resource `portal_access` (`read` for metadata: existence,
    username, status; `write` for provision/regenerate/enable/disable/QR). Assistants hold it only
    when explicitly granted; owners always pass. The resource is `SENSITIVE_PERMISSIONS`, shown
    with a warning in the team permission editor, and is required in addition to `students:write`.

11. **Audit.** Every credential mutation writes `portal.credential.{provisioned,regenerated,
    enabled,disabled,phone_changed}` on the shared `audit_event` path in the same transaction.

12. **Bulk import is out of scope.** The CSV/XLSX import never provisions credentials (`OQ-21`
    default (a)). Provisioning is a deliberate per-student action; a bulk one-time reveal sheet is a
    separate design with its own permission split.

## Alternatives considered

- **Parent-mediated credentials only** (portal accounts for guardians, students piggy-back). Rejected:
  it couples two distinct audiences, leaks parent into the student surface, and still needs a code
  for the student alone.
- **Self-service activation** ("first login sets your password"). Rejected: activation is a
  recovery channel without identity proof; the teacher is the identity authority. An activation flow
  also creates a larger attack surface for minors' accounts.
- **Email/OTP for students.** Rejected (`OQ-03` default (a), `A-11`): many students have no email;
  OTP needs a provider contract the product does not hold yet; minors receiving OTP on a parent's
  phone is just the parent flow with extra steps.
- **Per-workspace phone uniqueness relaxed entirely.** Rejected by data model: the partial unique
  index `student_workspace_phone_unique` (migration `20261024130000_core_domain`) exists to keep
  the roster sane; students may share a phone **across** workspaces (resolved by password), not
  within one.
- **QR as a bearer token** (scan → signed in). Rejected: a bearer token on paper is a permanent
  credential anyone holding the printout can replay; prefill-only keeps minors safe and revocation
  meaningful.

## Consequences

- `/portal` becomes a real, password-gated surface with Better Auth sessions; sessions are revoked
  on regenerate/disable via `deleteSessionsForUserTx`.
- The phone becomes the public identifier of the credential; teachers must treat it as such in
  support tooling (the lockout key is hashed, so the table cannot be used to enumerate which
  parents have accounts).
- `portal_login` is a global table by design; tenant data stays in `portal_grant`. RLS-free on
  purpose, and the blast radius is one row per credential (username phone, status, QR hash — no
  student identity).
- Shared phones across workspaces are supported; within a workspace, the existing roster unique
  index still applies. Teachers wanting siblings on one login print the code instead.
- The migration comment cites `F-P3-01` in error; the feature serves `F-P2-03` / `F18`. The file is
  immutable as applied; recorded here instead (see `DATA_MODEL.md` §10, migration
  `20261112000000_student_portal_credentials`).
- Rate-limit constants (`LOCKOUT_MAX_FAILURES = 5`, `PORTAL_QR_TTL_MS = 30 days`) are first
  defaults, not tuned values; revisit with pilot telemetry without weakening the fail-closed rules.

## Reopening trigger

This decision is reopened if (a) a beta cohort reports students signing in on shared family devices
where passwords cannot be separated, (b) a provider contract makes student OTP cheaper than the
teacher workflow, or (c) bulk provisioning becomes a hard requirement (`OQ-21` resolves to (b)/(c)) —
each requires a new ADR superseding this one.
