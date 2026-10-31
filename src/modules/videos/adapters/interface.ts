export type VideoAssetState =
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "unavailable";

export type VideoAssetMetadata = {
  provider: "cloudflare_stream" | "fake";
  providerAssetId: string;
  assetStatus: VideoAssetState;
  durationSeconds: number;
  sizeBytes: number;
  thumbnailPath: string | null;
  requireSignedPlayback: boolean;
};

export type SignedPlaybackDescriptor = {
  provider: "cloudflare_stream" | "fake";
  providerAssetId: string;
  signedToken: string;
  embedUrl: string;
  hlsManifestUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  expiresAt: string;
};

export type VideoWebhookPayload = {
  providerAssetId: string;
  state: VideoAssetState;
  durationSeconds?: number;
  sizeBytes?: number;
  thumbnailPath?: string | null;
};

export interface VideoProviderAdapter {
  readonly providerName: "cloudflare_stream" | "fake" | "none";
  readonly isConfigured: boolean;

  /**
   * Fetch and verify asset metadata from the external video provider.
   * Never exposes provider credentials.
   */
  inspectAsset(providerAssetId: string): Promise<VideoAssetMetadata>;

  /**
   * Mint a short-lived signed playback token and descriptor for an authorized viewer.
   * Never returns an unrestricted private URL or raw API secret.
   */
  createSignedPlaybackDescriptor(input: {
    providerAssetId: string;
    workspaceId: string;
    videoId: string;
    viewerKey: string;
    ttlSeconds: number;
    durationSeconds: number;
    now?: Date;
  }): Promise<SignedPlaybackDescriptor>;

  /**
   * Verify a signed provider webhook payload (`ready`, `processing`, `failed`).
   */
  verifyWebhook(input: {
    rawBody: string;
    signatureHeader: string | null;
    now?: Date;
  }): VideoWebhookPayload | null;
}
