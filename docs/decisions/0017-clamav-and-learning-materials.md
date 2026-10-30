# ADR-0017: ClamAV scanning and the learning-materials library

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** Product owner and Engineering
- **Scope:** M1
- **Serves:** `F-P1-11`, `F-P0-01`, `A-09`

## Context

The existing file schema supported one group or student per file, but the library requires multiple
explicit recipients, metadata, archive/restore, and durable object storage. The antivirus provider
was also unresolved. The product handles minors' work, so neither an unscanned file nor a guessed
portal relationship may grant access.

## Decision

- Use the `clamd` TCP `INSTREAM` protocol for malware scanning. The service runs on a private
  application network; file bytes are never sent to a public scanning API. A timeout, protocol
  error, or missing scanner leaves the file pending and non-downloadable.
- The upload route stores at most 25 MB in bounded request memory and writes bytes only through the
  storage adapter. It creates a `pending` metadata row and audit record; the authenticated client
  then requests a scan and can retry a pending scan. No database transaction spans storage or
  scanner network calls.
- Only a clean scan can receive a download URL. Malware detection sets `blocked`. The URL lifetime
  is fixed at three minutes; portal and staff authorization is re-evaluated at each URL-issuing
  request.
- Use the pinned AWS S3 client and presigner for production. The development adapter stores
  generated keys under a local-only path and issues HMAC-signed, expiring application URLs.
- A file has one explicit scope: teacher-only, selected groups, or selected students. Recipient
  associations are tenant-scoped join tables. Existing one-group/one-student rows migrate to the
  matching association without losing their current target.
- Archive hides a material from active lists and all portals but retains its object and metadata.
  Delete soft-deletes and removes the private object; both mutations are audited transactionally.
- Video remains outside this module; no provider is configured, and the product makes no claim to
  host protected video.

## Consequences

### Positive

- A failed scanner cannot make a file available, and the teacher can retry without re-uploading.
- ClamAV receives file content only on the private network; it is not a third-party public API.
- The local adapter is explicitly development-only; durable environments require S3-compatible
  storage and ClamAV configuration.
- Recipient and subject relations enforce the workspace boundary with composite foreign keys and
  RLS.

### Negative

- Uploads remain pending if the browser closes before requesting a scan; the library exposes a
  retry action, and a background worker may automate retries in a later ADR.
- The authenticated scan request holds a bounded file buffer while ClamAV evaluates it.
- The operator must deploy, monitor, and keep virus definitions current on the private `clamd`
  service.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Managed scanning API | Sends minors' files to a third party before the privacy review and provider contract. |
| No scanner / mark uploads clean | Would claim a security property the system has not performed. |
| Public storage or filename-based keys | A leaked or guessed URL could disclose a private file; user filenames can contain unsafe path components. |
| Store bytes in PostgreSQL or production app disk | Inflates backups or relies on ephemeral deployment storage. |
| Public/protected video placeholder | No provider has been selected or tested; a placeholder would claim an unavailable capability. |

## Revisit when

- A production worker is available to drain durable scan jobs without an authenticated browser
  request.
- A managed scanner passes privacy and security review.
- A specific video provider is selected and its authorization, playback, storage, and egress limits
  are tested.
