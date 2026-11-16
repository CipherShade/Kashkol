import { describe, expect, it } from "vitest";
import { buildAuthOptions, socialProviderConfig } from "@/lib/auth/auth-options";
import { parseServerEnv } from "@/lib/config/env";
import {
  socialProviderSchema,
  unlinkAccountSchema,
} from "@/modules/identity/schemas";

const base = {
  FILE_STORAGE_DRIVER: "local",
  DATABASE_URL: "postgresql://app:secret@localhost:5433/kashkol_dev",
  BETTER_AUTH_SECRET: "x".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
};

const localEnv = parseServerEnv({
  ...base,
  APP_ENV: "local",
  BETTER_AUTH_URL: "http://localhost:3000",
  EMAIL_TRANSPORT: "console",
});

const googleEnv = parseServerEnv({
  ...base,
  APP_ENV: "local",
  BETTER_AUTH_URL: "http://localhost:3000",
  EMAIL_TRANSPORT: "console",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
});

const bothEnv = parseServerEnv({
  ...base,
  APP_ENV: "staging",
  BETTER_AUTH_URL: "https://staging.kashkol.test",
  EMAIL_TRANSPORT: "none",
  FILE_STORAGE_DRIVER: "s3",
  S3_BUCKET: "kashkol-test",
  S3_REGION: "eu-west-1",
  CLAMAV_HOST: "clamav.internal",
  REPORT_EXPORT_WORKER_TOKEN: "w".repeat(32),
  MESSAGING_WORKER_TOKEN: "m".repeat(32),
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  FACEBOOK_CLIENT_ID: "facebook-client-id",
  FACEBOOK_CLIENT_SECRET: "facebook-client-secret",
});

describe("social provider configuration", () => {
  it("pins the Google and Facebook callback URLs to BETTER_AUTH_URL", () => {
    const config = socialProviderConfig(localEnv);
    expect(config.google.callbackURL).toBe("http://localhost:3000/api/auth/callback/google");
    expect(config.facebook.callbackURL).toBe("http://localhost:3000/api/auth/callback/facebook");
  });

  it("offers no provider when the environment has no credentials", () => {
    const config = socialProviderConfig(localEnv);
    expect(config.google.enabled).toBe(false);
    expect(config.facebook.enabled).toBe(false);
    const options = buildAuthOptions(localEnv);
    expect(options.socialProviders).toEqual({});
  });

  it("refuses a provider when only one credential is present", () => {
    const halfGoogle = parseServerEnv({
      ...base,
      APP_ENV: "local",
      BETTER_AUTH_URL: "http://localhost:3000",
      EMAIL_TRANSPORT: "console",
      GOOGLE_CLIENT_ID: "google-client-id",
    });
    expect(socialProviderConfig(halfGoogle).google.enabled).toBe(false);
    expect(buildAuthOptions(halfGoogle).socialProviders).toEqual({});
  });

  it("offers Google when both credentials are configured, and leaves Facebook off", () => {
    const options = buildAuthOptions(googleEnv);
    expect(options.socialProviders?.google).toMatchObject({
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
      enabled: true,
    });
    expect(options.socialProviders?.facebook).toBeUndefined();
  });

  it("offers both providers with explicit enabled flags", () => {
    const options = buildAuthOptions(bothEnv);
    expect(options.socialProviders?.google).toMatchObject({
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
      enabled: true,
    });
    expect(options.socialProviders?.facebook).toMatchObject({
      clientId: "facebook-client-id",
      clientSecret: "facebook-client-secret",
      enabled: true,
    });
  });

  it("builds the deployment callback URLs from BETTER_AUTH_URL", () => {
    const config = socialProviderConfig(bothEnv);
    expect(config.google.callbackURL).toBe(
      "https://staging.kashkol.test/api/auth/callback/google",
    );
    expect(config.facebook.callbackURL).toBe(
      "https://staging.kashkol.test/api/auth/callback/facebook",
    );
  });
});

describe("account linking policy", () => {
  it("disables implicit linking and forbids cross-email or last-account unlink", () => {
    const options = buildAuthOptions(localEnv);
    expect(options.account?.accountLinking).toEqual({
      enabled: true,
      disableImplicitLinking: true,
      allowDifferentEmails: false,
      allowUnlinkingAll: false,
    });
  });

  it("never trusts a provider implicitly, whatever the environment", () => {
    for (const env of [localEnv, googleEnv, bothEnv]) {
      const options = buildAuthOptions(env);
      expect(options.account?.accountLinking?.disableImplicitLinking).toBe(true);
      expect(options.account?.accountLinking?.trustedProviders).toBeUndefined();
    }
  });
});

describe("environment parsing of the social credentials", () => {
  it("treats missing credentials as absent, not as empty strings", () => {
    const env = parseServerEnv(base);
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(env.FACEBOOK_CLIENT_ID).toBeUndefined();
    expect(env.FACEBOOK_CLIENT_SECRET).toBeUndefined();
  });

  it("refuses an empty credential value instead of silently disabling a provider", () => {
    expect(() => parseServerEnv({ ...base, GOOGLE_CLIENT_ID: "" })).toThrow(
      /GOOGLE_CLIENT_ID/,
    );
  });
});

describe("social input validation", () => {
  it("accepts only the supported providers", () => {
    expect(socialProviderSchema.safeParse("google").success).toBe(true);
    expect(socialProviderSchema.safeParse("facebook").success).toBe(true);
    expect(socialProviderSchema.safeParse("github").success).toBe(false);
    expect(socialProviderSchema.safeParse("GOOGLE").success).toBe(false);
  });

  it("requires an account id to unlink", () => {
    expect(unlinkAccountSchema.safeParse({}).success).toBe(false);
    expect(unlinkAccountSchema.safeParse({ accountId: "" }).success).toBe(false);
    expect(unlinkAccountSchema.safeParse({ accountId: "row-id-123" }).success).toBe(true);
  });
});
