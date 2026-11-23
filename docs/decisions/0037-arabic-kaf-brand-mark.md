# ADR-0037: Arabic ك brand mark and theme-aware icon

- **Status:** Accepted (approved 2026-11-23)
- **Date:** 2026-11-23
- **Deciders:** Product owner (user direction) and engineering
- **Scope:** M0 / shared UI and PWA identity

## Context

The identity used a Latin `K`-shaped monogram in the landing header and a generic target glyph in the
auth and app shells. The favicon and PWA icons used a document motif, so the installed icon did not
match the wordmark. The product owner asked for one Kashkol mark: the same rounded-frame shape, but
with the Arabic letter **ك** instead of the Latin `K`, and with that mark used as the app icon.
The interface is Arabic-first with English as a required second language (`F-P0-03`), and every
surface must work in light and dark themes (`F-P0-04`, `NF-10`).

## Decision

The shared `BrandMark` renders ك as a vector path inside the existing rounded frame.

1. The glyph is an outline converted from an Arabic-capable system font, so no browser has to shape
   or substitute a font at runtime.
2. The inline SVG paints with `currentColor`. The surrounding token (`--primary`,
   `--primary-contrast`) supplies the light and dark variants; there are no duplicated light/dark
   assets and no theme flash.
3. Landing header, auth layout, portal sign-in, workspace creation, and the app sidebar all use the
   same component.
4. The favicon (`/icon.svg`) and the PWA/Apple touch icons keep the rounded-square language, use the
   evergreen palette from ADR-0035, and carry the same ك path.

## Consequences

**Positive**

- One recognisable mark across the browser tab, installed PWA, and every screen.
- The glyph is identical in both locales and independent of the user's installed fonts.
- Theme changes require no extra request or image swap.

**Negative**

- The raster PWA icons are committed binaries and must be regenerated if the palette changes.
- The outline comes from a system font and is fixed; optical refinements require editing the path.

**Neutral**

- No dependency, schema, route, or permission change.
- The Latin wordmark "Kashkol" in the wordmark text is unchanged; only the monogram is Arabic.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| SVG `<text>` containing ك | Depends on the browser's Arabic font and can render differently or fall back to tofu in icons. |
| Two separate light/dark image files swapped in the DOM | Extra requests, a possible flash on theme change, and two assets that can drift apart. |
| Keep the Latin `K` in the monogram | Explicitly rejected by the product owner; the product is Arabic-first. |

## Revisit when

- A licensed brand typeface is supplied: replace the outline and regenerate the raster icons in the
  same change.
- The palette in `tokens.css` is superseded by a new accepted visual ADR.
