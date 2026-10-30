# ADR-0004: Tailwind v4 with Radix primitives and shadcn/ui patterns

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Engineering
- **Scope:** M0–M3
- **Serves:** `R-05` (RTL defects), `R-09` (dark mode must be reachable), `F-P0-05` (design system primitives)

## Context

The product needs a consistent, accessible, Arabic/RTL-aware interface that a small team can
extend quickly across roughly thirty screens, on a budget, without a design system hire. The
requirements also constrain styling in ways that rule out some common approaches: no fixed
left/right physical properties (the layout must flip for RTL), no hardcoded colours outside the
token layer, and both light and dark themes driven by tokens (`A-13`, `D-02`).

The core screens are dense data surfaces — a data table, a calendar, a drawer, a dialog, tabs, a
dropdown, a toast, a form, and a file list. These need accessible behaviour (focus management,
keyboard handling, ARIA wiring) that is easy to get subtly wrong by hand.

## Decision

Use **Tailwind CSS v4** (`tailwindcss` and `@tailwindcss/postcss` `4.3.3`) with **Radix UI**
primitives (`radix-ui` `1.8.1`) following the **shadcn/ui** component pattern.

- Tailwind v4 with the PostCSS plugin and CSS-first configuration. The `@theme` block in
  `globals.css` defines the design tokens; there is no `tailwind.config.js`.
- All colours, spacing, radii, and typography are declared as CSS custom properties in the token
  layer. Utilities reference the tokens, never raw hex values.
- Layout uses **CSS logical properties** exclusively: `ms-*`/`me-*` instead of `ml-*`/`mr-*`,
  `ps-*`/`pe-*` instead of `padding-left`/`padding-right`, `start-*`/`end-*` instead of
  `left-*`/`right-*`, and `text-align: start`. An ESLint rule bans physical direction properties
  outside a documented exception list. **[CI]**
- Dark mode is a token switch driven by a class or a media query at the root; components never
  branch on the theme.
- Components are copied into `src/components/ui/` rather than installed as a dependency, following
  the shadcn/ui pattern. They are ours to edit.
- Radix provides the accessibility primitives: dialog, dropdown, popover, tooltip, tabs, toast,
  checkbox, radio group, switch, select, and separator.
- Icons are inline SVGs from a single local icon module. No third-party icon font.

## Consequences

### Positive

- The token layer makes the light and dark themes and the RTL flip a single-source change.
- The physical-property ban removes the most common source of RTL bugs at the point of authoring.
- Radix ships the focus trap, the escape handling, the ARIA wiring, and the keyboard map for the
  interactive primitives, which is exactly the part that is tedious and error-prone to write.
- The shadcn/ui pattern gives accessible components without a design-system dependency to fight;
  components stay readable and locally editable.
- Tailwind v4's CSS-first configuration removes the JavaScript config file and its build step.

### Negative

- Copied components become our maintenance burden: an upstream accessibility fix must be applied
  manually.
- Tailwind v4 is newer, so tooling and editor integration are less battle-tested than v3.
- The ESLint ban on physical direction properties will surface false positives in third-party
  snippets and will need a documented exception list.
- Logical properties are less familiar than physical ones, so onboarding is slower.

### Neutral

- Component source lives in the repository, so a reviewer sees exactly what renders.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Tailwind v3** | Stable and familiar, but the CSS-first configuration of v4 is a real simplification and v4 is the current major with the same utility API. |
| **CSS Modules** | Fine, but it produces a parallel styling system and no token discipline across components; the shared-token requirement is harder to enforce. |
| **styled-components / Emotion** | Runtime CSS-in-JS adds a build and render cost, and the SSR integration with the App Router adds complexity. |
| **A component library with a fixed design (MUI, Chakra, Mantine)** | Faster initially, but each brings a styling system that fights Tailwind, has uneven RTL support, and imposes a design language the product does not want. Radix is unstyled and composes with our tokens. |
| **Building the primitives from scratch** | The focus management and ARIA details in a dialog or a combobox are exactly where custom implementations fail accessibility review. |
| **Bootstrap / Foundation** | Rejected: opinionated visuals, weak RTL story, and a legacy class system. |

## Revisit when

- The number of shadcn/ui components grows large enough that an in-house design system is
  warranted.
- A third-party shadcn/ui fork introduces a component with better accessibility than the copied
  version.
- The token layer can no longer express a required visual concept.
