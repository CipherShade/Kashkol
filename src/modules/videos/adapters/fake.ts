import crypto from "node:crypto";
import type {
  SignedPlaybackDescriptor,
  VideoAssetMetadata,
  VideoAssetState,
  VideoProviderAdapter,
  VideoWebhookPayload,
} from "./interface";

type FakeAssetRecord = {
  providerAssetId: string;
  assetStatus: VideoAssetState;
  durationSeconds: number;
  sizeBytes: number;
  thumbnailPath: string | null;
  requireSignedPlayback: boolean;
};

const fakeAssetStore = new Map<string, FakeAssetRecord>();

const DEFAULT_FAKE_SIGNING_SECRET = "fake-video-provider-signing-secret-for-tests-only";

export function resetFakeVideoProviderStore(): void {
  fakeAssetStore.clear();
}

export function registerFakeVideoAsset(asset: {
  providerAssetId: string;
  assetStatus?: VideoAssetState;
  durationSeconds?: number;
  sizeBytes?: number;
  thumbnailPath?: string | null;
  requireSignedPlayback?: boolean;
}): void {
  fakeAssetStore.set(asset.providerAssetId, {
    providerAssetId: asset.providerAssetId,
    assetStatus: asset.assetStatus ?? "ready",
    durationSeconds: asset.durationSeconds ?? 900,
    sizeBytes: asset.sizeBytes ?? 45 * 1024 * 1024,
    thumbnailPath:
      asset.thumbnailPath === undefined
        ? `/api/videos/thumbnails/${encodeURIComponent(asset.providerAssetId)}`
        : asset.thumbnailPath,
    requireSignedPlayback: asset.requireSignedPlayback ?? true,
  });
}

export function createFakeWebhookSignature(
  rawBody: string,
  secret: string = DEFAULT_FAKE_SIGNING_SECRET,
  timestampSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const signedPayload = `${timestampSeconds}.${rawBody}`;
  const sig = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `time=${timestampSeconds},sig1=${sig}`;
}

export class FakeVideoProviderAdapter implements VideoProviderAdapter {
  readonly providerName = "fake" as const;
  readonly isConfigured = true;
  private readonly signingSecret: string;
  private readonly webhookSecret: string;

  constructor(options?: { signingSecret?: string; webhookSecret?: string }) {
    this.signingSecret = options?.signingSecret ?? DEFAULT_FAKE_SIGNING_SECRET;
    this.webhookSecret = options?.webhookSecret ?? this.signingSecret;
  }

  async inspectAsset(providerAssetId: string): Promise<VideoAssetMetadata> {
    const trimmed = providerAssetId.trim();
    const seeded = fakeAssetStore.get(trimmed);
    if (seeded) {
      return {
        provider: "fake",
        ...seeded,
      };
    }

    if (trimmed.startsWith("missing_") || trimmed.startsWith("deleted_")) {
      return {
        provider: "fake",
        providerAssetId: trimmed,
        assetStatus: "unavailable",
        durationSeconds: 0,
        sizeBytes: 0,
        thumbnailPath: null,
        requireSignedPlayback: true,
      };
    }

    if (trimmed.startsWith("processing_")) {
      return {
        provider: "fake",
        providerAssetId: trimmed,
        assetStatus: "processing",
        durationSeconds: 600,
        sizeBytes: 25 * 1024 * 1024,
        thumbnailPath: `/api/videos/thumbnails/${encodeURIComponent(trimmed)}`,
        requireSignedPlayback: true,
      };
    }

    if (trimmed.startsWith("failed_")) {
      return {
        provider: "fake",
        providerAssetId: trimmed,
        assetStatus: "failed",
        durationSeconds: 0,
        sizeBytes: 0,
        thumbnailPath: null,
        requireSignedPlayback: true,
      };
    }

    // Deterministic default metadata for valid test asset IDs
    const hash = crypto.createHash("sha256").update(trimmed).digest();
    const durationSeconds = 300 + (hash[0]! % 1500);
    const sizeBytes = (15 + (hash[1]! % 85)) * 1024 * 1024;
    return {
      provider: "fake",
      providerAssetId: trimmed,
      assetStatus: "ready",
      durationSeconds,
      sizeBytes,
      thumbnailPath: `/api/videos/thumbnails/${encodeURIComponent(trimmed)}`,
      requireSignedPlayback: true,
    };
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
    const exp = Math.floor(now.getTime() / 1000) + input.ttlSeconds;
    const payload = Buffer.from(
      JSON.stringify({
        sub: input.providerAssetId,
        ws: input.workspaceId,
        vid: input.videoId,
        vwr: crypto.createHash("sha256").update(input.viewerKey).digest("hex").slice(0, 16),
        exp,
      }),
    ).toString("base64url");
    const signature = crypto
      .createHmac("sha256", this.signingSecret)
      .update(payload)
      .digest("base64url");
    const signedToken = `${payload}.${signature}`;

    return {
      provider: "fake",
      providerAssetId: input.providerAssetId,
      signedToken,
      embedUrl: `https://stream-player.kashkol.test/embed/${encodeURIComponent(input.providerAssetId)}?token=${encodeURIComponent(signedToken)}`,
      hlsManifestUrl: `https://stream-player.kashkol.test/manifest/${encodeURIComponent(input.providerAssetId)}.m3u8?token=${encodeURIComponent(signedToken)}`,
      thumbnailUrl: `/api/videos/thumbnails/${encodeURIComponent(input.providerAssetId)}?token=${encodeURIComponent(signedToken)}`,
      durationSeconds: input.durationSeconds,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  verifyWebhook(input: {
    rawBody: string;
    signatureHeader: string | null;
    now?: Date;
  }): VideoWebhookPayload | null {
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
        providerAssetId?: string;
        status?: { state?: string } | string;
        duration?: number;
        size?: number;
      };
      const assetId = parsed.uid ?? parsed.providerAssetId;
      if (!assetId || typeof assetId !== "string") return null;
      const rawState =
        typeof parsed.status === "string" ? parsed.status : (parsed.status?.state ?? "pending");
      const state: VideoAssetState =
        rawState === "ready"
          ? "ready"
          : rawState === "inprogress" || rawState === "processing" || rawState === "queued"
            ? "processing"
            : rawState === "error" || rawState === "failed"
              ? "failed"
              : "pending";
      return {
        providerAssetId: assetId,
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
