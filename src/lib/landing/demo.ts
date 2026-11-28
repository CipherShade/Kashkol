/**
 * Pure state helpers for the labelled landing demo. The data is synthetic and
 * local to the browser: no network call, no persistence, and no real student
 * record is read or written.
 */

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export type DemoStudent = {
  readonly id: number;
  readonly status: AttendanceStatus;
};

export type AttendanceSummary = {
  readonly present: number;
  readonly total: number;
  readonly rate: number;
};

/** Only `present` counts towards the displayed sample rate. */
export function attendanceSummary(students: readonly DemoStudent[]): AttendanceSummary {
  const present = students.filter((student) => student.status === "present").length;
  const total = students.length;
  return {
    present,
    total,
    rate: total === 0 ? 0 : Math.round((present / total) * 100),
  };
}
