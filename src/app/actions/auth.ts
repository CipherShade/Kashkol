"use server";

import { APIError } from "better-auth/api";
import { hasLocale } from "next-intl";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/auth";
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
import {
  fieldErrorsFrom,
  requestPasswordResetSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
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
  let destination = `/${locale}/app`;
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
