# Kashkol — Integrations

**Status:** Draft v0.1 · **Date:** 2026-10-21 · **Owner:** Engineering
**Companions:** `ARCHITECTURE.md`, `DATA_MODEL.md`, `SECURITY_AND_PRIVACY.md`

> Integration means *an external system the application depends on*. Every integration in Kashkol is
> reachable through a **server-side adapter** with an explicit contract, because each one is either
> unavailable, slow, rate-limited, or changeable. The product's promise — "the teacher always knows
> the truth" — means a failed integration may degrade a feature but may never corrupt data or
> silently lie.

---

## 1. Integration principles

| # | Principle | Why |
|---|---|---|
| I-1 | **No integration is called directly from a route or component.** Routes call a service; a service calls an adapter. | One place to add a retry, a timeout, a circuit breaker, or a fake. |
| I-2 | **Every adapter is an interface plus one real implementation plus one in-memory fake.** The fake is used by tests and by local development without any credential. | Deterministic tests; no shared sandbox accounts. |
| I-3 | **Every outbound call has a timeout, a retry policy, and a defined failure state.** A hanging call must not hold a database transaction open. | `NF-13` (no silent data loss); no transaction may span a network call (ADR-0008). |
| I-4 | **Integrations never own business data.** Their payload lives in our tables; their identifier is stored as a reference. | We can rebuild, retry, or replace an integration. |
| I-5 | **PII is minimised in outbound payloads.** A third party receives the minimum needed for its job, and the payload is documented per integration. | `F-P0-08` AC-1, `A-11`. |
| I-6 | **Everything is server-side.** No third-party credential or secret is ever exposed to a browser. | `F-P0-02` AC-10. |
| I-7 | **Vendor failure is visible.** A feature that depends on a failing integration degrades explicitly in the UI and in the health checks. | `NF-11`, `NF-13`. |
| I-8 | **The provider can be swapped** by implementing the interface and changing one factory binding. | No lock-in; the ADR for each provider records the alternatives. |

### 1.1 Package versioning policy

Core runtime packages are pinned to a verified version (see `ARCHITECTURE.md` §3). Integration
packages that are **not** yet selected are deliberately left unpinned in the M0 milestone and must
be pinned by an ADR before the milestone that uses them is closed:

| Package area | Pinned? | Pin by |
|---|---|---|
| `next`, `react`, `typescript`, `node` | Yes — exact | `ARCHITECTURE.md` §3 |
| `prisma`, `@prisma/client`, `@prisma/adapter-pg` | Yes — `7.10.1` | ADR-0002 |
| `better-auth`, `@better-auth/prisma-adapter` | Yes — `1.7.12` | ADR-0003 |
| `tailwindcss`, `@tailwindcss/postcss` | Yes — `4.3.3` | ADR-0004 |
| `radix-ui` | Yes — `1.8.1` | ADR-0004 |
| `next-intl` | Yes — `4.14.9` | ADR-0005 |
| `zod` | Yes — `4.6.7` | ADR-0015 |
| `vitest` | Yes — `5.0.5` | ADR-0012 |
| `@aws-sdk/client-s3` | Yes — `3.1155.0` | ADR-0009 |
| `@aws-sdk/s3-request-presigner` | Yes — `3.1155.0` | ADR-0017 |
| Email provider client | **No** | ADR, before M1 |
| ClamAV `clamd` protocol | No SDK | ADR-0017 |
| Logger / error tracker SDK | **No** | ADR, before M0 close |
| PDF renderer | **No** | ADR, before M1 |
| `exceljs` | Yes — `4.4.0` | ADR-0016 |
| Playwright / axe (E2E) | **No** | ADR, before M0 close |
| Scheduling | **No** — no package; the app's own worker loop | ADR-0008 |

**Rule.** Adding an unpinned dependency to `package.json` is allowed during M0 **only** with a
matching ADR stub in `docs/decisions/` and an entry in the table above. A dependency with no ADR
entry fails the dependency-policy CI check. **[CI]**

---

## 2. Integration inventory

| # | Integration | Kind | Needed by | Failure impact |
|---|---|---|---|---|
| IN-1 | PostgreSQL | Datastore | M0 | Fatal |
| IN-2 | Object storage (S3-compatible) | Blob store | M1 | File features unavailable; the rest works |
| IN-3 | Antivirus scanner | Security service | M1 | Files stay `pending`; downloads blocked |
| IN-4 | Email delivery | Transactional email | M0 | Invitations, verification, and reset links are delayed |
| IN-5 | WhatsApp | **None** — a client-side deep link only | M2 | The deep link still opens WhatsApp; no server contact |
| IN-6 | QR / token service | Internal (not third-party) | M2 | — |
| IN-7 | Railway (hosting, DB, secrets, cron) | Platform | M0 | Fatal |
| IN-8 | Observability (logs, errors, metrics) | Platform | M0 | Degraded diagnosis, not a user-facing failure |
| IN-9 | Payments (Kashier / PayMob / Fawry) | Payment gateway | P3 | Deferred |

---

## 3. Adapter contract pattern

Every adapter follows the same shape, defined in `src/modules/<module>/adapters/`:

```ts
export interface EmailAdapter {
  send(message: OutboundEmail): Promise<SendResult>;
}

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: "temporary" | "permanent"; message: string };
```

Rules encoded in the type:

- A **permanent** failure is never retried (invalid address, blocked domain, suppressed recipient).
- A **temporary** failure is retried with exponential backoff and a cap.
- The provider's identifier is stored on our row so a support question can be answered.
- The adapter returns data; it never throws for an expected failure. Unexpected exceptions are
  caught by the caller, which records a `failed` state with a sanitised reason.

The **fake** implementation lives beside it and is deterministic:

```ts
export const fakeEmailAdapter: EmailAdapter = {
  async send(message) {
    fakeOutbox.push(message);
    return { ok: true, providerMessageId: `fake_${message.id}` };
  },
};
```

The fake is selected by an environment check inside one factory module, so no call site ever
branches on "are we in tests?".

---

## 4. IN-1 — PostgreSQL

| Aspect | Decision |
|---|---|
| Provider | Railway managed PostgreSQL in M0; the app uses only the PostgreSQL wire protocol |
| Driver | `pg` through `@prisma/adapter-pg` (Prisma 7 requires an explicit driver adapter) |
| Prisma client | Generated into `src/generated/prisma` with the `prisma-client` generator and an explicit `output` |
| Migrations | `prisma migrate deploy` at release time, `prisma migrate dev` locally; the schema is never pushed directly |
| Pooling | A pooled URL for the app; a direct URL for migrations |
| Tenant isolation | PostgreSQL RLS with `FORCE ROW LEVEL SECURITY`; the tenant role is not the table owner |
| Extensions | `pgcrypto` for `gen_random_uuid()`; `pg_trgm` if a name-search feature is added |
| Search | PostgreSQL full-text search (`tsvector`) for the workspace-scoped search of students and groups (`F-P1-13`, scope per `OQ-07` default (b)); an external search engine is not adopted |
| Backups | Platform-managed daily backups, 35-day retention (`F-P0-09` AC-3) plus a monthly restore drill |
| Connection health | `/api/health` reports the database status; a failed check marks the deployment unhealthy |

**Tenant scoping.** Every request that touches tenant data runs inside a transaction that first
executes `SELECT set_config('app.workspace_id', $1, true)`. The `true` makes the setting
transaction-local, so a pooled connection never leaks a tenant scope to the next request. This is
the mechanism described in `DATA_MODEL.md` §6; it is the reason the repository layer must not use
`$transaction` callbacks that call out to the network.

**Full-text search.** The generated column is `search_vector tsvector` over the searchable fields,
maintained by a trigger so an application bug cannot desynchronise it. The P1 search set is
**students and groups** (`F-P1-13`, scope per `OQ-07` default (b)); teacher notes are not in it.
Search queries are always scoped to the workspace id and to the caller's permission set, and the
exclusion is at the query level, not a UI filter — so if `OQ-07` resolves to (c) and notes become
searchable, the portal's search set still excludes them by construction.

---

## 5. IN-2 — Object storage (S3-compatible)

| Aspect | Decision |
|---|---|
| Client | `@aws-sdk/client-s3` `3.1155.0` |
| Buckets | One private bucket per environment; no public access, no public ACL |
| Key layout | `ws/{workspace_id}/{file_uuid}.{validated_extension}`; filenames are never key components |
| Upload | Bounded server-side `PutObject` via an authorized route; the browser never receives storage credentials |
| Download | Short-lived signed URL (`GetObject`) issued only after a fresh authorisation check |
| Visibility | The object is reachable only through a short-lived signed URL; there is no public path or public ACL |
| Encryption | Server-side encryption enabled at the bucket level |
| Lifecycle | A bucket lifecycle policy provides a retention backstop for stale objects; the application removes the object on explicit delete |
| Prefix | `ws/{workspace_id}/…` so a workspace's objects can be enumerated, exported, or purged as a set |
| CORS | Restricted to the application origin for the signed-URL `GET` path; `PUT` is not allowed from the browser |

**Failure handling.** A storage error is returned without creating file metadata and the UI allows
the upload to be retried. A scanner error leaves the stored file pending and non-downloadable. A
failed download authorization does not issue a URL; a missing object is a `404`. Storage outages
must not affect attendance, students, or messages — no other feature depends on storage.

**Interface.**

```ts
export interface FileStorageAdapter {
  put(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  get(key: string): Promise<Buffer>;
  signDownload(input: { key: string; ttlSeconds: number; filename: string; contentType: string }): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

### 5.1 Required configuration

| Variable | Local development | Staging/production |
|---|---|---|
| `FILE_STORAGE_DRIVER` | `local` | `s3` (required; local disk is rejected) |
| `FILE_LOCAL_STORAGE_PATH` | Optional; defaults to `.data/files` | Not used |
| `S3_BUCKET` | Not required for local storage | Required private bucket |
| `S3_REGION` | Not required for local storage | Required |
| `S3_ENDPOINT` | Optional | Set for a non-AWS S3-compatible provider |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Not required | Optional as a pair when workload identity is unavailable |
| `S3_FORCE_PATH_STYLE` | `false` by default | Set to `true` only for providers that require it |
| `CLAMAV_HOST`, `CLAMAV_PORT` | Scanner is optional to boot; uploads are disabled without it | Private `clamd` service required; port defaults to `3310` |

The application encrypts objects server-side and issues attachment-only `GetObject` URLs for three
minutes. The bucket must have public access blocked, encryption enabled, and a lifecycle cleanup
rule. S3 credentials are server-only. Configure `clamd` on a private network and keep its virus
definitions current. See `.env.example` for the local template; production values belong in the
deployment secret manager, not in source control.

---

## 6. IN-3 — Antivirus scanner

| Aspect | Decision |
|---|---|
| Purpose | Mandatory before any uploaded file can be downloaded (`F-P1-11` AC-3) |
| Interface | `MalwareScanAdapter.scan(body): Promise<{ clean: boolean }>` |
| Trigger | Upload creates a `pending` file. An authenticated scan request reads the private object and calls `clamd`; the row moves to `clean` or `blocked` |
| Blocked behaviour | An infected file is never downloadable; the teacher sees the status and can archive or delete it |
| Engine failure | The file remains `pending` and non-downloadable; the teacher can retry. **A scanner outage never grants access.** |
| Archive handling | DOCX/XLSX/PPTX central directories are checked for traversal, executable entries, entry count, and expansion ratio; ClamAV scans the complete file |
| Engine identity | ClamAV engine identity is owned by the scanner service; the file audit records the clean/blocked result |
| Privacy | File bytes are sent only over the private application network to `clamd`, never to a public scanning API |
| ADR | ADR-0017 records the selected scanner and fail-closed behavior |

**Provider selected.** A private ClamAV `clamd` service is used through its TCP `INSTREAM` protocol.
`CLAMAV_HOST` and `CLAMAV_PORT` configure the connection. Non-local deployments fail configuration
validation when the host is missing. In local development, uploads are disabled until `clamd` is
available. Scanner errors leave existing uploads pending and expose a retry action.

---

## 7. IN-4 — Email delivery

### 7.1 Why email is a queue, not a request

Every email is enqueued to the transactional outbox in the same transaction as the state change
that caused it, and delivered by the job worker. A request handler never calls the provider
inline: the teacher gets an instant response, and a provider outage delays mail instead of
breaking the feature. `F-P0-02` AC-2 (verification), `F-P0-02` AC-8 (reset), `F-P2-01` AC-1 (invitation) all depend on
this.

### 7.2 Email catalogue

| Template | Trigger | Audience | Required content |
|---|---|---|---|
| `verify-email` | Sign-up | The registering teacher | One-time link, 24 h validity, resend guidance |
| `reset-password` | Password reset request | The account owner | One-time link, 30 min validity |
| `workspace-invitation` | Member invited | The invitee | Workspace name, inviter name, role, accept link, expiry |
| `reminder-digest` | Daily attendance reminder | The teacher | Summary of the sessions that still need marking, deep link |
| `security-notice` | Sign-in from a new device, password change, break-glass access | The owner | What happened and how to respond |

### 7.3 Constraints

| Rule | Detail |
|---|---|
| Language | Arabic and English (`next-intl` locale), selected by the recipient's stored locale |
| Layout | RTL-aware; logical CSS properties only; the same template renders correctly in both directions |
| Branding | Minimal: the product name, a plain-text body, and a clear call to action. No heavy HTML, no tracking pixels |
| Tracking | **No** open tracking, **no** click tracking. A link click tells us nothing about the student's family. |
| PII | The body contains no student name, no phone number, and no note content. A digest contains counts and group names only. |
| Headers | `Reply-To` is a monitored support address; no personal address of a teacher or student |
| Suppression | A hard bounce marks the address undeliverable and stops further mail; a soft bounce retries then suppresses |
| Unsubscribe | Transactional mail (verification, reset, invitation) is exempt; the daily digest is not a marketing email but is limited to one per day and is disabled by a workspace setting |
| Rate limit | One digest per workspace per day; resend links are rate-limited to one per 60 s |
| Deliverability | A verified sending domain, SPF and DKIM, and a DMARC policy. A production-only check fails the deploy if the sending domain is missing **[CI]** |

### 7.4 Interface

```ts
export interface EmailAdapter {
  send(message: OutboundEmail): Promise<SendResult>;
}

export interface OutboundEmail {
  id: string;
  template: "verify-email" | "reset-password" | "workspace-invitation" | "reminder-digest" | "security-notice";
  to: string;
  locale: "ar" | "en";
  vars: Record<string, string | number>;
}
```

`vars` is a closed set per template, enforced by a discriminated union, so a template can never
receive an unexpected field that leaks data.

---

## 8. IN-5 — WhatsApp (deep link only)

| Aspect | Decision |
|---|---|
| Direction | **Outbound, teacher-initiated** (`R-03`, `D-16`, `F-P1-10`) |
| Mechanism | A `whatsapp://send?phone=<number>&text=<urlencoded message>` deep link, plus the canonical `https://wa.me/<number>?text=…` fallback |
| Server contact | **None.** Kashkol never sends a WhatsApp message, has no WhatsApp Business API account, and cannot confirm delivery |
| State machine | `prepared → opened_in_whatsapp` and nothing further. There is **no** `sent` and no `delivered`. (`NF-2`, `F-P1-10` AC-4) |
| Recorded truth | The platform records that a link was prepared, that the teacher clicked it, and that WhatsApp was opened. It does not claim the message was read or received. |
| Numbers | Arabic-Egyptian local format by default (`+20…`), derived from the stored phone number, with an explicit international-format option |
| Encoding | The message text is URL-encoded; the encoding is verified in a unit test |
| Offline | The platform works fully without WhatsApp. No screen requires it. |
| Link preview | The preview text is generated by the platform and always states the message content the teacher composed; the teacher may edit it before opening WhatsApp |

**This is the single most likely place for the product to lie.** The teacher-facing copy says
"opened in WhatsApp", never "sent" or "delivered". `F-P1-10` AC-4, `D-16`, and `NF-2` encode
this, and the copy is covered by a UI test. ADR-0010 records the decision and its alternatives.

---

## 9. IN-6 — QR codes and tokens (internal)

Not a third-party integration, but it has the same contract discipline.

### 9.1 Token service

| Aspect | Decision |
|---|---|
| Purpose | One-time and short-lived tokens for student self-check-in and parent linking |
| Generation | A cryptographically random 128-bit value, stored **hashed** (SHA-256 with a per-token salt) so the plaintext is never recoverable from the database |
| Lifetime | Configurable per purpose; the session token is short-lived (minutes) and the enrolment token longer |
| Consumption | Single use, marked consumed in the same transaction that performs the action |
| Rate limiting | Attempts are limited per token, per device, and per IP |
| Revocation | A consumed token cannot be reused; a token can be invalidated by the owner |

### 9.2 QR payloads

| Consumer | Payload | Notes |
|---|---|---|
| Student scanning a session code | A signed, short-lived session token | The student camera app scans; the teacher displays a rotating code |
| Parent scanning a linkage code | A single-use enrolment token bound to one student | Bound to the intended student so a scan cannot link the wrong child |
| Parent portal entry | A signed link | Validated server-side on every request |

The QR payload is **signed**, not encrypted, and contains an opaque id — no student name and no
parent phone number appears in the image, so a photo of the screen does not disclose personal data.
The signature carries an expiry.

---

## 10. IN-7 — Railway (hosting platform)

| Aspect | Decision |
|---|---|
| Deployments | One application service; a separate worker service running the same image with a different command |
| Worker | `npm run worker` — the same codebase, a different entrypoint, so the worker and the web app can never drift |
| Database | Railway managed PostgreSQL |
| Secrets | Railway service variables; no `.env` file in the image |
| Migrations | Run in a release phase via `prisma migrate deploy`, never on app boot |
| Health checks | `/api/health` (liveness) and `/api/health/ready` (readiness, checks the database) |
| Scaling | The web service scales horizontally; the worker scales to one instance initially to avoid duplicate work, using the job claim protocol in ADR-0008 |
| Cron | Railway cron triggers the recurring jobs (daily reminders, reconciliation, retention) |
| Rollback | A previous release is redeployed; migrations are forward-only with compensating migrations, so a rollback does not require a down migration (`F-P0-09` AC-2) |
| Preview environments | A pull request creates an isolated preview with its own database and a seeded dataset |
| Cost control | The worker and the database size are the main cost levers; the retention job keeps the database small |
| Regions | Build and beta in any region (`OQ-19` (a)); the data-residency question is deferred pending the legal review |

**Environment separation.** Staging and production use separate databases, separate buckets,
separate email providers, and separate secret sets. A CI check refuses to deploy to production
with a staging configuration value. **[CI]**

---

## 11. IN-8 — Observability

| Aspect | Decision |
|---|---|
| Logs | Structured JSON, one object per line, with a request id (`F-P0-09` AC-4) |
| Errors | An error tracker with source maps uploaded for production builds (`F-P0-09` AC-4) |
| Metrics | Health, latency, error rate, and the job queue depth |
| Alerting | An alert fires on an error-rate spike, a failed health check, a stalled job queue, and an authentication anomaly |
| Redaction | A field allowlist per event type; no PII, no tokens, no bodies (`SECURITY_AND_PRIVACY.md` §8) |
| Sampling | Errors and slow requests are sampled at 100%; successful requests are sampled at a low rate |
| Retention | Application logs 30 days; error reports 90 days |
| Provider | Deferred to M0 close; the contract is `log(event)`, `captureError(error, context)`, `metric(name, value)` |

**Request id.** The `proxy.ts` assigns or forwards an `x-request-id` on every request, the logger
includes it, and it is returned in the error envelope. A teacher reporting a problem can quote it.

---

## 12. IN-9 — Payments (deferred, P3)

No payment integration is implemented. The requirements treat payments as P3 (`A-05`, `R-13`).

When it happens, the constraints are already fixed by the requirements and are recorded here so the
implementation does not renegotiate them later:

- The platform is a **merchant of record**: the teacher pays a platform fee, and the payment provider
  holds the card data. Kashkol never stores a card number, a CVV, or a cardholder name.
- A payment record stores the provider, the provider transaction id, the amount, the currency, the
  status, and the timestamps. The card data stays with the provider.
- A payment is reconciled by the provider's webhook; the webhook is verified by signature, is
  idempotent, and may be delivered more than once.
- A webhook receiver is an exempt, unauthenticated-by-session route, identified by a shared secret
  and a provider signature — and it is still workspace-scoped, validated, and idempotent.
- Payment state lives in our tables, so the provider can be replaced.

---

## 13. Integration failure matrix

| Integration | Timeout | Retries | Backoff | Circuit breaker | Degraded behaviour |
|---|---|---|---|---|---|
| PostgreSQL | 5 s | 2 | 50 ms | No | Request fails with `503`; the health check fails |
| Object storage | 10 s per request | 3 (AWS SDK standard retry) | SDK standard backoff | No | The file action shows a retry; other features are unaffected |
| Scanner | 60 s | 0 automatic | — | No | The file stays `pending`; downloads stay blocked and the teacher may retry |
| Email | 10 s | 3 | 1 s / 5 s / 30 s | Yes, 5 failures | The message is queued; the teacher sees "the reminder will be sent" |
| Observability | 2 s | 0 | — | Yes, and **fail open** | The request proceeds; a dropped log is counted internally |
| WhatsApp | n/a | n/a | n/a | n/a | The deep link opens WhatsApp; the platform records `prepared` only |

**Rule:** no outbound call is made inside a database transaction, except the `set_config` statement
that begins the transaction. A transaction that opens a network call holds a connection and a lock
while waiting on a third party, which is how a provider outage becomes a database outage.

---

## 14. Integration security checklist

- [ ] Every credential lives in the platform secret manager, is server-side only, and is not prefixed `NEXT_PUBLIC_`.
- [ ] Every adapter validates its own inputs and never trusts a client-supplied value.
- [ ] Every adapter's outbound payload is reviewed for PII.
- [ ] Every adapter's error message is sanitised before it is stored or displayed.
- [ ] Every webhook receiver verifies a signature, is idempotent, and is workspace-scoped.
- [ ] Every adapter has a fake implementation used by tests, so no test needs a credential.
- [ ] Every adapter's failure mode appears in the UI, not as a silent no-op.
- [ ] Every provider choice is recorded in an ADR with the alternatives considered.

---

## 15. Open items

| ID | Item | Owner | Needed by |
|---|---|---|---|
| OI-1 | Choose the email provider and its SDK | Engineering | Before M0 closes (verification and reset must work in staging) |
| OI-2 | Deploy and monitor the private ClamAV service and its virus-definition updates | Operations | Before M1 |
| OI-3 | Choose the logger and error tracker SDKs | Engineering | Before M0 closes |
| OI-4 | Choose the PDF renderer for the in-app viewer | Engineering | Before M1 |
| OI-5 | Choose the spreadsheet reader/writer for XLSX export | Engineering | Before M1 |
| OI-6 | Choose the E2E and accessibility test tooling | Engineering | Before M0 closes |
| OI-7 | Confirm the Railway region against the legal review | Engineering + legal | Before M2 |
| OI-8 | Confirm email deliverability setup (domain, SPF, DKIM, DMARC) | Operations | Before the private beta |
| OI-9 | Confirm the privacy notice wording for outbound email | Legal | Before M2 |
