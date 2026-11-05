# Phase 1 — Calendar Foundation Proposal

## Packages
```
@fullcalendar/react @fullcalendar/core @fullcalendar/daygrid
@fullcalendar/timegrid @fullcalendar/list @fullcalendar/interaction
temporal-polyfill
```

## Architecture
- `FullCalendar` component (from `@fullcalendar/react`) renders Day / Week / Month / Agenda.
- Existing `CalendarGrid` reused as fallback/mobile layout, not forced into FullCalendar.
- Events fed from existing `/api/sessions` (no new DB model).
- Session cards redesigned using `CalendarEventCard` (premium green/amber top strips, dark/light surfaces).
- Design tokens from `src/styles/tokens.css` applied via custom FullCalendar CSS overrides.

## Files Modified (Phase 1 only)
- `docs/calendar-phase-plan.md` (this file)
- `src/components/calendar/calendar-view.tsx` — replaced with FullCalendar wrapper
- `src/components/ui/calendar-grid.tsx` — kept for reference / mobile fallback
- `src/styles/ui.css` — FullCalendar CSS overrides (dark/light, green accents, rounded cards)
- `messages/en.json` + `ar.json` — new calendar labels if needed

## Files Not Modified (Phase 1)
- `src/app/api/sessions/*` (existing, used as-is)
- `src/modules/sessions/*` (business logic unchanged)
- No drag/drop or conflict logic yet (Phase 2/3)

## Test Plan (Phase 1)
1. Render all 4 views (day, week, month, agenda).
2. Verify existing sessions display with correct times.
3. Verify Arabic RTL (labels, direction) and English LTR.
4. Verify dark (`#131316` chrome) and light (`#F3F2EB` bg) themes render correctly.
5. Confirm `CalendarEventCard` top-strip colors match group colors.
