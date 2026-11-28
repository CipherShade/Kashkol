# ADR-0044: Teacher-platform landing reference with labelled sample visuals

- **Status:** Accepted (approved 2026-11-27)
- **Date:** 2026-11-27
- **Deciders:** Product owner (visual direction) and engineering (truthful implementation)
- **Scope:** M0 public landing page
- **Related:** `NF-1`, `NF-11`, `NF-12`, `ADR-0035`, `ADR-0036`, `ADR-0042`, `STATUS.md` § 5.16

> **Annotation (2026-11-27):** Superseded in part by `ADR-0045` and `ADR-0046`. The 249 EGP/month
> price was a fact when this decision was made; it is no longer current, and `/subscribe` has been
> removed. The landing now states that teacher accounts are free with unlimited students and that
> usage billing is 0.99 EGP per qualifying student per Cairo calendar month. **Annotation
> (2026-11-28):** `ADR-0051` refined qualification to two qualifying sessions inside a rolling
> 30-day period that includes the billed Cairo month; the per-month charge and the visual direction
> remain unchanged. The sample-data labelling below remains in force.

---

## Context

The product owner asked to align `/ar` and `/en` with the teacher-platform landing reference at
`stitch_kashkol_teacher_platform_landing_page` (`code.html` and `DESIGN.md`). That reference shows a
particular structure: a slim announcement strip, compact sticky navigation, a product illustration
beside the headline, problem and solution cards, a student-intelligence spotlight, four capability
pillars, onboarding steps, teacher personas, one price card, FAQs, and a final call to action.

The reference also contains claims the system cannot support: a 14-day trial, unlimited students,
daily WhatsApp support, a migration service, real student names and phone numbers, and automatic
delivery language. Publishing those would violate `NF-1` (no fabricated statistics), `NF-11` (no
placeholder capability), and `NF-12` (no seeded demo content presented as real). The single published
price of 249 EGP/month is different: it is already rendered by `/subscribe` from
`Auth.subscription.price` (`ADR-0036`), so it is a fact and may be repeated.
> Annotation (2026-11-27): superseded in part by `ADR-0045`/`ADR-0046`. This price is no longer a
> current fact; `/subscribe` is removed and sign-up goes to sign-in or email verification.

`ADR-0035` defines the token layer and RTL-first visual language. No new dependency is needed to
reproduce the reference: the mock panels are CSS and inline SVG built from existing tokens and
logical properties.

---

## Decision

1. **Adopt the reference structure and visual language.** The landing renders, in order:
   announcement, header, hero with product illustration, problems, solutions, intelligence
   spotlight, four pillars, three onboarding steps, four personas, one pricing card, four FAQs, and
   a final CTA. A small-screen fixed CTA repeats the published price only for signed-out visitors.
2. **Keep the truthful claims.** Every figure on a mock card is labelled as synthetic sample data in
   both locales. No trial, capacity, support-channel, migration, or delivery promise is published.
   The sample student has no phone number or other personal detail.
3. **Keep the real price and real routes.** The pricing card shows 249 EGP/month, states that payment
   is a manual InstaPay transfer confirmed by the Kashkol team, and links only to the existing
   `/sign-up`, `/sign-in`, and `/app` routes. No card charge or automatic activation is claimed.
   > Annotation (2026-11-27): superseded in part by `ADR-0045`/`ADR-0046`. The published price is now
   > 0.99 EGP per qualifying student per Cairo calendar month, with free and unlimited teacher
   > access; `/subscribe` is removed. No card charge or automatic detection is still claimed.
4. **Reuse the established design system.** `src/lib/landing/content.ts` owns the section registry;
   `messages/{ar,en}.json` own all visible strings; `src/styles/landing.css` gains a `landing-v2-*`
   layer built only from existing tokens, with no physical direction properties and no new package.
5. **Lock it with tests.** Unit tests assert section order, catalogue parity, sample-data labels,
   the 249 EGP price, the absence of rejected claims, and responsive CSS hooks.
   Annotation (2026-11-27): superseded in part by `ADR-0045`/`ADR-0046`; the current assertion is the
   0.99 EGP usage rate and the absence of subscription claims. Existing token
   contrast assertions continue to run unchanged.

---

## Consequences

**Positive**

- The page matches the requested structure without claiming a capability the system does not have.
- A visitor can tell at a glance that the workspace illustration is an example, not a real account.
- Arabic and English stay in parity, with correct direction, theme, empty-state and error behaviour
  inherited from the existing locale shell.
- No new dependency, no new route, and no change to tenant or finance code.

**Negative / trade-offs**

- The sample panels are CSS illustrations rather than captured product screens, so they show layout
  and labelless structure rather than a live navigation path.
- The compact reference layout reduces the space previously given to the challenge showcase and
  trust band. Those sections are replaced, not removed from the product.
- The landing stays `force-dynamic` because the header reads the session to choose the CTA.

**Neutral**

- `/ar` and `/en` remain the only indexable routes; `/{locale}/status` remains private (`ADR-0042`).
- Platform billing and workspace finance are untouched (`ADR-0036`).
  Annotation (2026-11-27): superseded in part by `ADR-0045`/`ADR-0046`; platform billing now has its
  own usage ledger, manual verification, and billing pages.

---

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Copy the reference text verbatim | It contains trial, capacity, support, migration and delivery claims that are not implemented and would break `NF-1` / `NF-11`. |
| Overwrite the existing uncommitted landing work | It would discard prior owner-requested truthfulness fixes without an explicit decision. |
| Use captured screenshots | The last captures showed a different release and were disabled as untruthful (`STATUS.md` § 5.16); no new truthful capture was supplied with this request. |
| Add a new CSS framework or icon dependency | The existing token layer and `Icon` component already cover the design; a dependency would need its own ADR and pin. |

---

## Revisit when

- The product owner supplies verified product screenshots or approves a new real price or plan.
- A support channel, migration service, or onboarding trial is actually implemented and documented.
- Legal review changes what may be promised publicly, or a new locale is added.
