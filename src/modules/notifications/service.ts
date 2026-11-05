import { withScope } from "@/lib/db/scope";
import { authorize, type Scope } from "@/modules/tenancy/types";
import { getGuardianForStudent } from "@/modules/messaging/repository";
import { createInAppNotificationTx } from "./repository";

export async function createAttendanceNotification(
  scope: Scope,
  input: {
    locale?: "ar" | "en";
    sessionId: string;
    studentId: string;
    groupName: string;
    sessionDate: string;
    sessionTime?: string | null;
    mark: "present" | "absent" | "late" | "excused";
  },
) {
  authorize(scope, "messages", "write");
  const guardian = await getGuardianForStudent(scope, input.studentId);
  if (!guardian) return null; // No authorized guardian for this student

  const locale = input.locale ?? "ar";

  const title = locale === "ar"
    ? `إشعار حضور ${input.mark === "present" ? "حاضر" : input.mark === "absent" ? "غائب" : input.mark === "late" ? "متأخر" : "عذر"}`
    : `Attendance: ${input.mark}`;

  const body = locale === "ar"
    ? `${input.groupName} - ${input.sessionDate}\n${input.mark === "present" ? "تم تسجيل حضور" : input.mark === "absent" ? "تم تسجيل غياب" : input.mark === "late" ? "تم تسجيل تأخير" : "تم تسجيل عذر"} الطالب.`
    : `${input.groupName} - ${input.sessionDate}\nAttendance marked ${input.mark} for student.`;

  const result = await withScope(scope, async (tx) => {
    return createInAppNotificationTx(tx, scope.workspaceId, {
      studentId: input.studentId,
      guardianId: guardian.id,
      type: (`attendance_${input.mark}`) as "attendance_present" | "attendance_absent" | "attendance_late" | "attendance_excused",
      title,
      body,
      entityType: "teaching_session",
      entityId: input.sessionId,
      metadata: {
        sessionId: input.sessionId,
        groupName: input.groupName,
        sessionDate: input.sessionDate,
        sessionTime: input.sessionTime ?? null,
        mark: input.mark,
      },
      idempotencyKey: `att_${input.sessionId}_${input.studentId}_${input.mark}`,
    });
  });

  return result;
}
