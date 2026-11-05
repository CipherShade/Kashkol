# Kashkol Design System

Status: established (foundation only; not every page redesigned).

## 1. Brand
- Primary green: `#1C5223` (deep emerald, premium).
- Secondary accent: gold/amber `#C9A84C` (elegant, not loud).
- Ink: near-black `#111` light / `#EAEAEA` dark.
- Font display: Fraunces (serif) for headings; Manrope (sans) for UI; Cairo for Arabic.

## 2. Tokens (updated in `src/styles/tokens.css`)
- Light: `--bg` refined to `#F3F2EB`; `--surface` to `#FAFAF7`; `--surface-2` to `#EFEFEA`; `--ink` `#1A1814`.
- Dark premium: `--bg` `#131316`; `--surface` `#18181C`; `--surface-2` `#1C1C21`; `--ink` `#F2EFE9`.
- Primary: `#1C5223` (light and dark), `--primary-strong` `#16491A`, `--primary-tint` `#EAF1EB`.
- Border: `#D8D6CC` light, `#2D2D32` dark; `--border-strong`: `#B8B6AC` / `#38383D`.
- Radius: `--radius-md` 12px; `--radius-lg` 18px; pill 999px.
- Shadows: softer, premium (`shadow-md` 0 12px 40px rgba(0,0,0,0.10)).

## 3. Component updates (not full redesign)
- `button`, `card`, `dialog`, `form`/`input` — updated via CSS token references (no logic change).
- Sidebar / chrome: dark surface `#131316` with subtle `#2D2D32` border; active item gets `--primary` green dot and soft tint background (`--primary-tint`).
- Cards: `#18181C` surface, `border: 1px solid #2D2D32`, `radius-lg` 18px, minimal shadow (edge-defined, not float-heavy).
- Calendar/event cards: `CalendarEventCard` component (colored top-strip `#1C5223` or `#C9A84C`), `CalendarTimeGrid` component (vertical `#2D2D32` divisions, multi-column weekly layout).
- Metric badges: small circle `#1C5223` + white number, no border.
- Transitions: `transition-all duration-200 ease-out` on interactive surfaces.
- Iconography standardized to `Icon` component with consistent 16/18 sizes; directional flip preserved for RTL.
- Responsive layouts preserved; logical properties maintained for Arabic.

## 4. Themes & locales
- Light / dark via `data-theme`.
- Arabic RTL via `:root[lang="ar"]` (font and logical properties kept).
- Contrast verified: primary green on white (AA), dark text on light surfaces, light text on dark surfaces.

## 5. No business logic changed
- Attendance, notifications, messaging, portal services untouched.
- Design changes are purely visual/token-level.

## 6. Inconsistencies found (prior)
- Primary green was `#1f4c4a` (teal); standardized to `#1C5223`.
- Dark surfaces varied (`#14171a` vs `#1c2023`); unified to deeper charcoal.
- Shadow intensity inconsistent; unified via `shadow-color` / `shadow-color-strong`.
- Button sizes mapped inconsistently (`xs` mapped to `sm`); preserved mapping for compatibility.

## 7. Next (not in this task)
- Full page redesign (dashboard, calendar, session views) requires separate milestone.
- Calendar multi-column grid and analytics cards can draw from this token base.
