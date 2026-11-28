# ADR-0052: Required teacher phone at account creation

- **Status:** Accepted (product-owner decision, 2026-11-28)
- **Date:** 2026-11-28
- **Deciders:** Product owner (explicit decision: email **and** phone are both required for every new teacher account, including social sign-in); engineering records and implements
- **Scope:** M0 identity, account creation and recovery
- **Serves:** `F-P0-02`, `F-P0-08`, `F1`, `F28`, `R-01`, `R-06`, `NF-1`, `NF-8`, `NF-11`, `NF-12`
- **Supersedes in part:** `F1` step 3 and `F-P0-02` AC-1 only where they define registration as email + password without a phone; all other registration rules remain in force
- **Relates to:** `ADR-0003` (Better Auth owns identity tables), `ADR-0030` (explicit-only social linking), `ADR-0036` (two-step sign-up), `OQ-09` (no SMS/OTP provider), `A-11` (data minimisation)

---

## Context

Teacher registration currently requires a name, an email address and a password. F1 step 3 and
`F-P0-02` AC-1 do not collect a phone number. The product owner has decided that every **new**
teacher account must supply both an email address and a phone number at account creation, including
accounts created through Google or Facebook sign-in.

The phone is contact data, not an authentication factor. `OQ-09` keeps emailed links as the default
portal channel and rules out an SMS/OTP contract for M2; `NF-2` forbids claiming delivery that the
system does not perform. The project therefore must not imply that a verification SMS is sent, that
the number is confirmed, or that it can be used to recover an account today.

`DATA_MODEL.md` §5.1 forbids adding columns to the Better Auth-owned `user`, `session`, `account`
and `verification` tables. Phone data must live on an app-owned table.

---

## Decision

1. **Required fields.** Every new teacher account must supply a valid email address and a valid phone
   number. Email remains unique and verified by a single-use link. Password rules are unchanged.
2. **Phone format and storage.** The raw phone is normalised with the existing Egyptian/international
   normaliser to E.164 (`^\+[1-9]\d{6,14}$`). Client validation is advisory; server validation is
   authoritative. The normalized value is stored on a new app-owned `user_phone` table, keyed by the
   Better Auth `user.id`, with no workspace id and no RLS. The phone value is **not unique**: two
   teachers may share a number, and no phone lookup is used to identify an account.
3. **Store only.** Kashkol validates and stores the number. It sends no SMS, issues no phone OTP,
   claims no phone verification, and never marks the number as "verified". The UI says only that the
   number is stored as contact data.
4. **Credential sign-up.** The phone is collected with name, email and password on the sign-up form
   and persisted for the created user before the success destination is shown. If the phone cannot
   be persisted, sign-up fails visibly; a partial account is never presented as a completed one.
5. **Social sign-in.** An account created through Google or Facebook must supply a phone before it can
   use the teacher app. The app gate redirects a signed-in user without a phone to a phone-collection
   screen; the screen writes the phone from the verified session user id, never from a client-supplied
   id. Explicit account linking remains governed by `ADR-0030`.
6. **Existing accounts.** Accounts created before this change keep working. There is no forced
   backfill and no sign-in interruption for them. The requirement applies to accounts created after
   this decision takes effect.
7. **Privacy.** The phone is personal data used only as account contact data. It never appears in
   logs, error reports, analytics payloads, audit event diffs or client bundles beyond the signed-in
   user's own form. No third party receives it.

---

## Consequences

### Positive

- New teachers provide a second contact channel without inventing an SMS or delivery capability.
- Better Auth tables remain untouched; the phone follows the person across workspaces.
- A non-unique phone cannot be used as an enumeration oracle or to take over another account.

### Negative

- A stored but unverified phone may be mistyped or belong to someone else; the product must not claim
  it is a verified identity or use it for account recovery.
- Social sign-in gains one extra step for first-time users.
- A new migration, a new table, a new server gate and bilingual copy are required.

### Neutral

- Existing teacher accounts are unaffected; the change is not retroactive.
- No new dependency, external provider or environment variable is introduced.

---

## Alternatives considered

- **Phone on the Better Auth `user` table via an additional field** — rejected: contradicts
  `DATA_MODEL.md` §5.1 and `ADR-0003`; would couple app-owned contact data to the auth library's
  schema.
- **Unique phone** — rejected: creates an account-existence oracle and a lockout risk from a typo,
  with no verification step to establish ownership.
- **SMS/OTP verification** — rejected: requires a new provider contract (`OQ-09`) and would invite a
  false "verified" claim if faked (`NF-1`, `NF-2`).
- **Phone optional for social accounts** — rejected: the product owner required it for all new
  accounts.

---

## Revisit when

- The product owner authorises an SMS/OTP provider and a verified-phone state, or asks to use the phone
  for account recovery.
- A legal or privacy review changes the minimisation decision for teacher contact data (`A-11`).
- Social-first accounts are asked to supply the phone during OAuth callback instead of before first
  app use.
