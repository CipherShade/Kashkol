# Email transport environment variables

| Variable | Required when | Description | Default (local) |
|---|---|---|---|
| `EMAIL_TRANSPORT` | always | `console` (dev only), `smtp`, or `none` | `console` |
| `EMAIL_FROM` | always | Sender address | `Kashkol <no-reply@kashkol.local>` |
| `SMTP_HOST` | `smtp` | SMTP server hostname | — |
| `SMTP_PORT` | `smtp` | SMTP port (usually 587/465) | `587` |
| `SMTP_USER` | `smtp` | SMTP authentication user | — |
| `SMTP_PASS` | `smtp` | SMTP authentication password | — |
| `SMTP_SECURE` | `smtp` | Use TLS (`true`/`false`) | `false` |

Production startup validates `EMAIL_TRANSPORT` via `parseServerEnv`. `console` is refused outside `local`. `smtp` requires `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`. Credentials never appear in logs; adapter sanitises error strings.

The existing `console` transport and WhatsApp Cloud adapter remain untouched. `nodemailer` is added as production dependency.

## Video provider (Cloudflare Stream / fake)

| Variable | Required when | Description | Default (local) |
|---|---|---|---|
| `VIDEO_PROVIDER_DRIVER` | always | `none`, `fake`, or `cloudflare_stream` | `none` |
| `VIDEO_PROVIDER_ACCOUNT_ID` | `cloudflare_stream` | Cloudflare account ID | — |
| `VIDEO_PROVIDER_API_TOKEN` | `cloudflare_stream` | Cloudflare API token (min 16 chars) | — |
| `VIDEO_PROVIDER_SIGNING_KEY_ID` | `cloudflare_stream` | ID of the Cloudflare Stream signing key (`kid`) | — |
| `VIDEO_PROVIDER_SIGNING_PRIVATE_KEY` | `cloudflare_stream` | RSA private key for RS256 playback tokens, PEM or JWK (min 32 chars) | — |
| `VIDEO_PROVIDER_WEBHOOK_SECRET` | `cloudflare_stream` / `fake` | Webhook verification secret | — |
| `VIDEO_PROVIDER_SIGNING_SECRET` | `fake` only | In-memory fake adapter signing secret (min 16 chars) | — |

Production must use `cloudflare_stream` with a valid account ID, API token, signing key ID, and RSA private key. Playback tokens are signed with `RS256` and carry the signing key ID as `kid`; a shared HMAC secret is not accepted by Cloudflare Stream. `fake` is local/test-only (refused when `APP_ENV != local`) and keeps assets in memory. `CloudflareStreamAdapter` uses real `api.cloudflare.com` endpoints with a timeout and sanitized errors, and enforces `requireSignedURLs` at the provider before an asset can be attached. Credentials never appear in logs or adapter interfaces.

## Messaging, Web Push, and worker tokens

| Variable | Required when | Description | Default (local) |
|---|---|---|---|
| `MESSAGING_PROVIDER` | always | `whatsapp_cloud`, `smtp`, or unset (fake) | fake |
| `WHATSAPP_CLOUD_TOKEN` | `whatsapp_cloud` | Meta access token (server-only) | — |
| `WHATSAPP_PHONE_NUMBER_ID` | `whatsapp_cloud` | Meta phone number ID (server-only) | — |
| `WHATSAPP_API_VERSION` | `whatsapp_cloud` | Meta API version | `v21.0` |
| `WHATSAPP_APP_SECRET` | webhook verification | Meta app secret for `X-Hub-Signature-256` (server-only) | — |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | webhook verification | `hub.verify_token` handshake secret (server-only) | — |
| `WEB_PUSH_VAPID_SUBJECT` | web push | `mailto:` or `https:` contact URI | — |
| `WEB_PUSH_VAPID_PUBLIC_KEY` | web push | URL-safe Base64 P-256 public key (returned to the browser) | — |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | web push | URL-safe Base64 P-256 private key (server-only) | — |
| `REPORT_EXPORT_WORKER_TOKEN` | non-local | Bearer token for `POST /api/worker/reports` (min 32 chars) | — |
| `MESSAGING_WORKER_TOKEN` | non-local | Bearer token for `POST /api/worker/outbox` (min 32 chars) | — |
| `WORKER_POLL_INTERVAL_SECONDS` | always | Worker loop poll cadence, in seconds (range `1`–`300`) | `30` |

`npm run worker` drains the message outbox per workspace and queued report exports across all
workspaces. `REQUIRE_MIGRATIONS` (default `true`) refuses to drain until the latest migration matches
`REQUIRED_MIGRATION_NAME`, mirroring what `/readyz` reports for the web tier. The dedicated tokens are
constant-time compared; the messaging route also accepts a staff session (`POST /api/worker/outbox`),
the reports route does not — both tokens are independent and neither appears in the client bundle.

Production startup validates `MESSAGING_WORKER_TOKEN` independently from `REPORT_EXPORT_WORKER_TOKEN`: the outbox worker must never reuse the report-export credential. Webhook verification returns `503` when `WHATSAPP_APP_SECRET` is unset, `401` for an invalid signature, and `400` for a malformed body. Verified webhook events are acknowledged but **not** processed until inbound event handling is implemented.

## Social providers (Google / Facebook)

| Variable | Required when | Description | Default (local) |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | offering Google sign-in | Google OAuth 2.0 client ID (`client_id`, not the API key) | — |
| `GOOGLE_CLIENT_SECRET` | offering Google sign-in | Google OAuth 2.0 client secret | — |
| `FACEBOOK_CLIENT_ID` | offering Facebook sign-in | Facebook App ID | — |
| `FACEBOOK_CLIENT_SECRET` | offering Facebook sign-in | Facebook App Secret | — |

A provider is offered in the sign-in/sign-up screens and in the account page's "Connected accounts"
section only when **both** of its variables are set. An empty value is rejected at startup (it is not
treated as "off"), and no credential ever appears in the client bundle, logs, or error reports.
Email/password authentication is unchanged whether or not the variables are set.

**Manual setup**

1. Google: create a project in Google Cloud Console → APIs & Services → Credentials → OAuth client ID
   (Web application). Set the authorised redirect URI to the exact callback URL below. Paste the
   client ID and secret into the two `GOOGLE_*` variables.
2. Facebook: create an app at developers.facebook.com → Facebook Login → Settings. Add the exact
   callback URL below to "Valid OAuth Redirect URIs", make the app public, and paste the App ID and
   App Secret into the two `FACEBOOK_*` variables.

**Exact callback URLs to register**

| Environment | Google | Facebook |
|---|---|---|
| Local | `http://localhost:3000/api/auth/callback/google` | `http://localhost:3000/api/auth/callback/facebook` |
| Production | `${BETTER_AUTH_URL}/api/auth/callback/google` | `${BETTER_AUTH_URL}/api/auth/callback/facebook` |

**Behaviour guarantees (nothing faked).** Linking is explicit only: `account.accountLinking` is
`{ enabled: true, disableImplicitLinking: true, allowDifferentEmails: false, allowUnlinkingAll: false }`
and `trustedProviders` is unset, so a social sign-in that merely matches an existing email is
rejected (`account_not_linked`), a link succeeds only when the provider asserts a **verified** email
that exactly matches the account email, and unlinking is only possible from the authenticated
account page. Unlink refuses the credential row and the last remaining account, so nobody can lock
themselves out. Database uniqueness on `(providerId, accountId)` and `(userId, providerId)`
(migration `20261115000000_social_auth_account_constraints`) is the last line of defence against
duplicate identities.

**Not live-verified.** No Google/Facebook app credentials exist in this environment, so no end-to-end
OAuth flow has been executed and no claim that social sign-in works is made until the setup above is
completed and exercised against a real provider.
