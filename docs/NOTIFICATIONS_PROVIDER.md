# Notifications Provider Configuration

## Overview
Kashkol supports private parent communication via a notification outbox with provider adapters. 
- **Fake adapter (default)**: Never sends external messages. Used for dev/test. All messages go to outbox and are marked as sent by the fake adapter.
- **WhatsApp Cloud API adapter**: Production adapter for Meta WhatsApp Business Platform. Only enabled if credentials are present.

## Environment Variables
- `MESSAGING_PROVIDER` - Set to `whatsapp_cloud` to use WhatsApp Cloud API when credentials are configured. Otherwise defaults to fake.
- `WHATSAPP_CLOUD_TOKEN` - Access token from Meta (server-only). Never prefix with `NEXT_PUBLIC_`.
- `WHATSAPP_PHONE_NUMBER_ID` - Phone number ID from Meta (server-only).
- `WHATSAPP_API_VERSION` - API version (default: `v21.0`)
- `WHATSAPP_APP_SECRET` - Meta app secret used to verify `X-Hub-Signature-256` on incoming webhooks (server-only). The webhook returns `503` when it is unset.
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` - Token for the `hub.verify_token` handshake (server-only).
- `MESSAGING_WORKER_TOKEN` - Dedicated bearer token for `POST /api/worker/outbox` (server-only, minimum 32 characters). Required outside `local`; it is never the report-export token.

## Manual Configuration (Meta WhatsApp Cloud)
1. Create a Meta Business account and set up WhatsApp Business Platform.
2. Get a Phone Number ID and generate an access token (System User token recommended).
3. Configure webhooks pointing to `https://your-domain.com/api/messaging/webhook` (see webhook verification below).
4. Ensure your WhatsApp Business account has approved message templates if using template messages (this implementation uses text body; follow Meta's current template policies).
5. Set environment variables on the server only.

## Webhook Verification
- GET to `/api/messaging/webhook` handles Meta's webhook verification challenge using `hub.verify_token` and returns the challenge only when the configured token matches in constant time.
- POST to `/api/messaging/webhook` requires a valid `X-Hub-Signature-256` HMAC-SHA256 of the exact raw body, keyed with `WHATSAPP_APP_SECRET`. Invalid or missing signatures receive `401`; a malformed JSON body receives `400`; an unconfigured secret receives `503`.
- Verified events are acknowledged with `{"status":"ok","processed":false}`. **Inbound event processing is not implemented yet**: delivery statuses are not applied to the outbox and no message state changes on a webhook. This endpoint only proves the caller is Meta.


## Limitations
- This implementation currently sends text messages via the WhatsApp Cloud API text type. For production, follow Meta's current requirements for templates/approved message types.
- If credentials are missing, the WhatsApp adapter returns disabled with a clear message and messages will not be sent externally.
- No class rosters are sent to groups - only one-to-one messages to authorized guardians.
- Opt-out/consent is respected; opted-out guardians will have messages cancelled.
- Message bodies are kept minimal and privacy-conscious. Tokens and full message bodies are not logged.
- Attendance bulk marking enqueues guardian notifications through the outbox. Attendance close and QR check-in do not yet enqueue guardian notifications; that remains deferred to P1, and the UI must not claim otherwise.
- A failed message never undoes attendance; enqueuing remains best-effort.

## Testing
- Unit/integration tests must ensure the fake adapter never sends live traffic.
- Duplicate events must not create duplicate messages (idempotency via `idempotencyKey`).
- Failed messages don't undo attendance (enqueuing is best-effort).
- One student's attendance never generates messages containing another student's data.
- Unauthorized users cannot inspect logs/outbox.
- Failed messages can be retried where authorized.

---

## Portal Web Push & PWA Notifications

### Overview
Parent and Student portals include an installable Progressive Web App (PWA) experience (`/manifest.webmanifest`, `/sw.js`) and optional Web Push notifications backed by standard VAPID (RFC 8292) credentials, alongside a persistent in-app notification center (`/api/portal/notifications`) that serves as the primary, always-available fallback.

### Web Push Environment Variables (Secrets)
Web Push is strictly opt-in and only enabled when all three VAPID variables are configured on the server:
- `WEB_PUSH_VAPID_SUBJECT` - A `mailto:` or `https:` contact URI for the push service (e.g., `mailto:support@example.com`).
- `WEB_PUSH_VAPID_PUBLIC_KEY` - URL-safe Base64-encoded P-256 public key (65-byte uncompressed point). Returned via authenticated `GET /api/portal/push` so the browser can call `pushManager.subscribe`.
- `WEB_PUSH_VAPID_PRIVATE_KEY` - URL-safe Base64-encoded 32-byte P-256 private key (server-only secret; **never** prefix with `NEXT_PUBLIC_`).

To generate a new VAPID keypair locally:
```bash
npx web-push generate-vapid-keys
```

If any of the three variables is omitted, `isWebPushConfigured()` returns `false`, the portal UI disables the push subscription toggle with a clear explanation, and the portal continues to operate normally using the in-app notification center.

`dispatchWebPushNotification` calls the real `web-push` client with the stored subscription and VAPID configuration. It reports `delivered: true` only after the push service accepts the payload; a transport failure reports `send_failed` and an unconfigured deployment reports `unconfigured`. There is no in-memory sent-push history and no simulated delivery. No production caller dispatches a push yet: outbox delivery currently covers WhatsApp/SMS/email, so Web Push remains opt-in infrastructure until a notification producer invokes it.

### Lock-Screen Privacy & Payload Minimization
- **Default (`includeSensitiveDetails = false`)**: Push notification payloads never contain student names, grades, attendance marks, balances, or teacher notes. Both the server payload builder (`buildPortalPushPayload`) and the service worker (`public/sw.js`) enforce generic lock-screen-safe text (`"Open your Kashkol portal to view a new update."` / `"افتح بوابة كشكول لعرض التحديث الجديد."`) with a deep link to the authenticated portal (`/[locale]/portal/parent` or `/[locale]/portal/student`).
- **Explicit Opt-In (`includeSensitiveDetails = true`)**: Even when a user explicitly opts in on their device, the payload includes only a high-level category summary and never raw private notes or unredacted student PII.

### Platform-Specific Limitations & iOS Home Screen Requirements
- **iOS / iPadOS (Safari 16.4+)**: Web Push is **only** available when the user first installs Kashkol to their Home Screen (*Share → Add to Home Screen*) and launches the installed web app in standalone mode (`display-mode: standalone`). Standard Safari tabs on iOS do not expose `PushManager`. The PWA banner (`PwaInstallBanner`) detects iOS non-standalone mode and displays step-by-step "Add to Home Screen" instructions rather than attempting an unsupported permission prompt.
- **Permission Denial & Non-Nagging Policy**: Permission is requested **only** when the user explicitly clicks the "Enable push notifications" button in the portal notification panel. If permission is denied (`Notification.permission === "denied"`) or the install banner is dismissed, the app records dismissal in `localStorage` and never repeatedly prompts or blocks navigation.
- **In-App Notification Center Fallback**: Every portal notification is persisted in the tenant-scoped `notification` table and rendered in the portal's in-app notification center (`GET /api/portal/notifications`, `POST /api/portal/notifications/[notificationId]/read`), ensuring full reliability even when Web Push is unconfigured, unsupported by the browser, or declined by the user.

