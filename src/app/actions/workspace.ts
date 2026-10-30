"use server";

import { hasLocale } from "next-intl";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerEnv } from "@/lib/config/env";
import {
  errorState,
  initialFormState,
  noticeState,
  type FormActionState,
} from "@/lib/forms/action-state";
import { AppError } from "@/lib/http/errors";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { actionRequestContext } from "@/lib/http/request-context";
import { routing } from "@/i18n/routing";
import { getStaffGate, requireStaffSession } from "@/modules/identity/session";
import { signOutEverywhere } from "@/modules/identity/preferences";
import { createWorkspace, updateWorkspaceProfile } from "@/modules/tenancy/service";
import {
  createWorkspaceSchema,
  fieldErrorsFrom,
  parseGrades,
  updateWorkspaceSchema,
} from "@/modules/tenancy/schemas";

function localeFrom(formData: FormData): string {
  const raw = formData.get("locale");
  return typeof raw === "string" && hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function guardOrigin(): Promise<void> {
  const env = getServerEnv();
  assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);
}

function workspaceInputFrom(formData: FormData) {
  return {
    name: text(formData, "name"),
    teachingName: text(formData, "teachingName"),
    primarySubject: text(formData, "primarySubject"),
    gradesTaught: parseGrades(formData.get("gradesTaught")),
    atRiskAfter: text(formData, "atRiskAfter") || "2",
    inactiveAfter: text(formData, "inactiveAfter") || "4",
    locale: text(formData, "workspaceLocale") || localeFrom(formData),
    theme: text(formData, "theme") || "system",
    timezone: text(formData, "timezone") || "Africa/Cairo",
    currency: text(formData, "currency") || "EGP",
  };
}

export async function createWorkspaceAction(
  _previous: FormActionState = initialFormState,
  formData: FormData,
): Promise<FormActionState> {
  const locale = localeFrom(formData);
  try {
    await guardOrigin();
  } catch (error) {
    return errorState(error instanceof AppError ? error.messageKey : "errors.forbidden");
  }

  const gate = await getStaffGate();
  if (gate.state === "anonymous") redirect(`/${locale}/sign-in`);
  if (gate.state === "staff") redirect(`/${locale}/app`);

  const parsed = createWorkspaceSchema.safeParse(workspaceInputFrom(formData));
  if (!parsed.success) {
    return errorState("errors.validationFailed", fieldErrorsFrom(parsed.error));
  }

  try {
    await createWorkspace(
      { userId: gate.user.id, displayName: gate.user.name },
      parsed.data,
      await actionRequestContext(),
    );
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "CONFLICT") {
        return errorState(error.messageKey);
      }
      return errorState(error.messageKey);
    }
    return errorState("workspace.errors.createFailed");
  }

  redirect(`/${locale}/app`);
}

export async function updateWorkspaceAction(
  _previous: FormActionState = initialFormState,
  formData: FormData,
): Promise<FormActionState> {
  const locale = localeFrom(formData);
  try {
    await guardOrigin();
  } catch (error) {
    return errorState(error instanceof AppError ? error.messageKey : "errors.forbidden");
  }

  let scope;
  try {
    const session = await requireStaffSession();
    scope = session.scope;
  } catch {
    return errorState("errors.noWorkspace");
  }

  const parsed = updateWorkspaceSchema.safeParse(workspaceInputFrom(formData));
  if (!parsed.success) {
    return errorState("errors.validationFailed", fieldErrorsFrom(parsed.error));
  }

  try {
    await updateWorkspaceProfile(scope, parsed.data, await actionRequestContext());
  } catch (error) {
    if (error instanceof AppError) return errorState(error.messageKey);
    return errorState("workspace.errors.updateFailed");
  }

  revalidatePath(`/${locale}/app`);
  revalidatePath(`/${locale}/app/settings`);
  return noticeState("workspace.notice.updated");
}

export async function signOutEverywhereAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  try {
    await guardOrigin();
    const session = await requireStaffSession();
    await signOutEverywhere(session.user.id);
  } catch {
    // The redirect below is the user-visible outcome in every case.
  }
  redirect(`/${locale}/sign-in`);
}
