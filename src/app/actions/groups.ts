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
  createGroupSchema,
  enrollStudentSchema,
  removeStudentSchema,
  transferStudentSchema,
  updateGroupSchema,
  fieldErrorsFrom,
} from "@/modules/groups/schemas";
import {
  archiveGroup,
  checkGroupSlotConflicts,
  createGroup,
  enrollStudentInGroup,
  removeStudentFromGroup,
  restoreGroup,
  transferStudentGroup,
  updateGroup,
} from "@/modules/groups/service";

async function guardOrigin(): Promise<void> {
  const env = getServerEnv();
  assertTrustedOrigin(await headers(), env.BETTER_AUTH_URL);
}

function text(formData: FormData, key: string): string {
  const val = formData.get(key);
  return typeof val === "string" ? val : "";
}

export async function createGroupAction(
  _previous: FormActionState = initialFormState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    const raw = {
      name: text(formData, "name"),
      subjectId: text(formData, "subjectId") || null,
      subjectName: text(formData, "subjectName") || null,
      grade: text(formData, "grade") || null,
      room: text(formData, "room") || null,
      color: text(formData, "color") || "indigo",
      weekday: text(formData, "weekday"),
      startTime: text(formData, "startTime"),
      endTime: text(formData, "endTime") || null,
      capacity: text(formData, "capacity") || null,
      teacherNote: text(formData, "teacherNote") || null,
    };

    const parsed = createGroupSchema.safeParse(raw);
    if (!parsed.success) {
      return errorState("errors.validationFailed", fieldErrorsFrom(parsed.error));
    }

    const ignoreConflicts = formData.get("ignoreConflicts") === "true";
    if (!ignoreConflicts) {
      const conflicts = await checkGroupSlotConflicts(scope, {
        weekday: parsed.data.weekday,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime ?? null,
      });

      if (conflicts.length > 0) {
        return errorState("groups.conflictWarning", {
          hasConflict: ["true"],
          conflictingGroupName: [conflicts[0].name],
        });
      }
    }

    await createGroup(scope, parsed.data, ctx);

    revalidatePath("/[locale]/app/groups", "page");
    revalidatePath("/[locale]/app/students", "page");
    revalidatePath("/[locale]/app", "page");

    return noticeState("groups.createdSuccess");
  } catch (error) {
    if (error instanceof AppError) {
      return errorState(error.messageKey);
    }
    return errorState("errors.generic");
  }
}

export async function updateGroupAction(
  _previous: FormActionState = initialFormState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    const raw = {
      id: text(formData, "id"),
      name: text(formData, "name"),
      subjectId: text(formData, "subjectId") || null,
      grade: text(formData, "grade") || null,
      room: text(formData, "room") || null,
      color: text(formData, "color") || "indigo",
      weekday: text(formData, "weekday"),
      startTime: text(formData, "startTime"),
      endTime: text(formData, "endTime") || null,
      capacity: text(formData, "capacity") || null,
      teacherNote: text(formData, "teacherNote") || null,
    };

    const parsed = updateGroupSchema.safeParse(raw);
    if (!parsed.success) {
      return errorState("errors.validationFailed", fieldErrorsFrom(parsed.error));
    }

    await updateGroup(scope, parsed.data, ctx);

    revalidatePath(`/[locale]/app/groups/${parsed.data.id}`, "page");
    revalidatePath("/[locale]/app/groups", "page");

    return noticeState("groups.updatedSuccess");
  } catch (error) {
    if (error instanceof AppError) {
      return errorState(error.messageKey);
    }
    return errorState("errors.generic");
  }
}

export async function archiveGroupAction(groupId: string): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    await archiveGroup(scope, groupId, ctx);

    revalidatePath("/[locale]/app/groups", "page");
    revalidatePath(`/[locale]/app/groups/${groupId}`, "page");
    revalidatePath("/[locale]/app", "page");

    return noticeState("groups.archivedSuccess");
  } catch (error) {
    if (error instanceof AppError) {
      return errorState(error.messageKey);
    }
    return errorState("errors.generic");
  }
}

export async function restoreGroupAction(groupId: string): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    await restoreGroup(scope, groupId, ctx);

    revalidatePath("/[locale]/app/groups", "page");
    revalidatePath(`/[locale]/app/groups/${groupId}`, "page");

    return noticeState("groups.restoredSuccess");
  } catch (error) {
    if (error instanceof AppError) {
      return errorState(error.messageKey);
    }
    return errorState("errors.generic");
  }
}

export async function enrollStudentAction(groupId: string, studentId: string): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    const parsed = enrollStudentSchema.safeParse({ groupId, studentId });
    if (!parsed.success) {
      return errorState("errors.validationFailed");
    }

    await enrollStudentInGroup(scope, parsed.data, ctx);

    revalidatePath(`/[locale]/app/groups/${groupId}`, "page");
    revalidatePath(`/[locale]/app/students/${studentId}`, "page");
    revalidatePath("/[locale]/app/students", "page");

    return noticeState("groups.studentEnrolledSuccess");
  } catch (error) {
    if (error instanceof AppError) {
      return errorState(error.messageKey);
    }
    return errorState("errors.generic");
  }
}

export async function removeStudentAction(groupId: string, studentId: string): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    const parsed = removeStudentSchema.safeParse({ groupId, studentId });
    if (!parsed.success) {
      return errorState("errors.validationFailed");
    }

    await removeStudentFromGroup(scope, parsed.data, ctx);

    revalidatePath(`/[locale]/app/groups/${groupId}`, "page");
    revalidatePath(`/[locale]/app/students/${studentId}`, "page");
    revalidatePath("/[locale]/app/students", "page");

    return noticeState("groups.studentRemovedSuccess");
  } catch (error) {
    if (error instanceof AppError) {
      return errorState(error.messageKey);
    }
    return errorState("errors.generic");
  }
}

export async function transferStudentAction(
  fromGroupId: string,
  toGroupId: string,
  studentId: string,
): Promise<FormActionState> {
  try {
    await guardOrigin();
    const { scope } = await requireStaffSession();
    const ctx = await actionRequestContext();

    const parsed = transferStudentSchema.safeParse({ fromGroupId, toGroupId, studentId });
    if (!parsed.success) {
      return errorState("errors.validationFailed");
    }

    await transferStudentGroup(scope, parsed.data, ctx);

    revalidatePath(`/[locale]/app/groups/${fromGroupId}`, "page");
    revalidatePath(`/[locale]/app/groups/${toGroupId}`, "page");
    revalidatePath(`/[locale]/app/students/${studentId}`, "page");
    revalidatePath("/[locale]/app/students", "page");

    return noticeState("groups.studentTransferredSuccess");
  } catch (error) {
    if (error instanceof AppError) {
      return errorState(error.messageKey);
    }
    return errorState("errors.generic");
  }
}
