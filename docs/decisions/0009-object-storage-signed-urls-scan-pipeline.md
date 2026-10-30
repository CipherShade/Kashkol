# ADR-0009: Private object storage with signed URLs and a scan pipeline

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Engineering
- **Scope:** M1
- **Serves:** `F-P1-11` (files and PDFs), `F-P2-10` (export), `A-09` (file limits)

## Context

Teachers upload worksheets, answer keys, and answer sheets (`F-P1-11`). Files may be visible to the
teacher, to assistants with the `files` permission, or to students in a shared context — and
sometimes to nobody but the owner (`D-15`).

Three constraints shape the design:

1. **No public URLs.** A file containing a child's work must not be reachable by an unauthenticated
   request, and a leaked link must not be a permanent disclosure.
2. **Malware must not be served.** A teacher uploads whatever a parent sends; an infected file must
   never be downloaded by anyone.
3. **Deletion must be complete.** When a file is deleted, the stored object must actually go, and
   the requirement states that stored objects must be removed within a bounded window
   (`F-P0-08` AC-5).

## Decision

Store file bytes in a **private S3-compatible bucket**, reached through a `FileStorageAdapter`
(`src/modules/files/adapters/`), and serve them only through **short-lived signed URLs** issued
after a fresh authorisation check.

**Storage**

- One private bucket per environment. No public access, no public ACL, no public CDN path.
- Object keys are server-generated: `ws/{workspace_id}/{file_uuid}.{ext}`. The client filename never
  becomes a path component; the name shown to the teacher lives in the `file.display_name` column.
- Server-side encryption is enabled at the bucket level.
- The adapter exposes `put`, `signDownload`, `delete`, `exists`. The application never speaks the
  storage SDK directly outside the adapter.

**Signed URLs**

- A download request goes to an authorised route → the server re-checks the workspace scope and the
  `files` permission for that exact file → the server issues a signed URL with a short TTL (minutes)
  → the browser fetches the object directly from storage.
- The signed URL is never issued for a key the caller is not entitled to, and because keys are
  workspace-prefixed, a leaked URL cannot address another workspace's object.
- The TTL is a configuration constant, not a request parameter.

**Scan pipeline**

- The upload flow sets `scan_status = 'pending'` and enqueues a scan job (ADR-0008).
- The scanner downloads the object, scans it, and deletes the copy. The application never buffers
  the file content to serve it.
- `scan_status` transitions `pending → clean | blocked` — the enum has exactly three values, so a
  scan that could not be completed at all also ends in `blocked`.
- **A download is issued only for `scan_status = 'clean'`.** A `blocked` file is visible with an
  explanation and has no download link, whether it was rejected as infected or the scanner was
  unavailable. A scanner outage never grants access.
- DOCX/XLSX/PPTX are ZIP containers; the scan step enforces an expansion-ratio and entry-count
  limit to reject a zip bomb.
- PDFs are served with `Content-Disposition: attachment` unless rendered in the in-app viewer, which
  uses a sandboxed iframe with no script permission.

**Deletion**

- Deleting a file marks the row `deleted` and enqueues a deletion job that removes the object.
- A reconciliation job verifies that no object exists for a deleted row, and a bucket lifecycle
  rule provides a backstop, so an object cannot outlive its row indefinitely.
- The export job streams the workspace's files into the archive by reading them through the same
  authorised path.

## Consequences

### Positive

- Files are unreachable without an authorisation decision, and a leaked URL expires.
- Infected files are never served.
- Deletion is verifiable, so the privacy requirement can be proven rather than assumed.
- The adapter boundary means the storage provider can be swapped without touching feature code.
- The bucket lifecycle rule provides a backstop that does not depend on the job worker running.

### Negative

- Every download costs two round trips: an authorisation request and a storage fetch.
- The scan step adds latency before a file becomes usable, and the teacher must see that state.
- The scanner is an extra dependency with an extra failure mode, and it must be chosen and paid for.
- Buckets and object lifecycle need their own cost review as the file volume grows.
- Signed URLs mean the browser talks to the storage provider directly, which requires a correct CORS
  configuration.

### Neutral

- Storage cost is proportional to usage; the app stores no file bytes itself.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Public bucket with random keys** | Security by obscurity. A leaked URL is permanent, and an enumeration bug is a public disclosure. |
| **Serve bytes through the application** | Simple, but it makes the application a file server: bandwidth cost, memory pressure, and the need to stream large bodies through Next.js. |
| **Database bytea for small files** | Trivial for a handful of small files, but it couples storage to the database, inflates backups, and makes the scan pipeline awkward. Rejected for a file feature expected to grow. |
| **A CDN in front of the bucket** | Faster globally, but adds cost and a cache-invalidation surface for a product whose users are in one country. Revisit if file volume grows. |
| **Scanning on upload in the request** | Blocks the request for the scan duration and fails the upload when the scanner is down. The job-based pipeline decouples them. |
| **No malware scan** | Rejected. The requirement is explicit, and the cost of a compromised teacher account downloading infected files onto a school machine is high. If no scanner can be obtained, the file feature is disabled rather than shipped unscanned. |

## Revisit when

- The antivirus provider decision is made (recorded in a follow-up ADR under this number).
- File volume or geography justifies a CDN.
- The storage provider changes, or a provider-native scanning capability removes the need for a
  separate scanner.
