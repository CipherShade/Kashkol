# ADR-0031 — Active workspace as a session-activity pointer

**Date:** 2026-11-17
**Status:** Accepted (approved 2026-11-17)
**Related:** `F-P2-08`, `OQ-16`, `ADR-0003`, `ADR-0006`, `NF-1`, `NF-8`, `NF-11`

---

## Context

`OQ-16` selects multi-workspace membership for P2+. In P1 a teacher owns exactly one workspace, so
the active workspace was implicit: the session resolved the user's only active membership. With two
memberships the same resolution returns two candidates, and an implicit choice would be
non-deterministic and could show one business's students to a teacher who believes they are in the
other.

Three constraints shape the decision:

- The workspace id must never be taken from a URL, a body field, or a client header (`ADR-0006`).
- A stale or forged pointer must fail closed, not widen access.
- Every switch must be auditable in the same transaction as the state change (`NF-1`, `ADR-0014`).

---

## Decision

1. The active workspace is stored as `session_activity.active_workspace_id` — a nullable UUID on the
   existing identity-support table — not on the Better Auth-owned `session` table. Better Auth's
   session schema stays untouched, so upgrades cannot overwrite application state.
2. `resolveActiveMembership` selects the pointer's workspace only when the user still holds an
   active membership there. Otherwise it falls back deterministically to the earliest active
   membership by joined date, then id. A pointer to a workspace the user cannot enter is ignored;
   it is never used as a scope.
3. `POST /api/workspace/switch` accepts only a target workspace id. The server validates the
   session, reads the user's memberships with the user-scoped SELECT policy, and rechecks the target
   inside a transaction scoped to that target. The pointer write and `workspace.switched` audit row
   commit together. The client performs a full document reload after success so no mounted
   component retains workspace-scoped state.
4. Creating a workspace or accepting an invitation no longer rejects an account that already has
   an active membership elsewhere. When a verified session is supplied, the newly entered workspace
   becomes active and the same switch audit is written in that workspace's transaction.
5. No workspace id is trusted from the client as a scope. The target id is a candidate; the scoped
   membership check is the authority. A missing target and a forbidden target produce the same
   `404` body.

---

## Consequences

**Positive**

- The sidebar can name the active workspace and offer an explicit switcher, satisfying `F-P2-08`
  AC-1 without weakening tenant isolation.
- A stale pointer never denies service: it falls back to a membership the user actually holds.
- A switch is atomic with its audit event and is recorded in the destination workspace.
- Client state cannot bleed between workspaces because the app reloads after a switch.

**Negative**

- The pointer is a second source of truth beside memberships. It must be validated on every read;
  the fallback rule is the mitigation, not an optional optimisation.
- A full reload is heavier than an in-place state update. It is chosen deliberately because the
  codebase has no shared client cache invalidation layer; a partial reset would risk stale state.

**Neutral**

- P1 behaviour is unchanged: one active membership means the fallback and the pointer resolve to the
  same workspace.

---

## Alternatives considered

- **Store `activeWorkspaceId` on the Better Auth `session` row.** Rejected: the adapter owns that
  table and a library migration could drop an application column. `session_activity` already exists
  for app-owned session state.
- **Derive the active workspace from the last visited URL or a cookie.** Rejected: client-controlled
  input must not become a scope (`NF-8`).
- **Keep one workspace per account forever.** Rejected by `OQ-16` for P2+; it cannot serve the
  two-business teacher in `F-P2-08`.
- **In-place client state reset after switching.** Rejected: workspace data lives in component
  state across the shell, so a partial reset cannot prove no data bleed.

---

## Revisit when

- A shared client cache with workspace-keyed invalidation is introduced; then a targeted reset may
  replace the full reload.
- Better Auth gains a supported, versioned extension field for application session data and the
  project pins that version.
- A product decision reverses `OQ-16` and returns to one workspace per account.
