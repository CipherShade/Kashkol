import { describe, it, expect, beforeEach } from "vitest";
import { smtpAdapter } from "@/modules/messaging/adapters/smtp";
import { resetServerEnvForTests } from "@/lib/config/env";

describe("SMTP adapter", () => {
  beforeEach(() => {
    resetServerEnvForTests();
  });

  it("reports disabled when SMTP transport not configured", () => {
    process.env.EMAIL_TRANSPORT = "none";
    expect(smtpAdapter.isEnabled()).toBe(false);
  });

  it("reports enabled when SMTP transport configured", () => {
    process.env.EMAIL_TRANSPORT = "smtp";
    process.env.SMTP_HOST = "smtp.local";
    process.env.SMTP_USER = "test";
    process.env.SMTP_PASS = "secret";
    expect(smtpAdapter.isEnabled()).toBe(true);
  });

  it("returns configuration error when SMTP credentials missing", async () => {
    process.env.EMAIL_TRANSPORT = "smtp";
    process.env.SMTP_HOST = "smtp.local";
    resetServerEnvForTests();
    // omit SMTP_USER / SMTP_PASS
    const result = await smtpAdapter.send({ to: "parent@example.com", body: "test" });
    expect(result.success).toBe(false);
    const msg = (result.error ?? "").toLowerCase();
    expect(msg.includes("missing") || msg.includes("enotfound") || msg.includes("credentials")).toBe(true);
    expect(result.permanent).toBe(false);
  });

  it("sanitizes failure messages (no credential leak)", async () => {
    process.env.EMAIL_TRANSPORT = "smtp";
    process.env.SMTP_HOST = "bad-host.local";
    process.env.SMTP_USER = "secret-user";
    process.env.SMTP_PASS = "super-secret-pass";
    const result = await smtpAdapter.send({ to: "parent@example.com", body: "test" });
    expect(result.success).toBe(false);
    const msg = (result.error ?? "").toLowerCase();
    expect(msg).not.toContain("secret-user");
    expect(msg).not.toContain("super-secret");
    expect(msg).not.toContain("pass");
  });
});
