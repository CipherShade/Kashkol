import { describe, expect, it } from "vitest";
import { createEmailTransport } from "@/modules/identity/email";
import { parseServerEnv } from "@/lib/config/env";

const base = {
  APP_ENV: "local",
  DATABASE_URL: "postgresql://app:secret@localhost:5433/kashkol_dev",
  BETTER_AUTH_SECRET: "x".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
} as const;

describe("auth email transport", () => {
  it("uses the console transport locally", () => {
    const transport = createEmailTransport(
      parseServerEnv({ ...base, EMAIL_TRANSPORT: "console" }),
    );
    expect(transport.configured).toBe(true);
  });

  it("uses SMTP when EMAIL_TRANSPORT=smtp and credentials exist", () => {
    const transport = createEmailTransport(
      parseServerEnv({
        ...base,
        EMAIL_TRANSPORT: "smtp",
        SMTP_HOST: "smtp.example.test",
        SMTP_USER: "mailer",
        SMTP_PASS: "secret",
      }),
    );
    expect(transport.configured).toBe(true);
  });

  it("is unconfigured when SMTP credentials are incomplete", () => {
    const transport = createEmailTransport(
      parseServerEnv({ ...base, EMAIL_TRANSPORT: "smtp", SMTP_HOST: "smtp.example.test" }),
    );
    expect(transport.configured).toBe(false);
  });

  it("is unconfigured when no transport is selected", () => {
    const transport = createEmailTransport(
      parseServerEnv({ ...base, EMAIL_TRANSPORT: "none" }),
    );
    expect(transport.configured).toBe(false);
  });
});
