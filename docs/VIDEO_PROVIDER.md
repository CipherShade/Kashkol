# Kashkol — Recorded Video Provider Setup (`F-P3-02`)

**Status:** Implemented · **Date:** 2026-11-02 · **Module:** `src/modules/videos/`

---

## 1. Architecture & Honesty Boundary

Kashkol integrates recorded video lessons through a server-side provider adapter (`VideoProviderAdapter` in `src/modules/videos/adapters/interface.ts`). Kashkol **never** transcodes video on the application server, **never** serves unrestricted private video URLs, **never** exposes provider API tokens or signing secrets to the client, and **never** claims unlimited storage.

When `VIDEO_PROVIDER_DRIVER=none` (the default in `.env.example`), the application shows an explicit **setup state** in the Learning Materials & Recorded Videos screen (`/[locale]/app/files`) rather than simulated or fake hosted videos (`NF-1`–`NF-13`).

---

## 2. Supported Drivers

| `VIDEO_PROVIDER_DRIVER` | Environment | Behaviour |
|---|---|---|
| `none` (default) | Local / Staging / Production | Truthful setup state shown; attaching or playing videos returns `503 SERVICE_UNAVAILABLE` (`errors.videoProviderNotConfigured`). |
| `cloudflare_stream` | Local / Staging / Production | Production adapter talking to Cloudflare Stream's official v4 REST API (`https://api.cloudflare.com/client/v4/accounts/{account_id}/stream/{asset_uid}`) and issuing short-lived RS256 signed playback JWTs with the configured signing key ID. |
| `fake` | Local & Automated Tests **only** | Deterministic in-memory provider (`FakeVideoProviderAdapter`); rejected by `parseServerEnv` when `APP_ENV` is `staging` or `production`. |

---

## 3. Environment Variables

Configure the following variables in your server environment (never prefix with `NEXT_PUBLIC_`):

```dotenv
# Driver: "none" | "cloudflare_stream" | "fake" (fake is local-only)
VIDEO_PROVIDER_DRIVER="cloudflare_stream"

# Cloudflare Stream credentials (required when VIDEO_PROVIDER_DRIVER="cloudflare_stream")
VIDEO_PROVIDER_ACCOUNT_ID="<your-cloudflare-account-id>"
VIDEO_PROVIDER_API_TOKEN="<cloudflare-stream-api-token>"
VIDEO_PROVIDER_SIGNING_KEY_ID="<cloudflare-signing-key-id>"
VIDEO_PROVIDER_SIGNING_PRIVATE_KEY="<RSA private key in PEM or JWK form>"
VIDEO_PROVIDER_WEBHOOK_SECRET="<optional-webhook-signing-secret>"

# Workspace cost-driver & quota caps (bytes / counts)
VIDEO_MAX_COUNT_PER_WORKSPACE="50"
VIDEO_MAX_STORAGE_BYTES_PER_WORKSPACE="5368709120"      # 5 GiB
VIDEO_MAX_BANDWIDTH_BYTES_PER_MONTH="53687091200"       # 50 GiB
```

---

## 4. Short-Lived Signed Playback Flow

1. When a video asset is attached (`POST /api/videos`), `CloudflareStreamAdapter.inspectAsset(externalAssetId)` calls the Cloudflare Stream API to verify the asset exists, reads its processing state, `duration`, `size`, and thumbnail, and enforces `requireSignedURLs: true` on the asset. If the provider cannot confirm signed playback, the asset is reported `unavailable` and the attach/refresh request is refused (`errors.videoNotSecured`).
2. Neither the database nor the initial page load ever returns a raw playable URL to the browser.
3. When an authorized staff member (`POST /api/videos/[videoId]/playback`) or an authenticated, entitled parent/student portal user (`POST /api/portal/videos/[videoId]/playback`) requests playback:
   - The server verifies workspace membership or portal grant (`permissions.showResources === true`, video `publicationStatus === "published"`, `assetStatus === "ready"`, and student/group assignment).
   - The server checks that workspace monthly estimated bandwidth has not exceeded `VIDEO_MAX_BANDWIDTH_BYTES_PER_MONTH`.
   - The adapter mints a short-lived `RS256` JWT (`ttlSeconds: 900` for portal viewers, `1800` for staff) whose header and payload carry the configured signing key ID (`kid`), with `sub = externalAssetId` and `exp`, returning `embedUrl`, `hlsManifestUrl`, and `expiresAt`.
   - The server increments `playbackCount` and `estimatedBandwidthBytes` and writes a `video.playback_authorized` audit event in the same scoped transaction.

---

## 5. Webhook Synchronisation

Configure Cloudflare Stream webhooks to `POST /api/videos/webhook`. The endpoint verifies the `Webhook-Signature` header (`time=<unix>,sig1=<hmac_sha256>`) using constant-time `timingSafeEqual` before updating `assetStatus`, `durationSeconds`, `sizeBytes`, and `thumbnailUrl`. When `VIDEO_PROVIDER_WEBHOOK_SECRET` is not configured, every webhook is rejected rather than trusted.
