import crypto from "node:crypto";
import { AppError } from "@/lib/http/errors";
import type {
  SignedPlaybackDescriptor,
  VideoAssetMetadata,
  VideoAssetState,
  VideoProviderAdapter,
  VideoWebhookPayload,
} from "./interface";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const REQUEST_TIMEOUT_MS = 8_000;

export class CloudflareStreamAdapter implements VideoProviderAdapter {
  readonly providerName = "cloudflare_stream" as const;
  readonly isConfigured = true;

  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly signingKeyId: string;
  private readonly signingPrivateKey: string;
  private readonly webhookSecret?: string;

  constructor(config: {
    accountId: string;
    apiToken: string;
    signingKeyId: string;
    signingPrivateKey: string;
    webhookSecret?: string;
  }) {
    this.accountId = config.accountId;
    this.apiToken = config.apiToken;
    this.signingKeyId = config.signingKeyId;
    this.signingPrivateKey = config.signingPrivateKey;
    this.webhookSecret = config.webhookSecret;
  }

  /**
   * Cloudflare Stream signs playback tokens with the private half of an RSA
   * signing key (`RS256`), not a shared HMAC secret. The key may be a PEM
   * string or a JWK object, as returned by the Cloudflare dashboard.
   */
  private privateKey(): crypto.KeyObject {
    const raw = this.signingPrivateKey.replace(/\\n/g, "\n").trim();
    if (raw.startsWith("{")) {
      return crypto.createPrivateKey({
        key: JSON.parse(raw) as crypto.JsonWebKey,
        format: "jwk",
      });
    }
    return crypto.createPrivateKey(raw);
  }

  private async ensureSignedUrls(cleanId: string): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(this.accountId)}/stream/${encodeURIComponent(cleanId)}`;
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${this.apiToken}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ requireSignedURLs: true }),
        signal: controller.signal,
        cache: "no-store",
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async inspectAsset(providerAssetId: string): Promise<VideoAssetMetadata> {
    const cleanId = providerAssetId.trim();
    if (!/^[a-zA-Z0-9_-]{6,64}$/.test(cleanId)) {
      throw new AppError("VALIDATION_FAILED", {
        fields: { providerAssetId: ["invalidAssetId"] },
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const url = `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(this.accountId)}/stream/${encodeURIComponent(cleanId)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.apiToken}`,
          accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });

      if (response.status === 404) {
        return {
          provider: "cloudflare_stream",
          providerAssetId: cleanId,
          assetStatus: "unavailable",
          durationSeconds: 0,
          sizeBytes: 0,
          thumbnailPath: null,
          requireSignedPlayback: false,
        };
      }

      if (!response.ok) {
        return {
          provider: "cloudflare_stream",
          providerAssetId: cleanId,
          assetStatus: "unavailable",
          durationSeconds: 0,
          sizeBytes: 0,
          thumbnailPath: null,
          requireSignedPlayback: false,
        };
      }

      const payload = (await response.json()) as {
        success?: boolean;
        result?: {
          uid?: string;
          status?: { state?: string };
          duration?: number;
          size?: number;
          requireSignedURLs?: boolean;
        };
      };

      const result = payload.result;
      if (!payload.success || !result?.uid) {
        return {
          provider: "cloudflare_stream",
          providerAssetId: cleanId,
          assetStatus: "unavailable",
          durationSeconds: 0,
          sizeBytes: 0,
          thumbnailPath: null,
          requireSignedPlayback: false,
        };
      }

      const rawState = result.status?.state ?? "pending";
      const assetStatus: VideoAssetState =
        rawState === "ready"
          ? "ready"
          : rawState === "inprogress" || rawState === "queued" || rawState === "downloading"
            ? "processing"
            : rawState === "error"
              ? "failed"
              : "pending";

      // A signed token is only meaningful when the asset itself requires signed
      // URLs. Enforce it at the provider; if that fails, the asset is unusable.
      const signed =
        result.requireSignedURLs === true || (await this.ensureSignedUrls(result.uid));
      if (!signed) {
        return {
          provider: "cloudflare_stream",
          providerAssetId: result.uid,
          assetStatus: "unavailable",
          durationSeconds: 0,
          sizeBytes: 0,
          thumbnailPath: null,
          requireSignedPlayback: false,
        };
      }

      return {
        provider: "cloudflare_stream",
        providerAssetId: result.uid,
        assetStatus,
        durationSeconds:
          typeof result.duration === "number" && result.duration > 0
            ? Math.round(result.duration)
            : 0,
        sizeBytes:
          typeof result.size === "number" && result.size > 0 ? Math.round(result.size) : 0,
        thumbnailPath: `/api/videos/thumbnails/${encodeURIComponent(result.uid)}`,
        requireSignedPlayback: true,
      };
    } catch {
      // Per F-P3-02 AC-5: provider outage or unreachable -> save/report as unavailable, never crash or leak secrets
      return {
        provider: "cloudflare_stream",
        providerAssetId: cleanId,
        assetStatus: "unavailable",
        durationSeconds: 0,
        sizeBytes: 0,
        thumbnailPath: null,
        requireSignedPlayback: false,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async createSignedPlaybackDescriptor(input: {
    providerAssetId: string;
    workspaceId: string;
    videoId: string;
    viewerKey: string;
    ttlSeconds: number;
    durationSeconds: number;
    now?: Date;
  }): Promise<SignedPlaybackDescriptor> {
    const now = input.now ?? new Date();
    const nbf = Math.floor(now.getTime() / 1000) - 10;
    const exp = Math.floor(now.getTime() / 1000) + input.ttlSeconds;

    // Cloudflare Stream verifies the token with the public half of the signing
    // key selected by `kid`. The algorithm is RS256; an HMAC token (or a `kid`
    // derived from the account id) is rejected by the provider.
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT", kid: this.signingKeyId }),
    ).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({
        sub: input.providerAssetId,
        kid: this.signingKeyId,
        nbf,
        exp,
        accessRules: [{ type: "any", action: "allow" }],
      }),
    ).toString("base64url");
    const signature = crypto
      .sign("RSA-SHA256", Buffer.from(`${header}.${body}`), this.privateKey())
      .toString("base64url");
    const signedToken = `${header}.${body}.${signature}`;

    return {
      provider: "cloudflare_stream",
      providerAssetId: input.providerAssetId,
      signedToken,
      embedUrl: `https://iframe.videodelivery.net/${encodeURIComponent(signedToken)}`,
      hlsManifestUrl: `https://videodelivery.net/${encodeURIComponent(signedToken)}/manifest/video.m3u8`,
      thumbnailUrl: `https://videodelivery.net/${encodeURIComponent(signedToken)}/thumbnails/thumbnail.jpg?time=2s`,
      durationSeconds: input.durationSeconds,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  verifyWebhook(input: {
    rawBody: string;
    signatureHeader: string | null;
    now?: Date;
  }): VideoWebhookPayload | null {
    if (!this.webhookSecret) return null;
    if (!input.signatureHeader) return null;
    const parts = Object.fromEntries(
      input.signatureHeader.split(",").map((segment) => {
        const [k, v] = segment.trim().split("=");
        return [k, v];
      }),
    );
    const timeStr = parts.time;
    const sig1 = parts.sig1;
    if (!timeStr || !sig1) return null;
    const timestampSeconds = Number(timeStr);
    if (!Number.isInteger(timestampSeconds)) return null;

    const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > 300) {
      return null;
    }

    const expected = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(`${timestampSeconds}.${input.rawBody}`)
      .digest("hex");

    const a = Buffer.from(sig1, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    try {
      const parsed = JSON.parse(input.rawBody) as {
        uid?: string;
        status?: { state?: string };
        duration?: number;
        size?: number;
      };
      if (!parsed.uid || typeof parsed.uid !== "string") return null;
      const rawState = parsed.status?.state ?? "pending";
      const state: VideoAssetState =
        rawState === "ready"
          ? "ready"
          : rawState === "inprogress" || rawState === "queued"
            ? "processing"
            : rawState === "error"
              ? "failed"
              : "pending";
      return {
        providerAssetId: parsed.uid,
        state,
        durationSeconds:
          typeof parsed.duration === "number" && parsed.duration >= 0
            ? Math.round(parsed.duration)
            : undefined,
        sizeBytes:
          typeof parsed.size === "number" && parsed.size >= 0
            ? Math.round(parsed.size)
            : undefined,
      };
    } catch {
      return null;
    }
  }
}
