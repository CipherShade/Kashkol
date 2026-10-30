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
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` - Token for webhook verification (server-only)

## Manual Configuration (Meta WhatsApp Cloud)
1. Create a Meta Business account and set up WhatsApp Business Platform.
2. Get a Phone Number ID and generate an access token (System User token recommended).
3. Configure webhooks pointing to `https://your-domain.com/api/messaging/webhook` (see webhook verification below).
4. Ensure your WhatsApp Business account has approved message templates if using template messages (this implementation uses text body; follow Meta's current template policies).
5. Set environment variables on the server only.

## Webhook Verification
- GET to `/api/messaging/webhook` handles Meta's webhook verification challenge using `hub.verify_token`.
- POST to `/api/messaging/webhook` receives webhook events. Signature verification should be implemented with `X-Hub-Signature-256` using the app secret (not yet fully implemented - placeholder provided). Events must be handled idempotently.

## Limitations
- This implementation currently sends text messages via the WhatsApp Cloud API text type. For production, follow Meta's current requirements for templates/approved message types.
- If credentials are missing, the WhatsApp adapter returns disabled with a clear message and messages will not be sent externally.
- No class rosters are sent to groups - only one-to-one messages to authorized guardians.
- Opt-out/consent is respected; opted-out guardians will have messages cancelled.
- Message bodies are kept minimal and privacy-conscious. Tokens and full message bodies are not logged.

## Testing
- Unit/integration tests must ensure the fake adapter never sends live traffic.
- Duplicate events must not create duplicate messages (idempotency via `idempotencyKey`).
- Failed messages don't undo attendance (enqueuing is best-effort).
- One student's attendance never generates messages containing another student's data.
- Unauthorized users cannot inspect logs/outbox.
- Failed messages can be retried where authorized.
