import { describe, it, expect, beforeEach, vi } from "vitest";

const sendMail = vi.hoisted(() => vi.fn());

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail })),
  },
}));

import { smtpAdapter } from "@/modules/messaging/adapters/smtp";
import { getMessageAdapter } from "@/modules/messaging/adapters";
import { resetServerEnvForTests } from "@/lib/config/env";

function configure(overrides: Record<string, string | undefined> = {}) {
  process.env.EMAIL_TRANSPORT = "smtp";
  process.env.SMTP_HOST = "smtp.local";
  process.env.SMTP_USER = "smtp-user";
  process.env.SMTP_PASS = "smtp-secret";
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetServerEnvForTests();
}

describe("SMTP adapter", () => {
  beforeEach(() => {
    sendMail.mockReset();
    delete process.env.MESSAGING_PROVIDER;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    resetServerEnvForTests();
  });

  it("reports disabled when SMTP transport not configured", () => {
    process.env.EMAIL_TRANSPORT = "none";
    resetServerEnvForTests();
    expect(smtpAdapter.isEnabled()).toBe(false);
  });

  it("reports enabled when SMTP transport and credentials are configured", () => {
    configure();
    expect(smtpAdapter.isEnabled()).toBe(true);
  });

  it("is selected for email messages independently of WhatsApp", () => {
    configure();
    expect(getMessageAdapter("email")).toBe(smtpAdapter);
  });

  it("fails permanently when SMTP credentials are missing", async () => {
    configure({ SMTP_USER: undefined, SMTP_PASS: undefined });
    const result = await smtpAdapter.send({ to: "parent@example.com", body: "test" });
    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
    expect(result.error).toMatch(/missing/i);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends plain text only and returns the provider message id", async () => {
    configure();
    sendMail.mockResolvedValue({ messageId: "<message-id>" });
    const result = await smtpAdapter.send({
      to: "parent@example.com",
      body: "Hello <b>parent</b>",
      templateKey: "attendance_present",
    });
    expect(result).toEqual({ success: true, providerMessageId: "<message-id>" });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "parent@example.com",
        text: "Hello <b>parent</b>",
        subject: "attendance_present",
      }),
    );
    const payload = sendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.html).toBeUndefined();
  });

  it("sanitizes failure messages (no credential or address leak)", async () => {
    configure();
    sendMail.mockRejectedValue(
      new Error("535 auth failed for smtp-user with smtp-secret to parent@example.com"),
    );
    const result = await smtpAdapter.send({ to: "parent@example.com", body: "test" });
    expect(result.success).toBe(false);
    const msg = result.error ?? "";
    expect(msg).not.toContain("smtp-user");
    expect(msg).not.toContain("smtp-secret");
    expect(msg).not.toContain("parent@example.com");
  });
});
