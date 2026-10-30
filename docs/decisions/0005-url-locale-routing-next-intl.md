# ADR-0005: URL-prefixed locales with next-intl

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Engineering
- **Scope:** M0–M3
- **Serves:** `R-05` (RTL defects), `R-07` (date and timezone bugs), `A-03` (workspace timezone)

## Context

The product is Arabic-first, with English required as a second language. Every screen must exist in
both languages, the layout must work right-to-left and left-to-right, and dates, numbers, currency,
and phone numbers must be formatted per locale.

Two routing strategies exist:

- **Locale in the URL** (`/ar/attendance`, `/en/attendance`) — the locale is part of the resource
  identity.
- **Locale in a cookie or the `Accept-Language` header** — the URL is locale-agnostic.

The teacher may share a link to a screen with a parent or a colleague. The portal and the
notification links must open in a predictable language.

## Decision

Use **URL-prefixed locales** with **next-intl `4.14.9`**.

- Every route is prefixed: `/ar/...` and `/en/...`. The default locale is `/ar`.
- The locale is stored in the URL, not in a cookie, so a shared link carries the language.
- `next-intl` provides the message catalogue, the `useTranslations` hook, the server-side
  `getTranslations`, and the middleware/proxy integration.
- Message catalogues live in `messages/ar.json` and `messages/en.json`. Keys are namespaced by
  module (`students.list.title`) and are validated by a type-checked message descriptor, so a
  missing translation is a **build error**, not a runtime fallback.
- The locale is read in `src/proxy.ts` and applied to the request; `src/proxy.ts` is the Next.js 16
  successor to `middleware.ts`.
- Formatting uses `Intl` via `next-intl`: `Intl.DateTimeFormat`, `Intl.NumberFormat`, and
  `Intl.RelativeTimeFormat`. The Egyptian locale is `ar-EG`; the currency is EGP.
- Dates are stored in UTC as `timestamptz` and rendered in the teacher's configured timezone
  (`Africa/Cairo` by default).
- Timezone handling: the browser's timezone is only a display preference; all business rules use the
  workspace timezone so a teacher's "today" is stable regardless of where the teacher is.

## Consequences

### Positive

- A shared link opens in the intended language, which matters for links sent to parents.
- The locale is explicit and cacheable per URL, and each language can have its own SEO metadata.
- Missing translations fail the build rather than appearing as a raw key.
- `Intl` formatting gives correct Arabic-Indic or Latin digits, Arabic date order, and Eastern
  Arabic numerals according to the locale.
- Server Components can translate during the render, so there is no client-side flash of untranslated
  content.

### Negative

- Every internal link must include the locale prefix. Forgetting it produces a redirect and a
  lost locale — a common source of bugs.
- Every route is duplicated across two locale trees, which doubles the route surface.
- `next-intl` adds middleware/proxy wiring and a message-catalogue loading step to the build.
- The Arabic message catalogue is the bigger translation job; English can lag behind, so the build
  check must be configured to fail on a missing key in either locale.

### Neutral

- The locale is a presentation concern. The database stores no locale; the workspace stores a
  preferred locale as a preference only.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Cookie / `Accept-Language` locale** | The URL no longer identifies the language, so a shared link may open in the recipient's language rather than the sender's. It also complicates caching and makes the locale invisible to the user. |
| **Separate deployments per locale** | Duplicates the application, the database handling, and the deployment pipeline for a difference that is entirely presentational. |
| **`next-intl` in cookie mode** | Supported by the library, but rejected for the shared-link reason above. |
| **A custom i18n solution** | Hand-rolled catalogues, interpolation, and pluralisation are a common source of defects, and the requirement set (Arabic, English, RTL, formatting) is exactly what a specialised library covers. |

## Revisit when

- A third locale with different script direction is added — the layout is already direction-aware,
  but the token layer and the message catalogue would need review.
- Translation management requires a hosted platform (for example a translation vendor or a
  crowdsourced workflow) — that is a tooling change, not a strategy change.
