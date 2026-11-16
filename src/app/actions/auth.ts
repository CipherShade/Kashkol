"use server";

import { APIError } from "better-auth/api";
import { hasLocale } from "next-intl";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/auth";
import { socialProviderConfig } from "@/lib/auth/auth-options";
import { evaluatePassword, passwordRejectionKey } from "@/lib/auth/password-policy";
import { getServerEnv, isEmailConfigured } from "@/lib/config/env";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import {
  errorState,
  initialFormState,
  noticeState,
  type FormActionState,
} from "@/lib/forms/action-state";
import { AppError } from "@/lib/http/errors";
import { routing } from "@/i18n/routing";
import { requireStaffSession } from "@/modules/identity/session";
import {
  fieldErrorsFrom,
  requestPasswordResetSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  socialProviderSchema,
  unlinkAccountSchema,
} from "@/modules/identity/schemas";

function localeFrom(formData: FormData): string {
  const raw = formData.get("locale");
  return typeof raw === "string" && hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function authFailureKey(error: unknown): string {
  if (error instanceof APIError) {
    const status = String(error.status);
    if (status === "429" || status === "TOO_MANY_REQUESTS") return "auth.errors.rateLimited";
    if (status === "403" || status === "FORBIDDEN") return "auth.errors.emailNotVerified";
  }
  return "auth.errors.generic";
}

/** Better Auth's freshness rejection, shared by link and unlink. */
function isSessionNotFresh(error: unknown): boolean {
  return error instanceof APIError && String(error.body?.code) === "SESSION_NOT_FRESH";
}

async function guardOrigin(): Promise<void> {
  const env = getServerEnv();
  assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);
}

export async function signUpAction(
  _previous: FormActionState = initialFormState,
  formData: FormData,
): Promise<FormActionState> {
  const locale = localeFrom(formData);
  try {
    await guardOrigin();
  } catch (error) {
    return errorState(error instanceof AppError ? error.messageKey : "errors.forbidden");
  }

  const parsed = signUpSchema.safeParse({
    name: text(formData, "name"),
    email: text(formData, "email"),
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return errorState("errors.validationFailed", fieldErrorsFrom(parsed.error));
  }

  const policy = evaluatePassword(parsed.data.password, {
    email: parsed.data.email,
    name: parsed.data.name,
  });
  if (!policy.ok) {
    return errorState("errors.validationFailed", {
      password: [passwordRejectionKey(policy.reason)],
    });
  }

  const env = getServerEnv();
  // Sign-up never starts a session. With a transport the address must be
  // confirmed; without one the person signs in with the password just chosen.
  let destination = `/${locale}/sign-in?registered=1`;
  try {
    await getAuth().api.signUpEmail({
      body: {
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
        callbackURL: `${env.BETTER_AUTH_URL}/${locale}/app`,
      },
      headers: await headers(),
    });
    if (isEmailConfigured(env)) {
      destination = `/${locale}/verify-email`;
    }
  } catch (error) {
    return errorState(authFailureKey(error));
  }

  redirect(destination);
}

export async function signInAction(
  _previous: FormActionState = initialFormState,
  formData: FormData,
): Promise<FormActionState> {
  const locale = localeFrom(formData);
  try {
    await guardOrigin();
  } catch (error) {
    return errorState(error instanceof AppError ? error.messageKey : "errors.forbidden");
  }

  const parsed = signInSchema.safeParse({
    email: text(formData, "email"),
    password: text(formData, "password"),
  });
  if (!parsed.success) {
    return errorState("auth.errors.invalidCredentials");
  }

  try {
    await getAuth().api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: await headers(),
    });
  } catch (error) {
    // The same key for "no such account", "wrong password", and "locked out"
    // where the status permits it. Rate limiting is the one honest exception.
    return errorState(authFailureKey(error));
  }

  redirect(`/${locale}/app`);
}

export async function signOutAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  try {
    await guardOrigin();
    await getAuth().api.signOut({ headers: await headers() });
  } catch {
    // A failed sign-out still clears the destination below; the session policy
    // and server-side revocation are the source of truth.
  }
  redirect(`/${locale}/sign-in`);
}

export async function resendVerificationAction(
  _previous: FormActionState = initialFormState,
  formData: FormData,
): Promise<FormActionState> {
  const locale = localeFrom(formData);
  try {
    await guardOrigin();
  } catch {
    return errorState("errors.forbidden");
  }

  const parsed = resendVerificationSchema.safeParse({ email: text(formData, "email") });
  if (!parsed.success) {
    return errorState("errors.validationFailed", fieldErrorsFrom(parsed.error));
  }

  const env = getServerEnv();
  try {
    await getAuth().api.sendVerificationEmail({
      body: {
        email: parsed.data.email,
        callbackURL: `${env.BETTER_AUTH_URL}/${locale}/app`,
      },
      headers: await headers(),
    });
  } catch {
    // Generic success: resending must not reveal whether an account exists.
  }

  return noticeState(
    isEmailConfigured(env) ? "auth.notice.verificationSent" : "auth.notice.emailDisabled",
  );
}

export async function requestPasswordResetAction(
  _previous: FormActionState = initialFormState,
  formData: FormData,
): Promise<FormActionState> {
  const locale = localeFrom(formData);
  try {
    await guardOrigin();
  } catch {
    return errorState("errors.forbidden");
  }

  const parsed = requestPasswordResetSchema.safeParse({ email: text(formData, "email") });
  if (!parsed.success) {
    return errorState("errors.validationFailed", fieldErrorsFrom(parsed.error));
  }

  const env = getServerEnv();
  try {
    await getAuth().api.requestPasswordReset({
      body: {
        email: parsed.data.email,
        redirectTo: `${env.BETTER_AUTH_URL}/${locale}/reset-password`,
      },
      headers: await headers(),
    });
  } catch {
    // Identical response for an account that exists and one that does not.
  }

  return noticeState(
    isEmailConfigured(env) ? "auth.notice.resetSent" : "auth.notice.emailDisabled",
  );
}

export async function resetPasswordAction(
  _previous: FormActionState = initialFormState,
  formData: FormData,
): Promise<FormActionState> {
  const locale = localeFrom(formData);
  try {
    await guardOrigin();
  } catch (error) {
    return errorState(error instanceof AppError ? error.messageKey : "errors.forbidden");
  }

  const parsed = resetPasswordSchema.safeParse({
    token: text(formData, "token"),
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return errorState("errors.validationFailed", fieldErrorsFrom(parsed.error));
  }

  const policy = evaluatePassword(parsed.data.password);
  if (!policy.ok) {
    return errorState("errors.validationFailed", {
      password: [passwordRejectionKey(policy.reason)],
    });
  }

  try {
    await getAuth().api.resetPassword({
      body: { newPassword: parsed.data.password, token: parsed.data.token },
      headers: await headers(),
    });
  } catch (error) {
    return errorState(authFailureKey(error));
  }

  redirect(`/${locale}/sign-in?reset=1`);
}

/**
 * Start a social sign-in (Google or Facebook) for an anonymous visitor.
 *
 * The provider must be configured in this environment; an unconfigured
 * provider is refused with an honest error instead of a provider URL that
 * could never work. Success always leaves this server by redirecting to the
 * provider's authorization URL.
 */
export async function signInSocialAction(
  _previous: FormActionState = initialFormState,
  formData: FormData,
): Promise<FormActionState> {
  const locale = localeFrom(formData);
  try {
    await guardOrigin();
  } catch (error) {
    return errorState(error instanceof AppError ? error.messageKey : "errors.forbidden");
  }

  const parsed = socialProviderSchema.safeParse(text(formData, "provider"));
  if (!parsed.success) {
    return errorState("auth.errors.generic");
  }

  const env = getServerEnv();
  const config = socialProviderConfig(env);
  if (!config[parsed.data].enabled) {
    // The button is hidden when the provider is not configured; a hand-crafted
    // POST gets the same honest answer.
    return errorState("auth.errors.providerUnavailable");
  }

  let url: string | null = null;
  try {
    const result = await getAuth().api.signInSocial({
      body: {
        provider: parsed.data,
        callbackURL: `${env.BETTER_AUTH_URL}/${locale}/app`,
        newUserCallbackURL: `${env.BETTER_AUTH_URL}/${locale}/app`,
        errorCallbackURL: `${env.BETTER_AUTH_URL}/${locale}/sign-in?signInError=1`,
        disableRedirect: true,
      },
      headers: await headers(),
    });
    url = result?.url ?? null;
  } catch {
    // The provider could not be reached or refused the request. The sign-in
    // page shows a generic failure; the specific reason never reaches the UI.
  }

  if (!url) return errorState("auth.errors.socialSignInFailed");
  redirect(url);
}

/**
 * Start linking a social identity to the signed-in staff member's account.
 * Linking is explicit only: Better Auth performs it while the user is
 * authenticated, and implicit linking on sign-in is disabled in the auth
 * configuration. Success always leaves this server by redirecting to the
 * provider's authorization URL.
 */
export async function linkSocialAction(
  _previous: FormActionState = initialFormState,
  formData: FormData,
): Promise<FormActionState> {
  const locale = localeFrom(formData);
  try {
    await guardOrigin();
    await requireStaffSession();
  } catch {
    return errorState("errors.forbidden");
  }

  const parsed = socialProviderSchema.safeParse(text(formData, "provider"));
  if (!parsed.success) {
    return errorState("auth.errors.generic");
  }

  const env = getServerEnv();
  const config = socialProviderConfig(env);
  if (!config[parsed.data].enabled) {
    return errorState("auth.errors.providerUnavailable");
  }

  let url: string | null = null;
  let needsReauth = false;
  try {
    const result = await getAuth().api.linkSocialAccount({
      body: {
        provider: parsed.data,
        callbackURL: `${env.BETTER_AUTH_URL}/${locale}/app/account?linked=1`,
        errorCallbackURL: `${env.BETTER_AUTH_URL}/${locale}/app/account?linkError=1`,
        disableRedirect: true,
      },
      headers: await headers(),
    });
    url = result?.url ?? null;
  } catch (error) {
    // A session older than 12 hours must re-authenticate before a new identity
    // is accepted (`SESSION_NOT_FRESH`). Same-email mismatches, provider
    // outages, and link conflicts all land on the generic failure below.
    needsReauth = isSessionNotFresh(error);
  }

  if (needsReauth) redirect(`/${locale}/app/account?error=reauthRequired`);
  if (!url) return errorState("auth.errors.linkFailed");
  redirect(url);
}

/**
 * Unlink one social identity from the signed-in staff member's account.
 *
 * Refused when the target is the credential account (email/password must stay
 * available as the recovery path) or when the account owns no other sign-in
 * method, so a staff member can never lock themselves out. Better Auth's own
 * `allowUnlinkingAll: false` guard is the second line of defence.
 */
export async function unlinkSocialAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  try {
    await guardOrigin();
    await requireStaffSession();

    const parsed = unlinkAccountSchema.safeParse({ accountId: text(formData, "accountId") });
    if (!parsed.success) throw new Error("invalid account id");

    const requestHeaders = await headers();
    const accounts = await getAuth().api.listUserAccounts({ headers: requestHeaders });
    const target = accounts.find((account) => account.id === parsed.data.accountId);
    if (!target || target.providerId === "credential") throw new Error("cannot unlink");
    if (accounts.length <= 1) throw new Error("last account");

    await getAuth().api.unlinkAccount({
      body: { accountId: parsed.data.accountId },
      headers: requestHeaders,
    });
  } catch (error) {
    redirect(
      `/${locale}/app/account?error=${isSessionNotFresh(error) ? "reauthRequired" : "unlinkFailed"}`,
    );
  }

  redirect(`/${locale}/app/account?unlinked=1`);
}
