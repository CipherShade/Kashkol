import type { BetterAuthOptions } from "better-auth";
import type { ServerEnv } from "@/lib/config/env";
import { isEmailConfigured, usesSecureCookies } from "@/lib/config/env";
import { authHooks, recordPasswordReset } from "@/modules/identity/hooks";
import {
  createEmailTransport,
  passwordResetEmail,
  verificationEmail,
} from "@/modules/identity/email";
import { SESSION_SLIDING_DAYS } from "@/lib/auth/session-policy";

/**
 * The non-database part of the Better Auth configuration, exported so the
 * cookie, session, and rate-limit policy can be unit-tested without a database.
 *
 * Official API references used for the pinned `better-auth@1.7.12`:
 * - session management: expiresIn / updateAge / freshAge
 * - email & password: requireEmailVerification, sendResetPassword,
 *   resetPasswordTokenExpiresIn
 * - email verification: sendVerificationEmail, sendOnSignUp, expiresIn
 * - rate limit: storage: "database", customRules
 * - cookies: cookiePrefix, useSecureCookies, defaultCookieAttributes
 * - hooks: before/after via createAuthMiddleware
 */
export function buildAuthOptions(env: ServerEnv): Omit<BetterAuthOptions, "database" | "plugins"> {
  const secure = usesSecureCookies(env);
  const email = createEmailTransport(env);
  const emailConfigured = isEmailConfigured(env) && email.configured;
  const trustedOrigin = new URL(env.BETTER_AUTH_URL).origin;
  const rateLimitEnabled = env.AUTH_RATE_LIMIT_ENABLED ?? env.APP_ENV !== "local";

  return {
    appName: "Kashkol",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [trustedOrigin],
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      // Server-side minimum, mirrored by the shared Zod schema.
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: emailConfigured,
      // When verification is required, the user only gets a session after the
      // link is opened; when no transport exists, sign-up continues locally.
      autoSignIn: !emailConfigured,
      // Single-use, 30 minutes, invalidated on use (`F-P0-02` AC-8).
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        if (!email.configured) return;
        await email.send(passwordResetEmail(user.email, url));
      },
      onPasswordReset: async ({ user }, request) => {
        await recordPasswordReset(user, request);
      },
    },
    emailVerification: {
      sendOnSignUp: emailConfigured,
      sendOnSignIn: false,
      autoSignInAfterVerification: true,
      // 24 hours, single use (`F-P0-02` AC-2).
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        if (!email.configured) return;
        await email.send(verificationEmail(user.email, url));
      },
    },
    session: {
      // Sliding 30 days of inactivity; the application also enforces the
      // 12-hour idle timeout and the 90-day absolute cap.
      expiresIn: SESSION_SLIDING_DAYS * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      freshAge: 12 * 60 * 60,
    },
    rateLimit: {
      // Database storage survives a restart and is shared by every instance.
      enabled: rateLimitEnabled,
      storage: "database",
      modelName: "rateLimit",
      window: 10,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 10, max: 3 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 10, max: 3 },
        "/send-verification-email": { window: 60, max: 1 },
        "/reset-password": { window: 10, max: 5 },
        "/verify-email": { window: 60, max: 10 },
      },
    },
    advanced: {
      useSecureCookies: secure,
      // `__Host-` requires Secure, Path=/ and no Domain. In local development
      // the server is plain HTTP, so the prefix is not used there.
      cookiePrefix: secure ? "__Host-kashkol" : "kashkol",
      defaultCookieAttributes: {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
      },
      // Trust one header that the platform proxy sets. A comma-separated
      // forwarded chain is not trusted (SECURITY_AND_PRIVACY.md §3.3).
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
      disableCSRFCheck: false,
      disableOriginCheck: false,
    },
    hooks: authHooks,
    // Keep the compiler honest about which options are deliberately absent.
  } satisfies Omit<BetterAuthOptions, "database" | "plugins">;
}
