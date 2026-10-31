import { z } from "zod";

const appEnvSchema = z.enum(["local", "staging", "production"]);

const serverEnvSchema = z
  .object({
    APP_ENV: appEnvSchema.default("local"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DIRECT_DATABASE_URL: z.string().min(1).optional(),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    BETTER_AUTH_URL: z.string().min(1, "BETTER_AUTH_URL is required"),
    REQUIRE_MIGRATIONS: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    /**
     * Outbound email is not selected yet (INTEGRATIONS.md §1.1). The only
     * transport this foundation implements writes verification and reset links
     * to the server console, and it refuses to run outside `local`.
     */
    EMAIL_TRANSPORT: z.enum(["console", "none"]).default("none"),
    EMAIL_FROM: z.string().min(3).default("Kashkol <no-reply@kashkol.local>"),
    AUTH_RATE_LIMIT_ENABLED: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "true")),
    FILE_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    FILE_LOCAL_STORAGE_PATH: z.string().min(1).default(".data/files"),
    REPORT_EXPORT_WORKER_TOKEN: z.string().min(32).optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).optional(),
    S3_ENDPOINT: z.url().optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    CLAMAV_HOST: z.string().min(1).optional(),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
    WEB_PUSH_VAPID_SUBJECT: z.string().min(5).optional(),
    WEB_PUSH_VAPID_PUBLIC_KEY: z.string().min(16).optional(),
    WEB_PUSH_VAPID_PRIVATE_KEY: z.string().min(16).optional(),
    VIDEO_PROVIDER_DRIVER: z.enum(["none", "cloudflare_stream", "fake"]).default("none"),
    VIDEO_PROVIDER_ACCOUNT_ID: z.string().min(4).optional(),
    VIDEO_PROVIDER_API_TOKEN: z.string().min(16).optional(),
    VIDEO_PROVIDER_SIGNING_SECRET: z.string().min(16).optional(),
    VIDEO_PROVIDER_WEBHOOK_SECRET: z.string().min(16).optional(),
    VIDEO_MAX_COUNT_PER_WORKSPACE: z.coerce.number().int().min(1).max(10_000).default(50),
    VIDEO_MAX_STORAGE_BYTES_PER_WORKSPACE: z.coerce
      .number()
      .int()
      .min(1_048_576)
      .default(5_368_709_120),
    VIDEO_MAX_BANDWIDTH_BYTES_PER_MONTH: z.coerce
      .number()
      .int()
      .min(1_048_576)
      .default(53_687_091_200),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== "local" && env.EMAIL_TRANSPORT === "console") {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_TRANSPORT"],
        message: "EMAIL_TRANSPORT=console is local-only",
      });
    }
    if (env.APP_ENV !== "local" && !env.BETTER_AUTH_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "BETTER_AUTH_URL must be HTTPS outside local development",
      });
    }
    if (env.APP_ENV === "production" && env.EMAIL_TRANSPORT === "none") {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_TRANSPORT"],
        message: "production requires a configured email transport",
      });
    }
    if (env.APP_ENV === "production" && env.BETTER_AUTH_SECRET.startsWith("dev-only")) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message: "the development secret is not allowed in production",
      });
    }
    if (env.APP_ENV !== "local" && env.FILE_STORAGE_DRIVER !== "s3") {
      ctx.addIssue({
        code: "custom",
        path: ["FILE_STORAGE_DRIVER"],
        message: "non-local environments require S3-compatible storage",
      });
    }
    if (env.FILE_STORAGE_DRIVER === "s3" && (!env.S3_BUCKET || !env.S3_REGION)) {
      ctx.addIssue({
        code: "custom",
        path: ["S3_BUCKET"],
        message: "S3_BUCKET and S3_REGION are required when S3 storage is enabled",
      });
    }
    if (Boolean(env.S3_ACCESS_KEY_ID) !== Boolean(env.S3_SECRET_ACCESS_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: ["S3_ACCESS_KEY_ID"],
        message: "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together",
      });
    }
    if (env.APP_ENV !== "local" && !env.CLAMAV_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["CLAMAV_HOST"],
        message: "non-local environments require a configured ClamAV service",
      });
    }
    if (env.APP_ENV !== "local" && !env.REPORT_EXPORT_WORKER_TOKEN) {
      ctx.addIssue({
        code: "custom",
        path: ["REPORT_EXPORT_WORKER_TOKEN"],
        message: "non-local environments require an authenticated report export worker",
      });
    }
    const hasPublicVapid = Boolean(env.WEB_PUSH_VAPID_PUBLIC_KEY);
    const hasPrivateVapid = Boolean(env.WEB_PUSH_VAPID_PRIVATE_KEY);
    if (hasPublicVapid !== hasPrivateVapid) {
      ctx.addIssue({
        code: "custom",
        path: ["WEB_PUSH_VAPID_PUBLIC_KEY"],
        message:
          "WEB_PUSH_VAPID_PUBLIC_KEY and WEB_PUSH_VAPID_PRIVATE_KEY must be configured together",
      });
    }
    if ((hasPublicVapid || hasPrivateVapid) && !env.WEB_PUSH_VAPID_SUBJECT) {
      ctx.addIssue({
        code: "custom",
        path: ["WEB_PUSH_VAPID_SUBJECT"],
        message: "WEB_PUSH_VAPID_SUBJECT is required when Web Push VAPID keys are configured",
      });
    }
    if (env.APP_ENV !== "local" && env.VIDEO_PROVIDER_DRIVER === "fake") {
      ctx.addIssue({
        code: "custom",
        path: ["VIDEO_PROVIDER_DRIVER"],
        message: "VIDEO_PROVIDER_DRIVER=fake is local/test-only",
      });
    }
    if (env.VIDEO_PROVIDER_DRIVER === "cloudflare_stream") {
      if (!env.VIDEO_PROVIDER_ACCOUNT_ID) {
        ctx.addIssue({
          code: "custom",
          path: ["VIDEO_PROVIDER_ACCOUNT_ID"],
          message:
            "VIDEO_PROVIDER_ACCOUNT_ID is required when VIDEO_PROVIDER_DRIVER=cloudflare_stream",
        });
      }
      if (!env.VIDEO_PROVIDER_API_TOKEN) {
        ctx.addIssue({
          code: "custom",
          path: ["VIDEO_PROVIDER_API_TOKEN"],
          message:
            "VIDEO_PROVIDER_API_TOKEN is required when VIDEO_PROVIDER_DRIVER=cloudflare_stream",
        });
      }
      if (!env.VIDEO_PROVIDER_SIGNING_SECRET) {
        ctx.addIssue({
          code: "custom",
          path: ["VIDEO_PROVIDER_SIGNING_SECRET"],
          message:
            "VIDEO_PROVIDER_SIGNING_SECRET is required when VIDEO_PROVIDER_DRIVER=cloudflare_stream",
        });
      }
    }
  });

export type ServerEnv = {
  APP_ENV: "local" | "staging" | "production";
  DATABASE_URL: string;
  DIRECT_DATABASE_URL?: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  REQUIRE_MIGRATIONS: boolean;
  EMAIL_TRANSPORT: "console" | "none";
  EMAIL_FROM: string;
  AUTH_RATE_LIMIT_ENABLED?: boolean;
  FILE_STORAGE_DRIVER: "local" | "s3";
  FILE_LOCAL_STORAGE_PATH: string;
  REPORT_EXPORT_WORKER_TOKEN?: string;
  S3_BUCKET?: string;
  S3_REGION?: string;
  S3_ENDPOINT?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_FORCE_PATH_STYLE: boolean;
  CLAMAV_HOST?: string;
  CLAMAV_PORT: number;
  WEB_PUSH_VAPID_SUBJECT?: string;
  WEB_PUSH_VAPID_PUBLIC_KEY?: string;
  WEB_PUSH_VAPID_PRIVATE_KEY?: string;
  VIDEO_PROVIDER_DRIVER: "none" | "cloudflare_stream" | "fake";
  VIDEO_PROVIDER_ACCOUNT_ID?: string;
  VIDEO_PROVIDER_API_TOKEN?: string;
  VIDEO_PROVIDER_SIGNING_SECRET?: string;
  VIDEO_PROVIDER_WEBHOOK_SECRET?: string;
  VIDEO_MAX_COUNT_PER_WORKSPACE: number;
  VIDEO_MAX_STORAGE_BYTES_PER_WORKSPACE: number;
  VIDEO_MAX_BANDWIDTH_BYTES_PER_MONTH: number;
};

/**
 * Parse and validate server configuration. The error lists the missing or
 * invalid keys but never echoes their values.
 */
export function parseServerEnv(input: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(input);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))].join(", ");
    throw new Error(`Invalid server configuration: ${keys}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  const localDefaults: Record<string, string> = {
    APP_ENV: "local",
    DATABASE_URL: "postgresql://kashkol_app:kashkol_dev_app@localhost:5433/kashkol_dev",
    DIRECT_DATABASE_URL: "postgresql://kashkol:kashkol_dev@localhost:5433/kashkol_dev",
    BETTER_AUTH_SECRET: "dev-only-secret-for-local-environment-at-least-32-chars",
    BETTER_AUTH_URL: "http://localhost:3000",
    EMAIL_TRANSPORT: "console",
  };
  const merged: Record<string, string | undefined> = { ...localDefaults };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && value !== "") {
      merged[key] = value;
    }
  }
  cached ??= parseServerEnv(merged);
  return cached;
}

export function resetServerEnvForTests(): void {
  cached = undefined;
}

export function isProduction(env: Pick<ServerEnv, "APP_ENV"> = getServerEnv()): boolean {
  return env.APP_ENV === "production" || process.env.NODE_ENV === "production";
}

/** True when a transport that can actually deliver a message is configured. */
export function isEmailConfigured(
  env: Pick<ServerEnv, "EMAIL_TRANSPORT"> = getServerEnv(),
): boolean {
  return env.EMAIL_TRANSPORT === "console";
}

/** True when VAPID keys and subject are configured for Web Push notifications. */
export function isWebPushConfigured(
  env: Pick<
    ServerEnv,
    "WEB_PUSH_VAPID_SUBJECT" | "WEB_PUSH_VAPID_PUBLIC_KEY" | "WEB_PUSH_VAPID_PRIVATE_KEY"
  > = getServerEnv(),
): boolean {
  return Boolean(
    env.WEB_PUSH_VAPID_SUBJECT &&
      env.WEB_PUSH_VAPID_PUBLIC_KEY &&
      env.WEB_PUSH_VAPID_PRIVATE_KEY,
  );
}

/** True when an external recorded-video provider (or local test fake) is configured. */
export function isVideoProviderConfigured(
  env: Pick<
    ServerEnv,
    | "VIDEO_PROVIDER_DRIVER"
    | "VIDEO_PROVIDER_ACCOUNT_ID"
    | "VIDEO_PROVIDER_API_TOKEN"
    | "VIDEO_PROVIDER_SIGNING_SECRET"
  > = getServerEnv(),
): boolean {
  if (env.VIDEO_PROVIDER_DRIVER === "fake") {
    return true;
  }
  if (env.VIDEO_PROVIDER_DRIVER === "cloudflare_stream") {
    return Boolean(
      env.VIDEO_PROVIDER_ACCOUNT_ID &&
        env.VIDEO_PROVIDER_API_TOKEN &&
        env.VIDEO_PROVIDER_SIGNING_SECRET,
    );
  }
  return false;
}

/**
 * Cookies are `__Host-` prefixed and `Secure` everywhere except the loopback
 * development server, where a Secure cookie would never be sent.
 */
export function usesSecureCookies(
  env: Pick<ServerEnv, "APP_ENV" | "BETTER_AUTH_URL"> = getServerEnv(),
): boolean {
  return env.APP_ENV !== "local";
}
