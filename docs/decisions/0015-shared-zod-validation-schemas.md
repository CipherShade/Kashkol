# ADR-0015: Shared Zod validation schemas

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Engineering
- **Scope:** M0–M3
- **Serves:** `F-P1-02` (student input), `F-P1-03` (import parsing), `NF-13` (no silent data loss)

## Context

Input reaches the application from many directions: URL parameters, query strings, form bodies,
Server Action arguments, route handler payloads, file metadata, third-party webhook bodies, and
generated QR tokens. Every one of them must be validated before it reaches a service, and the
validation rules must be identical on the client and the server — otherwise the client validates
one shape and the server accepts another, and the error appears at the worst moment.

Two requirements constrain what happens to that input: `F-P1-03` requires a per-row validation
preview before an import commits, and `NF-13` forbids a silent partial failure. Both are only
achievable if input is validated at the boundary, before it reaches domain logic — which is also
the only place a bad value can still be rejected cheaply.

## Decision

Use **Zod `4.6.7`** as the single validation library, with schemas that are **shared between the
client and the server**.

- One schema per operation, defined once in the owning module, for example
  `src/modules/students/schemas.ts` exporting `createStudentSchema`.
- The schema is the contract for both the client form and the server handler. The client parses
  with it to produce inline field errors; the server parses with it to reject invalid input.
  **The client result is advisory; the server parse is authoritative.**
- The schema lives beside the module it belongs to, not in a global `schemas/` folder, so a schema
  is removed with its module.
- **The server never trusts a validated type from the client.** A Server Action takes an untrusted
  payload and re-parses it. TypeScript's type inference is erased at runtime, so the parse is what
  provides the guarantee.
- **Validation errors use a single envelope** (`ARCHITECTURE.md` §7) with field-level paths, so the
  client can map an error to an input and a server error to a message. The envelope never includes
  a stack trace or an internal message.
- **Schema-derived types.** The TypeScript type is inferred from the schema (`z.infer`), so the type
  and the runtime check cannot drift.
- **Shared schemas are exported through the module barrel**, so a consumer imports
  `@/modules/students` rather than reaching into the module's internals.
- **Additional rules:**
  - IDs are validated as UUIDs, never as arbitrary strings.
  - A date is validated and parsed to a `Date` at the boundary; the domain layer receives a `Date`,
    never a string it must parse.
  - A phone number is normalised to E.164-ish international form by a dedicated schema, so the
    normalisation happens in one place.
  - Numbers that cross the boundary use `z.coerce` deliberately and explicitly, not by accident.
  - Enum-like inputs are validated against a shared constant, so a client cannot send an unknown
    value.
- **Payload limits** are enforced at the boundary: a maximum request size, a maximum array length,
  and a maximum string length per field.
- **Third-party payloads** (webhooks) are validated by their own schemas, kept in a dedicated
  `src/modules/integrations/webhooks/` folder so an untrusted shape is isolated from the domain
  vocabulary.

## Consequences

### Positive

- One definition of each input shape, so the client and the server cannot disagree.
- Field-level validation errors come for free and drive consistent inline messages in Arabic and
  English.
- Runtime safety at every boundary, which TypeScript alone cannot provide.
- The schemas document the API surface in executable form.
- Because a schema is the contract, a change that breaks the contract fails the test suite rather
  than production.

### Negative

- Zod is a runtime dependency on the client as well as the server, which adds a small bundle cost.
  The client only imports the schemas it needs for its own form, and tree-shaking keeps the cost
  bounded.
- A Zod v4 upgrade is a breaking change and the pin must be handled deliberately (this ADR records
  the exact version for that reason).
- Complex schemas (refinements, cross-field checks) can be slower than a hand-written check, which
  matters only for large payloads.
- A shared schema is a shared coupling point: changing it changes the client and the server
  together, which is the intent, but it must be done deliberately.

### Neutral

- Validation is not authorisation. A schema that passes does not mean the action is permitted; the
  permission check is separate and server-side (ADR-0006, ADR-0012).

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **TypeScript types only** | Erased at runtime. Nothing stops a client from sending a different shape, and the failure appears as an undefined-value bug far from the cause. |
| **Valibot** | Genuinely good and tree-shakeable. Rejected because Zod's ecosystem and familiarity reduce the chance of a subtle mistake; both are acceptable, and the pin in this ADR exists so the choice is explicit. |
| **A bespoke validation layer** | Hand-written validators are a large surface for exactly the defects the library exists to prevent. |
| **Server-only validation** | The client would then have to duplicate the rules to show inline errors, and the two copies would drift. |
| **A schema-first OpenAPI tool** | Generates client and server code from a specification, which is attractive for a large public API. This product's surface is an internal UI plus a few endpoints, so the codegen cost is not justified yet. Revisit if an external API is added. |

## Revisit when

- A public or partner-facing API is added, and a specification-first workflow becomes worthwhile.
- The Zod major version changes and the migration cost is assessed.
- A file-upload or streaming path appears where a full schema parse is impractical.
