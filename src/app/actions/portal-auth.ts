"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { getAuth } from "@/lib/auth/auth";
import { getServerEnv } from "@/lib/config/env";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { actionRequestContext } from "@/lib/http/request-context";
import {
  errorState,
  initialFormState,
  type FormActionState,
} from "@/lib/forms/action-state";
import { AppError } from "@/lib/http/errors";
import { resolveStudentPortalSignIn } from "@/modules/portals";
import { portalSignInSchema } from "@/modules/portals/schemas";
import { recordPortalSignInSuccess } from "@/modules/identity/lockout";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function localeFrom(formData: FormData): string {
  return text(formData, "locale") === "en" ? "en" : "ar";
}

function authFailureKey(error: unknown): string {
  if (error instanceof APIError) {
    const status = String(error.status);
    if (status === "429" || status === "TOO_MANY_REQUESTS") return "auth.errors.rateLimited";
  }
  return "auth.errors.generic";
}

export async function studentPortalSignInAction(
  _previous: FormActionState = initialFormState,
  formData: FormData,
): Promise<FormActionState> {
  const locale = localeFrom(formData);
  try {
    const env = getServerEnv();
    assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);
  } catch (error) {
    return errorState(error instanceof AppError ? error.messageKey : "errors.forbidden");
  }

  const ctx = await actionRequestContext();
  const parsed = portalSignInSchema.safeParse({
    phone: text(formData, "phone"),
    password: text(formData, "password"),
  });
  if (!parsed.success) {
    // Same generic key as a wrong password: the form must not reveal anything.
    return errorState("auth.errors.invalidCredentials");
  }

  let resolved;
  try {
    resolved = await resolveStudentPortalSignIn(parsed.data, ctx);
  } catch (error) {
    if (error instanceof AppError) {
      return errorState(error.messageKey);
    }
    return errorState("errors.generic");
  }

  try {
    // The synthetic, non-deliverable email resolves internally; the student
    // never sees it, and sign-in happens with the teacher-generated password.
    await getAuth().api.signInEmail({
      body: { email: resolved.email, password: parsed.data.password },
      headers: await headers(),
    });
  } catch (error) {
    return errorState(authFailureKey(error));
  }

  await recordPortalSignInSuccess(
    resolved.phone,
    resolved.userId,
    { requestId: ctx.requestId, ipHash: ctx.ipHash, userAgentHash: null },
  );

  redirect(`/${locale}/portal/student`);
}
