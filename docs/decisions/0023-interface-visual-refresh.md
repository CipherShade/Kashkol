# ADR-0023: Interface visual refresh — the Kashkol canvas

- **Status:** Accepted (approved 2026-11-08)
- **Date:** 2026-11-08
- **Deciders:** Engineering, on a product direction change supplied with reference screens
- **Supersedes:** The visual values recorded in `PRODUCT_REQUIREMENTS.md` §2.1 and the typography
  rule in §2 (the 2022 green prototype palette and the Manrope/Fraunces/Cairo trio). The token
  architecture, the light/dark contract, and the logical-property rule are unchanged.

## Context

The interface shipped with a token set copied from `madar-teacher-prototype.html`: a warm
green-and-paper palette, three type families, and a 252 px labelled sidebar. The product direction
has changed. The supplied reference screens define a different visual language: a near-black (or
paper) canvas, floating rounded panels, a compact icon rail, large statistic cards with tinted
status variants, an inverted feature card, and a single confident blue accent.

The change is not cosmetic only. Two screens carried defects that the refresh must resolve:

- The students directory showed five KPI cards, one of which claimed an archived count that the
  repository returns as zero unless archived records are already in view. That number was not a
  truthful count of the archive.
- Several screens still used raw Tailwind colours (`indigo`, `emerald`, `amber`, `rose`) and
  undefined `--color-*` names, so the palette and dark mode were not actually token-driven.

The constraints are fixed: Arabic is the default and RTL must remain real (`NF-10`); every colour
resolves from a token (`F-P0-04` AC-3); no component may fake a value (`NF-1`); every screen keeps
its empty, loading, and error states (`F-P1-15`); and no dependency is added.

## Decision

1. **Replace the palette, keep the architecture.** `src/styles/tokens.css` now defines the Kashkol
   canvas: paper `#ECECE6` in light, near-black `#08080A` in dark, a separate `--panel` surface for
   the floating frame, a blue primary (`#4F6BF5` light / `#6D8BFF` dark), tinted success, warning,
   danger, accent, chart, avatar, and inverted-card tokens. The dark swap is still driven by
   `data-theme="dark"` plus a `prefers-color-scheme` fallback for the no-JavaScript case.

2. **One Latin family.** Manrope (400–800) is both the UI and display face. Cairo remains the
   Arabic face. Fraunces is removed from the font request and from the display token.

3. **Floating application frame.** The authenticated shell is a 16 px canvas gutter around an 86 px
   icon rail and a rounded main panel. Nav labels are visually hidden on the rail and exposed by
   tooltip; the accessible name stays on the link. Below 980 px the rail is replaced by the existing
   focus-trapped drawer with full labels. The frame is presentation only; navigation visibility is
   still computed from the server scope.

4. **Primitives carry the language.** Buttons become pills, cards use the larger radius, and the
   statistic card gains `tone`, `variant="invert"`, and an interactive mode that renders a real
   `<button>` with `aria-pressed`. The `--color-*` names used by older screens are kept as aliases
   that resolve through the live palette; there is still exactly one source of truth.

5. **Truthful screen composition.**
   - Dashboard: a hero header, four real statistics, a workspace fact list, a setup donut whose
     percentage is computed from the onboarding records, and the members table.
   - Students: four KPI **filter** buttons (total, active, at risk, inactive). Each percentage is
     computed from the records in view. The always-zero archived card is replaced by an explicit
     “Show archived” toggle, and the count of archived records is no longer claimed unless those
     records are in view.

6. **Theme parity is part of the change.** Every new surface has a light and a dark value; the
   viewport theme colour and the pre-paint script are aligned with the new canvas. Logical CSS
   properties remain mandatory.

## Consequences

Positive: one coherent visual system across the shell, dashboard, and directory; the palette and
dark mode are genuinely token-driven; the archived count stops over-claiming; the compact rail
returns horizontal space to the working area; and the compatibility aliases let the remaining
screens migrate without a flag day.

Negative: the compatibility alias layer is a second set of names to remove; the visual change is
large enough that every screen needs a light/dark, RTL/LTR, 320 px review before the M1 quality gate
(`F-P1-15`) can pass; and tooltips become a load-bearing affordance for the rail, so keyboard and
touch users depend on the accessible label rather than the visual label.

Neutral: the token architecture, theme persistence, locale routing, and component semantics are
unchanged. The reference prototype remains read-only and its defects (`DEF-01`–`DEF-23`) are not
copied.

## Alternatives considered

- **Keep the green palette and restyle layout only.** Rejected: the direction explicitly asks for
  the reference visual language, and the raw colour usage would remain.
- **Copy the prototype's CSS wholesale.** Rejected: the prototype contains the 23 catalogued
  defects, including the never-set `data-theme` and the fake statistics.
- **Ship a dark-only design.** Rejected: light and dark are both required (`A-13`, `F-P0-04`), and
  Arabic daytime use is a primary setting.
- **Introduce a component library or CSS-in-JS dependency.** Rejected: no dependency is justified
  by a visual refresh, and the existing Radix + CSS layers already cover the primitives.

## Revisit when

- The brand identity changes again, or a designer supplies a new reference set.
- A contrast audit finds body text below WCAG AA on any new surface.
- The last consumer of the `--color-*` alias layer is migrated; the aliases can then be deleted.
- The rail needs more than one level of navigation; the current rail is intentionally one level.

## Traceability

`PRODUCT_REQUIREMENTS.md` §2, §2.1, §12 (`NF-1`, `NF-10`); `F-P0-04` (theme), `F-P0-05` (design
primitives), `F-P1-01` (dashboard), `F-P1-02` (students), `F-P1-15` (quality gate); `DEF-13`
(theme never set).
