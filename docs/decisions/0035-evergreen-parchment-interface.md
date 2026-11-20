# ADR-0035: Evergreen-and-parchment interface language

- **Status:** Accepted (approved 2026-11-21)
- **Date:** 2026-11-21
- **Deciders:** Engineering, on a product direction change supplied with a reference design
- **Supersedes:** The visual values of [ADR-0023](0023-interface-visual-refresh.md) — the near-black
  canvas, the blue `#4f6bf5` accent, the 86 px icon rail, the floating frame, and the
  Manrope-only type stack. The token architecture, the real light/dark swap, the logical-property
  rule, and the tested behaviour of every screen are unchanged.

## Context

ADR-0023 moved the interface to a near-black canvas with a compact icon rail and one blue accent.
A new reference (`stitch_kashkol_workspace_landing_page`, `DESIGN.md`) defines a different visual
language for the same product:

- a warm parchment canvas (`#F3F2EB`) with white cards and hairline dividers;
- a deep-evergreen brand anchor (`#153F2A`) with forest and leaf supports;
- Outfit for display and numerals, Hanken Grotesk for body, Cairo for Arabic;
- a 272 px labelled sidebar grouped into named suites, not an icon rail;
- 16 px inner radii nested inside 24–32 px outer radii, pill buttons and chips;
- ambient evergreen-tinted shadows instead of heavy elevation.

The reference also depicts capabilities Kashkol does not have: a live cashbox closing, an "AI radar"
with fabricated student counts, instant WhatsApp "delivery", demo names and money totals. Those are
reference-only. Adopting the visual language must not import them (`NF-1`–`NF-13`).

## Decision

The interface adopts the evergreen-and-parchment language in `src/styles/tokens.css`:

1. **Palette.** Parchment canvas, white surfaces, evergreen primary (`#153F2A`), forest hover
   (`#1C5223`), leaf success (`#2E7D32`), gold attention accent (`#C9A84C`), and the reference's
   rose/amber alert triads. Every colour is a token; no component hardcodes one.
2. **Typography.** Outfit for display and numeric metrics, Hanken Grotesk for body and interface
   text, Cairo for Arabic. Numeric tiles use tabular figures.
3. **Geometry.** 8–12 px for small controls, 16 px for inputs and nested panels, 24 px for cards,
   32 px for section shells, full pills for buttons, chips, and badges.
4. **Shell.** A 272 px labelled sidebar on the inline-start edge, grouped by `NAV_GROUPS`, with the
   workspace switcher, labelled links, and a footer profile area. The main column is the parchment
   canvas; the topbar is a white sticky bar with a hairline base.
5. **Depth.** Level-1 cards use a 1 px hairline plus the reference's diffuse evergreen shadow; hover
   lifts to the level-2 border and shadow. The backing scrim stays at the reference's 40 % ink.
6. **Dashboard composition.** A greeting panel, four truthful KPI tiles, then a 12-column split with
   the operational modules on the wide side and the supporting queues on the narrow side.

The dark theme is a deliberately derived counterpart of the same language: near-black evergreen
canvas, deep-green surfaces, light leaf text accents, and the same geometry. It is not a mechanical
inversion of the light palette.

## Consequences

**Positive**

- One coherent identity across every screen; the token layer means existing pages inherit it.
- The labelled sidebar makes the product's real module structure legible instead of hiding it
  behind hover tooltips.
- The palette and type stack are closer to the product's subject (Egyptian teachers, Arabic-first)
  than the neutral near-black canvas.

**Negative**

- The 272 px sidebar consumes horizontal space; below 980 px it becomes the existing drawer.
- Outfit and Hanken Grotesk are Latin-first; Arabic falls back to Cairo and must be verified for
  optical size and line-height on every dense table.
- Existing screenshots and visual baselines are stale.

**Neutral**

- No dependency, route, permission, schema, or business rule changes. This is a presentation
  decision only.
- The reference's cashbox, AI radar, delivery claims, and demo data are explicitly **not** adopted.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Keep ADR-0023 and change only the accent colour | Does not address the icon rail, the floating frame, or the typography the reference replaces. |
| Copy the reference markup and Tailwind config directly | The reference is a static prototype with fabricated data and features the product lacks; copying it would violate the no-fake rule and the token architecture. |
| Use the reference only for the dashboard | The shell and primitives are shared; a dashboard-only skin would produce two visual languages in one product. |
| Mechanical dark-mode inversion | Produces muddy greens and unreadable alert tints; dark surfaces need independent tuning. |

## Revisit when

- A later design direction supersedes the evergreen/parchment identity.
- Arabic readability testing on real screens shows the Outfit/Cairo pairing fails at body sizes.
- The product gains a genuinely different surface (for example a parent portal with its own brand),
  which needs its own scoped token set rather than a change to this one.
