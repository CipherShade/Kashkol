"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getServerEnv } from "@/lib/config/env";
import { errorState, noticeState, type FormActionState } from "@/lib/forms/action-state";
import { AppError } from "@/lib/http/errors";
import { assertTrustedOrigin } from "@/lib/http/csrf";
import { actionRequestContext } from "@/lib/http/request-context";
import { requireStaffSession } from "@/modules/identity/session";
import {
  cancelSessionSchema,
  createOneOffSessionSchema,
  fieldErrorsFrom,
  generateSessionsSchema,
  rescheduleSessionSchema,
  updateSessionSchema,
} from "@/modules/sessions/schemas";
import {
  cancelSession,
  completeSession,
  createOneOffSession,
  generateSessions,
  rescheduleSession,
  startSession,
  updateSession,
} from "@/modules/sessions/service";

async function guardOrigin(): Promise<void> {
  const env = getServerEnv();
  assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);
}

function text(formData: FormData, key: string): string {
  const val = formData.get(key);
  return typeof val === "string" ? val : "";
}

function optionalText(formData: FormData, key: string): string | null {
  const val = text(formData, key).trim();
  return val.length === 0 ? null : val;
}

export async function createOneOffSessionAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    const raw = {
      groupId: optionalText(formData, "groupId"),
      gradeLabel: optionalText(formData, "gradeLabel"),
      startsAt: text(formData, "startsAt"),
      endsAt: optionalText(formData, "endsAt"),
      reason: optionalText(formData, "reason"),
      room: optionalText(formData, "room"),
      location: optionalText(formData, "location"),
      notes: optionalText(formData, "notes"),
    };

    const parsed = createOneOffSessionSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
    }

    await createOneOffSession(scope, parsed.data, ctx);
    revalidatePath("/[locale]/app/sessions");
    return noticeState("Sessions.sessionCreated");
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "CONFLICT") {
        return errorState("Sessions.conflictDetected");
      }
      if (error.code === "NOT_FOUND") {
        return errorState("errors.notFound");
      }
      if (error.code === "VALIDATION_FAILED") {
        return errorState("errors.validationFailed");
      }
    }
    return errorState("errors.unknown");
  }
}

export async function rescheduleSessionAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    const raw = {
      id: text(formData, "id"),
      startsAt: text(formData, "startsAt"),
      endsAt: optionalText(formData, "endsAt"),
      reason: text(formData, "reason"),
      scope: text(formData, "scope") === "series" ? "series" : "single",
    };

    const parsed = rescheduleSessionSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
    }

    await rescheduleSession(scope, parsed.data, ctx);
    revalidatePath("/[locale]/app/sessions");
    return noticeState("Sessions.sessionRescheduled");
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "CONFLICT") {
        return errorState("Sessions.conflictDetected");
      }
      if (error.code === "NOT_FOUND") {
        return errorState("errors.notFound");
      }
    }
    return errorState("errors.unknown");
  }
}

export async function cancelSessionAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    const raw = {
      id: text(formData, "id"),
      reason: text(formData, "reason"),
      scope: text(formData, "scope") === "series" ? "series" : "single",
    };

    const parsed = cancelSessionSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
    }

    await cancelSession(scope, parsed.data, ctx);
    revalidatePath("/[locale]/app/sessions");
    return noticeState("Sessions.sessionCancelled");
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "NOT_FOUND") {
        return errorState("errors.notFound");
      }
    }
    return errorState("errors.unknown");
  }
}

export async function updateSessionAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    const raw = {
      id: text(formData, "id"),
      room: optionalText(formData, "room"),
      location: optionalText(formData, "location"),
      notes: optionalText(formData, "notes"),
    };

    const parsed = updateSessionSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
    }

    await updateSession(scope, parsed.data, ctx);
    revalidatePath("/[locale]/app/sessions");
    return noticeState("Sessions.sessionUpdated");
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "NOT_FOUND") {
        return errorState("errors.notFound");
      }
    }
    return errorState("errors.unknown");
  }
}

export async function startSessionAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    const id = text(formData, "id");
    await startSession(scope, { id }, ctx);
    revalidatePath("/[locale]/app/sessions");
    return noticeState("Sessions.sessionStarted");
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "NOT_FOUND") {
        return errorState("errors.notFound");
      }
      if (error.code === "CONFLICT") {
        return errorState("Sessions.invalidStatus");
      }
    }
    return errorState("errors.unknown");
  }
}

export async function completeSessionAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    const id = text(formData, "id");
    await completeSession(scope, { id }, ctx);
    revalidatePath("/[locale]/app/sessions");
    return noticeState("Sessions.sessionCompleted");
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "NOT_FOUND") {
        return errorState("errors.notFound");
      }
      if (error.code === "CONFLICT") {
        return errorState("Sessions.invalidStatus");
      }
    }
    return errorState("errors.unknown");
  }
}

export async function generateSessionsAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const groupId = text(formData, "groupId");
    const weeksAhead = text(formData, "weeksAhead");
    const parsed = generateSessionsSchema.safeParse({
      groupId,
      weeksAhead: weeksAhead ? Number(weeksAhead) : undefined,
    });
    if (!parsed.success) {
      return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
    }
    await generateSessions(scope, parsed.data);
    revalidatePath("/[locale]/app/sessions");
    return noticeState("Sessions.sessionsGenerated");
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "NOT_FOUND") {
        return errorState("errors.notFound");
      }
    }
    return errorState("errors.unknown");
  }
}
