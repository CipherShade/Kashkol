# ADR-0030 — Google / Facebook social sign-in with explicit-only account linking

**Date:** 2026-11-15
**Status:** Accepted (approved 2026-11-15; implementation not live-verified; security-audited 2026-11-16)
**Related:** `F-P0-02` (adjacent — no requirement flow covers social sign-in; requested by the product owner), `NF-1`, `NF-8`, `NF-11`, `NF-12`, `ADR-0003`, `ADR-0006`

---

## Context

Email/password (Better Auth, `F-P0-02`, `ADR-0003`) has been the only sign-in method. The product
owner approved adding Google and Facebook OAuth so teachers can sign in faster, and asked for a
"Connected accounts" capability on the account page. No requirement flow covers social sign-in;
this ADR records the decision because it is expensive to reverse: linking two identities on one
account is a takeover-risk-shaped decision that a future engineer would otherwise re-derive from
the code.

The data belongs to minors and their families. Every "helpful" convenience that silently links an
OAuth identity into an existing email-matched account is an account-takeover shortcut, so the
design errs on the side of explicit, teacher-visible acts only.

---

## Decision

### 1. Scope

- Two providers: **Google** and **Facebook**. No other provider, no generic OAuth2 endpoint.
- No new dependency. Both providers are served by the pinned `better-auth@1.7.12` social-providers
  API. Email/password is unchanged.
- No credentials exist in this environment and none were invented. A provider is offered **only
  when both** of its variables are set (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, or the
  `FACEBOOK_*` pair). An empty value is rejected at startup rather than treated as "off".
- If a provider is not configured, the sign-in/sign-up button is not rendered and the server
  action refuses the provider. There is no simulated button, no disabled-but-clickable control
  (`NF-11`), and no claim that social sign-in works before it is exercised (`NF-1`).

### 2. Explicit-only account linking

`account.accountLinking` is

```ts
{ enabled: true, disableImplicitLinking: true, allowDifferentEmails: false, allowUnlinkingAll: false }
```

and `trustedProviders` is deliberately unset. Consequences, verified against the Better Auth
1.7.12 runtime:

- A social sign-in that matches an existing local account by email is **rejected**
  (`account_not_linked`) and lands on the sign-in page with a generic failure. It is never
  silently linked.
- A link succeeds only when performed **while authenticated**, via `linkSocial`, and only when the
  identity provider asserts a **verified email that exactly matches the account's email**.
- Linking is a sensitive account mutation: the session must be **fresh** (`session.freshAge`,
  12 hours). `better-auth@1.7.12` guards `/unlink-account` with its `freshSessionMiddleware` but
  guards `/link-social` with the plain `sessionMiddleware`, so the application's `hooks.before`
  applies the same `SESSION_NOT_FRESH` rejection to `/link-social`. The check lives on the Better
  Auth endpoint because the route is publicly reachable; the server action's staff-session check
  alone would be UI-only authorisation (`NF-8`).
- The IdP must report a verified email; an unverified or missing `email_verified` claim refuses
  the link.
- Unlinking removes an OAuth account row only from the authenticated account page, refuses the
  `credential` row (email/password must remain the recovery path), and refuses the last remaining
  account. Better Auth's own `allowUnlinkingAll: false` guard is the second line of defence.

### 3. Database-level backstop

Migration `20261115000000_social_auth_account_constraints` adds two unique indexes to the existing
`account` table: `(providerId, accountId)` (an OAuth identity is at most one account row) and
`(userId, providerId)` (a user holds at most one account per provider). No new table, no new
column. The pre-check verified zero duplicates; the live table held only `credential` rows.

### 4. Surface

- Sign-in and sign-up render "Continue with …" buttons only for configured providers, below the
  email/password form, with a generic failure marker on redirect back (`signInError=1`).
- The account page gains a "Connected accounts" section: the credential method is shown as
  non-removable primary, each linked social account shows its provider and link date and is
  disconnectable behind a confirmation dialog, and a list-load failure shows an honest error, never
  a fake empty list.
- Link attempts round-trip through Better Auth's state store; the account page reports success
  (`linked=1`/`unlinked=1`) or a generic failure (`linkError=1`), with `SOCIAL_ACCOUNT_ALREADY_
  LINKED` surfaced distinctly.

### 5. Staff-only, like every other account mutation

`linkSocialAction`/`unlinkSocialAction` require the staff session and an origin guard. The
account page stays behind the teacher-shell guard. Backend authorization is enforced regardless of
what the UI shows (`NF-8`).

---

## Consequences

**Positive**

- Teachers can sign in with the account they already use at the platform they know, without
  touching the password policy or the reset flow.
- The takeover-shaped failure mode ("someone with a Google account for a victim's email walks into
  the victim's Kashkol") is closed by construction, twice (runtime + unique indexes).
- Removing a social account can never orphan a teacher without a sign-in path, and can never
  affect the password they use for recovery and verification flows.
- A stolen session older than 12 hours cannot add an attacker-controlled sign-in method, because
  linking enforces the same freshness rule as unlinking.
- Zero new dependencies; the change is additive and reversible (remove the variables and the
  buttons disappear).

**Negative / trade-offs**

- The same-email rule is strict: a teacher whose Google email differs from their account email
  cannot link it. Acceptable: mixing emails silently would violate explicit-only linking, and
  `allowDifferentEmails` doubles the attack surface.
- With `trustedProviders` unset, linking requires an IdP-verified email even if Better Auth would
  otherwise honour a trusted provider; marginally more friction for users whose IdP does not
  report `email_verified` (e.g. some Workspace configurations). They keep email/password.
- Social sign-in cannot be claimed to work until an operator creates real OAuth apps and the flow
  is verified end-to-end; this ADR and the release notes record it as **not live-verified**.

**Neutral**

- The social feature is invisible in every environment that lacks credentials, including CI and the
  local default.
- Enrollment of OAuth-first users (a teacher with no password ever) is possible: Better Auth
  creates a user row with no credential row. Such an account can later gain a password only
  through the existing reset flow, which needs SMTP — a known operational dependency, not a new one.

---

## Alternatives considered

1. **Implicit linking of trusted providers (`trustedProviders: ["google", "facebook"]`).**
   Rejected: Better Auth performs implicit linking with the IdP's `email_verified` claim as the
   only proof, which invites the classic takeover when an IdP tolerates unverified emails or an
   attacker controls a Workspace domain. Explicit linking keeps the teacher's act visible and
   auditable.
2. **`disableImplicitLinking: false`.** Rejected: silent linking contradicts the requirement that
   state be explicit and teacher-visible (`NF-12`).
3. **Passwordless social-only (disable email/password).** Rejected: breaks the recovery path for
   accounts whose IdP drops `email_verified`, and the spec (`F-P0-02`) treats email/password as the
   mandated baseline.
4. **Apple / X / a generic OIDC provider.** Rejected for this phase: two providers were approved.
   The mechanism is provider-agnostic; a third provider is a new `socialProviderSchema` member plus
   an env pair.
5. **`allowDifferentEmails: true`.** Rejected: the link email must match the account email exactly.
   Different-email linking is exactly the confused-deputy case this ADR exists to close.

---

## Revisit when

- Google or Facebook drops the `email_verified` claim, or the legal review of minors' data (§9,
  privacy register) requires the parent's consent or the teacher's verification of the IdP
  identity before linking.
- A workspace owner must restrict which social providers their workspace may use (tenant-level
  provider policy).
- A third provider is requested by the beta cohort.
- The product introduces OAuth-first onboarding without a verified email step, at which point
  `requireLocalEmailVerified` and the reset/SMTP dependency need re-examining.

---

## Implementation checklist

- [x] Migration `20261115000000_social_auth_account_constraints` — unique indexes on `account`
      (applied; pre-check found zero duplicates).
- [x] `socialProviderConfig` pins callback URLs; providers registered via conditional spread of raw
      options; no factory results, no provider without both credentials (`src/lib/auth/auth-options.ts`).
- [x] `account.accountLinking` installed with the policy above (`src/lib/auth/auth-options.ts`).
- [x] Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`
      (optional, min 1; empty rejected at startup) (`src/lib/config/env.ts`).
- [x] Server actions `signInSocialAction`, `linkSocialAction`, `unlinkSocialAction` (origin guard,
      staff session for link/unlink, credential/last-account refusal, `SESSION_NOT_FRESH` mapping).
- [x] `/link-social` freshness enforced at the Better Auth endpoint (`hooks.before`, same 12-hour
      `freshAge` as `/unlink-account`); stale link attempts land on `?error=reauthRequired`.
- [x] Sign-up never auto-signs-in, so the registration response is identical for a new and an
      existing email in every environment (`SECURITY_AND_PRIVACY.md` §3.1).
- [x] Sign-in / sign-up screens offer only configured providers; account page "Connected accounts"
      section; disconnect behind confirmation; honest load-failure state.
- [x] Arabic and English catalogues extended in parity (2044 keys each).
- [x] Unit tests `tests/unit/social-auth.test.ts` (provider on/off, URL pinning, policy, env
      parsing, schema validation).
- [x] `docs/ENVIRONMENT.md` §"Social providers" (callback URLs, setup), `.env.example` stubs,
      `docs/DATA_MODEL.md` (unique indexes, migration sequence), `docs/STATUS.md` §5.21.
- [ ] Create real Google/Facebook apps, set credentials, and exercise the full flow (sign-in,
      sign-up, link, unlink) against live providers — **blocked on credentials; nothing is claimed
      until this is done.**
