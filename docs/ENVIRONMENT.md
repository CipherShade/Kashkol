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
| `VIDEO_PROVIDER_DRIVER` | always | `none`, `fake`, or `cloudflare_stream` | `fake` |
| `VIDEO_PROVIDER_ACCOUNT_ID` | `cloudflare_stream` | Cloudflare account ID | — |
| `VIDEO_PROVIDER_API_TOKEN` | `cloudflare_stream` | Cloudflare API token (min 16 chars) | — |
| `VIDEO_PROVIDER_SIGNING_SECRET` | `cloudflare_stream` / `fake` | Signed URL secret (min 16 chars) | `dev-only-video-secret` |
| `VIDEO_PROVIDER_WEBHOOK_SECRET` | `cloudflare_stream` / `fake` | Webhook verification secret | — |

Production must use `cloudflare_stream` with valid account/token/signing secret. `fake` is local/test-only (refused when `APP_ENV != local`). No mocked uploads: `fake` stores assets in-memory only and never contacts external APIs. `CloudflareStreamAdapter` uses real `api.cloudflare.com` endpoints with timeout and sanitized errors; credentials never appear in logs or adapter interfaces.
