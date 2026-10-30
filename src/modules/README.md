# Feature modules

Each module is a vertical slice with a narrow public surface:

```
<module>/
  service.ts     use cases: authorise -> validate -> transact -> audit
  repository.ts  the only place module queries live; every function takes a Scope
  schemas.ts     Zod input schemas shared with the client
  queries.ts     read-only computed projections (no stored aggregates)
  audit.ts       the module's stable audit action keys and payload shapes
  types.ts       domain types that do not depend on Prisma
```

Rules, from `docs/ARCHITECTURE.md` §6.2:

- `app/` calls `service.ts`. It never imports `repository.ts` and never imports Prisma.
- `repository.ts` imports `src/lib/db/` and nothing else from the application.
- A module never imports another module's repository; cross-module work goes through the
  other module's service.
- `lib/` never imports `modules/`.
- Prisma is imported only in `src/lib/db/` and `src/modules/*/repository.ts`; ESLint enforces it.

The foundation ships `tenancy` only. `students`, `groups`, `scheduling`, `attendance`,
`homework`, `assessments`, `messaging`, `files`, `reporting`, `notifications`, `audit`, and
`platform` arrive with their milestones (`docs/ARCHITECTURE.md` §6.3).
