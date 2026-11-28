import { APIError } from "better-auth/api";
import type { BetterAuthOptions } from "better-auth";
import type { ServerEnv } from "@/lib/config/env";
import { isEmailConfigured, usesSecureCookies } from "@/lib/config/env";
import { authHooks, recordPasswordReset } from "@/modules/identity/hooks";
import { normalizeTeacherPhone, saveTeacherPhone } from "@/modules/identity/phone";
import {
  createEmailTransport,
  passwordResetEmail,
  verificationEmail,
} from "@/modules/identity/email";
import { SESSION_SLIDING_DAYS } from "@/lib/auth/session-policy";
import { exactTrustedOrigins } from "@/lib/http/csrf";

/**
 * Social provider configuration is parsed here so unit tests can assert the
 * callback URLs without constructing the full Better Auth client.
 *
 * The Google callback URL is pinned to Better Auth's canonical path:
 * `${BETTER_AUTH_URL}/api/auth/callback/google`
 * The Facebook callback URL follows the same convention:
 * `${BETTER_AUTH_URL}/api/auth/callback/facebook`
 *
 * Credentials are optional — when either `GOOGLE_CLIENT_ID` or
 * `GOOGLE_CLIENT_SECRET` is missing, Google is simply not offered. The same
 * applies to Facebook. Email/password authentication is never affected.
 */
export function socialProviderConfig(env: ServerEnv) {
  return {
    google: {
      enabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
      callbackURL: `${env.BETTER_AUTH_URL}/api/auth/callback/google`,
    },
    facebook: {
      enabled: Boolean(env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET),
      clientId: env.FACEBOOK_CLIENT_ID ?? "",
      clientSecret: env.FACEBOOK_CLIENT_SECRET ?? "",
      callbackURL: `${env.BETTER_AUTH_URL}/api/auth/callback/facebook`,
    },
  };
}

type PhoneHookContext = { path?: string; body?: unknown } | null;

function isCredentialSignUp(context: PhoneHookContext): boolean {
  // Social registration has no phone field in the OAuth request; it is collected
  // by /complete-phone after the session exists. Direct calls to the public
  // email sign-up endpoint must carry the phone (ADR-0052).
  return context?.path === "/sign-up/email";
}

function phoneFromBody(context: PhoneHookContext): unknown {
  if (!context?.body || typeof context.body !== "object") return null;
  return (context.body as { phone?: unknown }).phone ?? null;
}

function invalidTeacherPhone(): APIError {
  // The message is generic and never contains the submitted value. Field-level
  // translated errors are produced by the server action before this endpoint.
  return new APIError("BAD_REQUEST", {
    message: "A valid phone number is required.",
    code: "INVALID_TEACHER_PHONE",
  });
}

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

  // Collect exact additional trusted origins from the env var that Better Auth
  // also reads natively. We duplicate them here so the application-level option
  // is explicit and testable. Wildcards are never accepted; in production this
  // list must only contain the deployment origin.
  const extraTrustedOrigins = exactTrustedOrigins(env.BETTER_AUTH_TRUSTED_ORIGINS ?? "");

  return {
    appName: "Kashkol",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [trustedOrigin, ...extraTrustedOrigins],
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      // Server-side minimum, mirrored by the shared Zod schema.
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: emailConfigured,
      // Sign-up never auto-signs-in. When verification is required the session
      // is withheld until the link is opened; when no transport exists the
      // person signs in with the password they just chose. This is also what
      // makes the registration response non-enumerable: Better Auth returns a
      // synthetic success for a duplicate email only when sign-up does not
      // auto-sign-in (`autoSignIn === false`), so the status, the body, and the
      // absence of a session cookie are identical for a new and an existing
      // address (`SECURITY_AND_PRIVACY.md` §3.1).
      autoSignIn: false,
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
    account: {
      // Explicit account linking only (approved social-auth plan). Linking an
      // OAuth identity happens exclusively via `linkSocial()` while the user is
      // authenticated. A social sign-in that matches an existing account by
      // email is rejected instead of silently linked.
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
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
    databaseHooks: {
      user: {
        create: {
          before: async (_user, context) => {
            if (!isCredentialSignUp(context as PhoneHookContext)) return;
            if (normalizeTeacherPhone(phoneFromBody(context as PhoneHookContext)) === null) {
              throw invalidTeacherPhone();
            }
          },
          after: async (user, context) => {
            if (!isCredentialSignUp(context as PhoneHookContext)) return;
            const phone = normalizeTeacherPhone(phoneFromBody(context as PhoneHookContext));
            if (phone === null) throw invalidTeacherPhone();
            await saveTeacherPhone(user.id, phone);
          },
        },
      },
    },
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              enabled: true,
            },
          }
        : {}),
      ...(env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET
        ? {
            facebook: {
              clientId: env.FACEBOOK_CLIENT_ID,
              clientSecret: env.FACEBOOK_CLIENT_SECRET,
              enabled: true,
            },
          }
        : {}),
    },
    // Keep the compiler honest about which options are deliberately absent.
  } satisfies Omit<BetterAuthOptions, "database" | "plugins">;
}
