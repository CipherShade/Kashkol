# ADR-0036: Two-step teacher sign-up with a separate payment page

- **Status:** Accepted (approved 2026-11-23)
- **Date:** 2026-11-23
- **Deciders:** Product owner (user direction) and engineering
- **Scope:** M0 / public self-signup, manual subscription pilot

## Context

Public self-signup was approved as an override to `RELEASE_PLAN.md` §3.4 and §3.5 and is recorded in
`docs/STATUS.md`. The sign-up screen currently renders two cards side by side: the account form and
the manual subscription payment instructions (InstaPay QR, handle, direct link, and note). The product
owner asked for the two parts to happen **after each other**: the teacher creates the account first,
then sees a dedicated payment page.

The subscription is a manual pilot. No gateway is called, no transfer is detected, and no account is
activated automatically (`NF-5`). Email verification remains a separate, server-enforced step when a
transport is configured (`F-P0-02`).

## Decision

Teacher registration has two sequential screens:

1. `/{locale}/sign-up` contains only the account form. On success the server action redirects to
   `/{locale}/subscribe?registered=1` (`&verify=1` when outbound email is configured).
2. `/{locale}/subscribe` contains the real InstaPay QR, handle, and direct payment link. It is public
   and carries no personal data. The `registered` and `verify` values are display hints only; they
   are never evidence of a payment or of account activation.

The payment instructions are one shared component used only by the payment step. The copy states that
Kashkol does not detect transfers and that the receipt is confirmed manually. No payment state is
written to the database by this flow, and no claim of activation is made on screen.

## Consequences

**Positive**

- The account form and the payment instructions no longer compete for attention on one screen.
- The destination is a pure, unit-tested helper, so the two-step sequence cannot drift silently.
- The copy no longer claims automatic activation that the system does not perform.

**Negative**

- Account creation and payment are now two page loads; a teacher may abandon after step one. The
  payment page therefore links back to sign-in and, when needed, to email verification.
- The payment page is public by design; it must stay free of personal data.

**Neutral**

- No schema, migration, permission, or route-registry change: the new page is an App Router page, not
  an API route.
- The existing `/app/payments` screen remains the teacher's manual student-payment ledger and is
  unrelated to this subscription step.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Keep both cards on sign-up and add a "Continue" button | It does not make the parts sequential; the teacher still sees the payment instructions before the account exists. |
| Redirect to `/app` or `/workspace/new` first | Workspace creation requires verification and a session; the owner asked for the payment page immediately after account creation. |
| Add a simulated payment confirmation | Directly prohibited by `NF-5`; no gateway or transfer-detection integration exists. |

## Revisit when

- A real billing provider is integrated (`F-P3-04`): the payment step must be replaced by the provider
  flow and a new ADR must supersede this one.
- The product owner asks for payment after verification or after workspace creation instead.
