import { describe, expect, it } from "vitest";
import { buildAuthOptions } from "@/lib/auth/auth-options";
import { parseServerEnv } from "@/lib/config/env";

const base = {
  FILE_STORAGE_DRIVER: "local",
  DATABASE_URL: "postgresql://app:secret@localhost:5433/kashkol_dev",
  BETTER_AUTH_SECRET: "x".repeat(40),
};

const localEnv = parseServerEnv({
  ...base,
  APP_ENV: "local",
  BETTER_AUTH_URL: "http://localhost:3000",
  EMAIL_TRANSPORT: "console",
});

const stagingEnv = parseServerEnv({
  ...base,
  APP_ENV: "staging",
  BETTER_AUTH_URL: "https://staging.kashkol.test",
  EMAIL_TRANSPORT: "none",
  FILE_STORAGE_DRIVER: "s3",
  S3_BUCKET: "kashkol-test",
  S3_REGION: "us-east-1",
  CLAMAV_HOST: "clamav.internal",
  REPORT_EXPORT_WORKER_TOKEN: "w".repeat(32),
  MESSAGING_WORKER_TOKEN: "m".repeat(32),
});

describe("Better Auth configuration", () => {
  it("uses Secure, HttpOnly, SameSite=Lax cookies with __Host- outside local", () => {
    const options = buildAuthOptions(stagingEnv);
    expect(options.advanced?.useSecureCookies).toBe(true);
    expect(options.advanced?.cookiePrefix).toBe("__Host-kashkol");
    expect(options.advanced?.defaultCookieAttributes).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("does not force a Secure cookie over the loopback development server", () => {
    const options = buildAuthOptions(localEnv);
    expect(options.advanced?.useSecureCookies).toBe(false);
    expect(options.advanced?.cookiePrefix).toBe("kashkol");
    expect(options.advanced?.defaultCookieAttributes?.secure).toBe(false);
  });

  it("sets the 30-day sliding session and a 12-hour freshness window", () => {
    const options = buildAuthOptions(localEnv);
    expect(options.session?.expiresIn).toBe(30 * 24 * 60 * 60);
    expect(options.session?.updateAge).toBe(24 * 60 * 60);
    expect(options.session?.freshAge).toBe(12 * 60 * 60);
  });

  it("enables database-backed rate limiting with per-endpoint rules", () => {
    const options = buildAuthOptions(stagingEnv);
    expect(options.rateLimit?.storage).toBe("database");
    expect(options.rateLimit?.enabled).toBe(true);
    expect(options.rateLimit?.customRules?.["/sign-in/email"]).toEqual({ window: 10, max: 3 });
  });

  it("requires email verification only when a transport is configured", () => {
    expect(buildAuthOptions(localEnv).emailAndPassword?.requireEmailVerification).toBe(true);
    expect(buildAuthOptions(stagingEnv).emailAndPassword?.requireEmailVerification).toBe(false);
    expect(buildAuthOptions(stagingEnv).emailVerification?.sendOnSignUp).toBe(false);
  });

  it("uses a 30-minute single-use reset token and revokes sessions on reset", () => {
    const options = buildAuthOptions(localEnv);
    expect(options.emailAndPassword?.resetPasswordTokenExpiresIn).toBe(30 * 60);
    expect(options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
    expect(options.emailVerification?.expiresIn).toBe(24 * 60 * 60);
  });

  it("never disables the library's CSRF or origin checks", () => {
    const options = buildAuthOptions(stagingEnv);
    expect(options.advanced?.disableCSRFCheck).toBe(false);
    expect(options.advanced?.disableOriginCheck).toBe(false);
  });
});

describe("production configuration guards", () => {
  it("refuses the console email transport outside local", () => {
    expect(() =>
      parseServerEnv({
        ...base,
        APP_ENV: "staging",
        BETTER_AUTH_URL: "https://staging.kashkol.test",
        EMAIL_TRANSPORT: "console",
      }),
    ).toThrow(/EMAIL_TRANSPORT/);
  });

  it("refuses production without an email transport", () => {
    expect(() =>
      parseServerEnv({
        ...base,
        APP_ENV: "production",
        BETTER_AUTH_URL: "https://kashkol.test",
        EMAIL_TRANSPORT: "none",
      }),
    ).toThrow(/EMAIL_TRANSPORT/);
  });

  it("refuses a development secret and a non-HTTPS base URL in production", () => {
    expect(() =>
      parseServerEnv({
        ...base,
        APP_ENV: "production",
        BETTER_AUTH_URL: "http://kashkol.test",
        BETTER_AUTH_SECRET: "dev-only-secret-change-me-0123456789abcdef",
        EMAIL_TRANSPORT: "console",
      }),
    ).toThrow(/BETTER_AUTH_URL|BETTER_AUTH_SECRET|EMAIL_TRANSPORT/);
  });
});
