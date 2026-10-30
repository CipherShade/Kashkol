"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
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
import { requireStaffSession } from "@/modules/identity/session";
import {
  createStudentSchema,
  createStudentNoteSchema,
  updateStudentSchema,
  fieldErrorsFrom,
} from "@/modules/students/schemas";
import {
  archiveStudent,
  createStudent,
  createStudentNote,
  deleteStudent,
  restoreStudent,
  updateStudent,
} from "@/modules/students/service";

async function guardOrigin(): Promise<void> {
  const env = getServerEnv();
  assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);
}

function text(formData: FormData, key: string): string {
  const val = formData.get(key);
  return typeof val === "string" ? val : "";
}

export async function createStudentAction(
  _previous: FormActionState = initialFormState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    const rawGroupIds = formData.getAll("groupIds");
    const groupIds = rawGroupIds
      .map((g) => (typeof g === "string" ? g.trim() : ""))
      .filter((g) => g.length > 0);

    const raw = {
      firstName: text(formData, "firstName"),
      lastName: text(formData, "lastName"),
      grade: text(formData, "grade") || null,
      phone: text(formData, "phone") || null,
      parentName: text(formData, "parentName") || null,
      parentPhone: text(formData, "parentPhone") || null,
      groupIds,
      note: text(formData, "note") || null,
      confirmDuplicate: formData.get("confirmDuplicate") === "true",
    };

    const parsed = createStudentSchema.safeParse(raw);
    if (!parsed.success) {
      return errorState("errors.validationFailed", fieldErrorsFrom(parsed.error));
    }

    const result = await createStudent(scope, parsed.data, ctx);
    if (result.duplicateWarning) {
      return errorState("students.duplicateFoundWarning", {
        duplicateFound: ["true"],
        duplicateCount: [String(result.duplicates.length)],
      });
    }

    revalidatePath("/[locale]/app/students", "page");
    revalidatePath("/[locale]/app/groups", "page");
    revalidatePath("/[locale]/app", "page");

    return noticeState("students.createdSuccess");
  } catch (error) {
    if (error instanceof AppError) {
      return errorState(error.messageKey);
    }
    return errorState("errors.generic");
  }
}

export async function updateStudentAction(
  _previous: FormActionState = initialFormState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    const rawGroupIds = formData.getAll("groupIds");
    const groupIds = rawGroupIds
      .map((g) => (typeof g === "string" ? g.trim() : ""))
      .filter((g) => g.length > 0);

    const raw = {
      id: text(formData, "id"),
      firstName: text(formData, "firstName"),
      lastName: text(formData, "lastName"),
      grade: text(formData, "grade") || null,
      phone: text(formData, "phone") || null,
      parentName: text(formData, "parentName") || null,
      parentPhone: text(formData, "parentPhone") || null,
      groupIds,
      note: text(formData, "note") || null,
      confirmDuplicate: formData.get("confirmDuplicate") === "true",
    };

    const parsed = updateStudentSchema.safeParse(raw);
    if (!parsed.success) {
      return errorState("errors.validationFailed", fieldErrorsFrom(parsed.error));
    }

    const result = await updateStudent(scope, parsed.data, ctx);
    if (result.duplicateWarning) {
      return errorState("students.duplicateFoundWarning", { duplicateFound: ["true"] });
    }

    revalidatePath(`/[locale]/app/students/${parsed.data.id}`, "page");
    revalidatePath("/[locale]/app/students", "page");

    return noticeState("students.updatedSuccess");
  } catch (error) {
    if (error instanceof AppError) {
      return errorState(error.messageKey);
    }
    return errorState("errors.generic");
  }
}

export async function archiveStudentAction(studentId: string): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    await archiveStudent(scope, studentId, ctx);

    revalidatePath("/[locale]/app/students", "page");
    revalidatePath(`/[locale]/app/students/${studentId}`, "page");
    revalidatePath("/[locale]/app", "page");

    return noticeState("students.archivedSuccess");
  } catch (error) {
    if (error instanceof AppError) {
      return errorState(error.messageKey);
    }
    return errorState("errors.generic");
  }
}

export async function restoreStudentAction(studentId: string): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    await restoreStudent(scope, studentId, ctx);

    revalidatePath("/[locale]/app/students", "page");
    revalidatePath(`/[locale]/app/students/${studentId}`, "page");
    revalidatePath("/[locale]/app", "page");

    return noticeState("students.restoredSuccess");
  } catch (error) {
    if (error instanceof AppError) {
      return errorState(error.messageKey);
    }
    return errorState("errors.generic");
  }
}

export async function deleteStudentAction(studentId: string): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    await deleteStudent(scope, studentId, ctx);

    revalidatePath("/[locale]/app/students", "page");
    revalidatePath("/[locale]/app", "page");

    return noticeState("students.deletedSuccess");
  } catch (error) {
    if (error instanceof AppError) {
      return errorState(error.messageKey);
    }
    return errorState("errors.generic");
  }
}

export async function createStudentNoteAction(studentId: string, body: string) {
  await guardOrigin();
  const { scope } = await requireStaffSession();
  const parsed = createStudentNoteSchema.safeParse({ body });
  if (!parsed.success) throw new AppError("VALIDATION_FAILED");
  const note = await createStudentNote(scope, studentId, parsed.data, await actionRequestContext());
  revalidatePath(`/[locale]/app/students/${studentId}`, "page");
  return { id: note.id, body: note.body, createdAt: note.createdAt.toISOString() };
}
