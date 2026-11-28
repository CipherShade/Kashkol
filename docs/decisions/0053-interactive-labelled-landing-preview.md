# ADR-0053: Interactive labelled landing preview

- **Status:** Accepted (product-owner request, 2026-11-28)
- **Date:** 2026-11-28
- **Deciders:** Product owner (interaction request) and engineering (truthful implementation)
- **Scope:** M0 public landing page
- **Related:** `NF-1`, `NF-11`, `NF-12`, `ADR-0044`, `STATUS.md` § 5.16 and § 5.33

> This decision supersedes `ADR-0044` only where it describes the hero as a static CSS illustration.
> The sample-data labelling, token layer, section order, and rejection of stale captured screenshots
> remain in force.

---

## Context

The landing hero currently shows a CSS-built product illustration. `ADR-0044` chose it because the
only captured PNG workspace screenshots (`public/landing/workspace-ar.png` and
`public/landing/workspace-en.png`) showed M2 UI that was not truthful for the current release, so
`STATUS.md` § 5.16 disabled them. No verified replacement capture was supplied.

The product owner asked to make the landing "screenshots" interactive. Re-enabling the stale PNGs
would claim a capability and a UI state the current build does not have (`NF-1`, `NF-12`). Adding
clickable shortcuts into the private app would imply that a signed-out visitor can open a real
workspace (`NF-11`). The interaction therefore has to stay inside an explicitly labelled demo.

---

## Decision

1. **Replace the static hero illustration with a client-side interactive demo.** The demo exposes
   three labelled sample screens: overview, attendance, and sessions. Tabs are real buttons with
   `role="tab"` / `role="tabpanel"` semantics and keyboard navigation.
2. **Keep every value synthetic and computed.** The roster contains three sample students with no
   personal details. Changing a status recomputes the displayed sample count and rate in the same
   component. The overview no longer displays the old fixed `94.8%` figure. No figure is presented
   as a real teacher record.
3. **Do not claim persistence or delivery.** The visible copy states that the controls change only
   the preview and that nothing is saved. There is no API call, no database write, no audit event,
   no SMS, no WhatsApp message, and no navigation into the private app from the demo controls.
4. **Keep the stale PNG captures disabled.** They remain in the repository only as historical
   artifacts. They are not rendered and are not linked from the landing page until a verified M1+
   capture is supplied and reviewed.
5. **Preserve the locale and token rules.** All strings come from `messages/{ar,en}.json`. The
   component uses the existing `Icon` primitives and token-based CSS with logical properties. No
   dependency, route, permission, or environment variable is added.

---

## Consequences

**Positive**

- The hero demonstrates navigation and attendance state changes without pretending to open a real
  workspace.
- A visitor can see that the numbers react to the demo input, which makes the sample-data label
  clearer rather than weaker.
- Arabic and English stay in parity; RTL/LTR and light/dark inherit the existing landing shell.
- Unit tests cover the pure attendance calculation and UI tests cover the accessible controls and
  the shipped catalogue strings.

**Negative / trade-offs**

- The interaction is a local illustration, not a live product walkthrough. It cannot show a real
  saved record or a real cross-route navigation path.
- The three sample screens are a subset of the product; feature cards and the intelligence spotlight
  remain labelled static previews in this change.
- Supporting keyboard tab semantics adds a small amount of client state to a page that was
  previously server-rendered, but the page remains `force-dynamic` for the session-aware header.

**Neutral**

- No database migration, route registry entry, or permission matrix change is needed.
- The disabled PNG captures and the existing feature/intelligence sample labels are unchanged.

---

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Re-enable `workspace-ar.png` / `workspace-en.png` | They show a different release and were disabled as untruthful (`STATUS.md` § 5.16). |
| Render the PNGs with clickable hotspots | Hotspots would still point at stale UI and would imply navigation the public visitor cannot perform. |
| Link the demo controls to `/app` or a sign-up form | The visitor is not authenticated; the link would fake access or mix a marketing demo with account creation. |
| Add a carousel library | The existing React state, tokens, and `Icon` component are sufficient; a dependency would need its own ADR and pin. |

---

## Revisit when

- A verified product screenshot from the current release is supplied and reviewed.
- The product owner approves an authenticated, read-only public demo backed by real records.
- The feature and intelligence previews are also approved for interactive state.
