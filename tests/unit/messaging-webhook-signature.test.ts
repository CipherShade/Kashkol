import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "@/modules/messaging/webhook-signature";

const SECRET = "test-app-secret-that-is-long-enough";

function sign(body: string, secret = SECRET) {
  return `sha256=${crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

describe("Meta webhook signature", () => {
  it("accepts a signature computed over the exact raw body", () => {
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    expect(verifyMetaWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a body changed after signing", () => {
    const body = JSON.stringify({ object: "whatsapp_business_account" });
    expect(verifyMetaWebhookSignature(`${body} `, sign(body), SECRET)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const body = JSON.stringify({ object: "whatsapp_business_account" });
    expect(verifyMetaWebhookSignature(body, sign(body, "another-secret"), SECRET)).toBe(false);
  });

  it("rejects a missing, malformed, or non-sha256 header", () => {
    const body = "{}";
    expect(verifyMetaWebhookSignature(body, null, SECRET)).toBe(false);
    expect(verifyMetaWebhookSignature(body, "sha1=abcdef", SECRET)).toBe(false);
    expect(verifyMetaWebhookSignature(body, "sha256=not-hex", SECRET)).toBe(false);
    expect(verifyMetaWebhookSignature(body, `sha256=${"a".repeat(63)}`, SECRET)).toBe(false);
  });
});

describe("Meta webhook verification challenge", () => {
  const params = (overrides: Record<string, string> = {}) =>
    new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "verify-token",
      "hub.challenge": "challenge-value",
      ...overrides,
    });

  it("returns the challenge when mode and token match", () => {
    expect(verifyMetaWebhookChallenge(params(), "verify-token")).toBe("challenge-value");
  });

  it("rejects a wrong token or wrong mode", () => {
    expect(verifyMetaWebhookChallenge(params(), "other-token")).toBeNull();
    expect(
      verifyMetaWebhookChallenge(params({ "hub.mode": "unsubscribe" }), "verify-token"),
    ).toBeNull();
  });

  it("rejects an unconfigured token instead of accepting an empty match", () => {
    expect(verifyMetaWebhookChallenge(params(), undefined)).toBeNull();
    expect(verifyMetaWebhookChallenge(params({ "hub.verify_token": "" }), "verify-token")).toBeNull();
  });

  it("rejects a missing challenge", () => {
    expect(verifyMetaWebhookChallenge(params({ "hub.challenge": "" }), "verify-token")).toBeNull();
  });
});
