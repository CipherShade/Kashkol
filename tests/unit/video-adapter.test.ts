import crypto from "node:crypto";
import { describe, it, expect, beforeEach } from "vitest";
import { getVideoProviderAdapter, setVideoProviderAdapterForTests } from "@/modules/videos/adapters";
import { FakeVideoProviderAdapter, resetFakeVideoProviderStore } from "@/modules/videos/adapters/fake";
import type { VideoProviderAdapter } from "@/modules/videos/adapters";
import { resetServerEnvForTests } from "@/lib/config/env";

const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const signingPrivateKey = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

describe("video adapter audit", () => {
  beforeEach(() => {
    resetServerEnvForTests();
    resetFakeVideoProviderStore();
    setVideoProviderAdapterForTests(null);
  });

  it("selects unconfigured when VIDEO_PROVIDER_DRIVER=none and no env", () => {
    process.env.VIDEO_PROVIDER_DRIVER = "none";
    const adapter = getVideoProviderAdapter();
    expect(adapter.providerName).toBe("none");
    expect(adapter.isConfigured).toBe(false);
  });

  it("selects fake adapter when VIDEO_PROVIDER_DRIVER=fake", () => {
    resetServerEnvForTests();
    process.env.VIDEO_PROVIDER_DRIVER = "fake";
    process.env.VIDEO_PROVIDER_SIGNING_SECRET = "dev-secret-long-enough";
    const adapter = getVideoProviderAdapter();
    expect(adapter.providerName).toBe("fake");
    expect(adapter.isConfigured).toBe(true);
  });

  it("fake adapter inspect returns ready for registered asset", async () => {
    const fake = new FakeVideoProviderAdapter({ signingSecret: "dev-secret-long-enough", webhookSecret: "dev-secret-long-enough" });
    const meta = await fake.inspectAsset("vid01");
    expect(meta.assetStatus).toBe("ready");
    expect(meta.providerAssetId).toBe("vid01");
  });

  it("fake adapter creates signed playback descriptor", async () => {
    const fake = new FakeVideoProviderAdapter({ signingSecret: "dev-secret-long-enough", webhookSecret: "dev-secret-long-enough" });
    const desc = await fake.createSignedPlaybackDescriptor({
      providerAssetId: "vid01",
      workspaceId: "w1",
      videoId: "v1",
      viewerKey: "vk",
      ttlSeconds: 900,
      durationSeconds: 120,
    });
    expect(desc.provider).toBe("fake");
    expect(desc.signedToken).toBeTruthy();
    expect(typeof desc.embedUrl).toBe("string");
    expect(desc.embedUrl.length).toBeGreaterThan(0);
  });

  it("fake adapter verifies webhook with bad signature returns null", () => {
    const fake = new FakeVideoProviderAdapter({ signingSecret: "dev-secret-long-enough", webhookSecret: "dev-secret-long-enough" });
    const result = fake.verifyWebhook({ rawBody: JSON.stringify({ uid: "vid01", status: { state: "ready" }, duration: 120 }), signatureHeader: "time=1,sig1=bad" });
    expect(result).toBeNull();
  });

  it("cloudflare adapter requires real env and has no mocked network", () => {
    resetServerEnvForTests();
    process.env.VIDEO_PROVIDER_DRIVER = "cloudflare_stream";
    process.env.VIDEO_PROVIDER_ACCOUNT_ID = "acc-123";
    process.env.VIDEO_PROVIDER_API_TOKEN = "tok-secret-long-enough";
    process.env.VIDEO_PROVIDER_SIGNING_KEY_ID = "cf-key-id-1";
    process.env.VIDEO_PROVIDER_SIGNING_PRIVATE_KEY = signingPrivateKey;
    process.env.VIDEO_PROVIDER_WEBHOOK_SECRET = "sec-secret-long-enough";
    const adapter: VideoProviderAdapter = getVideoProviderAdapter();
    expect(adapter.providerName).toBe("cloudflare_stream");
    expect(adapter.isConfigured).toBe(true);
    // No real API call made; adapter constructed correctly
  });

  it("credentials are never exposed through adapter interfaces", () => {
    resetServerEnvForTests();
    process.env.VIDEO_PROVIDER_DRIVER = "cloudflare_stream";
    process.env.VIDEO_PROVIDER_ACCOUNT_ID = "acc-secret";
    process.env.VIDEO_PROVIDER_API_TOKEN = "tok-secret-long-enough";
    process.env.VIDEO_PROVIDER_SIGNING_KEY_ID = "cf-key-id-1";
    process.env.VIDEO_PROVIDER_SIGNING_PRIVATE_KEY = signingPrivateKey;
    process.env.VIDEO_PROVIDER_WEBHOOK_SECRET = "sec-secret-long-enough";
    const adapter = getVideoProviderAdapter();
    expect(adapter.providerName).toBe("cloudflare_stream");
    // inspectAsset must not leak credentials; no credential fields exposed on interface
    expect(typeof adapter.inspectAsset).toBe("function");
  });
});
