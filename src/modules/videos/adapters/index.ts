import { AppError } from "@/lib/http/errors";
import { getServerEnv, isVideoProviderConfigured } from "@/lib/config/env";
import { CloudflareStreamAdapter } from "./cloudflare-stream";
import { FakeVideoProviderAdapter } from "./fake";
import type {
  SignedPlaybackDescriptor,
  VideoAssetMetadata,
  VideoProviderAdapter,
  VideoWebhookPayload,
} from "./interface";

export class UnconfiguredVideoProviderAdapter implements VideoProviderAdapter {
  readonly providerName = "none" as const;
  readonly isConfigured = false;

  async inspectAsset(): Promise<VideoAssetMetadata> {
    throw new AppError("CONFLICT", { messageKey: "errors.videoProviderNotConfigured" });
  }

  async createSignedPlaybackDescriptor(): Promise<SignedPlaybackDescriptor> {
    throw new AppError("CONFLICT", { messageKey: "errors.videoProviderNotConfigured" });
  }

  verifyWebhook(): VideoWebhookPayload | null {
    return null;
  }
}

let overrideAdapterForTests: VideoProviderAdapter | null = null;

export function setVideoProviderAdapterForTests(adapter: VideoProviderAdapter | null): void {
  overrideAdapterForTests = adapter;
}

export function getVideoProviderAdapter(): VideoProviderAdapter {
  if (overrideAdapterForTests) {
    return overrideAdapterForTests;
  }
  const env = getServerEnv();
  if (!isVideoProviderConfigured(env)) {
    return new UnconfiguredVideoProviderAdapter();
  }
  if (env.VIDEO_PROVIDER_DRIVER === "fake") {
    return new FakeVideoProviderAdapter({
      signingSecret: env.VIDEO_PROVIDER_SIGNING_SECRET,
      webhookSecret: env.VIDEO_PROVIDER_WEBHOOK_SECRET,
    });
  }
  if (
    env.VIDEO_PROVIDER_DRIVER === "cloudflare_stream" &&
    env.VIDEO_PROVIDER_ACCOUNT_ID &&
    env.VIDEO_PROVIDER_API_TOKEN &&
    env.VIDEO_PROVIDER_SIGNING_KEY_ID &&
    env.VIDEO_PROVIDER_SIGNING_PRIVATE_KEY
  ) {
    return new CloudflareStreamAdapter({
      accountId: env.VIDEO_PROVIDER_ACCOUNT_ID,
      apiToken: env.VIDEO_PROVIDER_API_TOKEN,
      signingKeyId: env.VIDEO_PROVIDER_SIGNING_KEY_ID,
      signingPrivateKey: env.VIDEO_PROVIDER_SIGNING_PRIVATE_KEY,
      webhookSecret: env.VIDEO_PROVIDER_WEBHOOK_SECRET,
    });
  }
  return new UnconfiguredVideoProviderAdapter();
}

export * from "./interface";
export * from "./fake";
export * from "./cloudflare-stream";
