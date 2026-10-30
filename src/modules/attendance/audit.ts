export const attendanceAuditActions = {
  attendanceMarked: "attendance.marked",
  attendanceSaved: "attendance.saved",
  attendanceCorrected: "attendance.corrected",
  attendanceBatchCorrected: "attendance.batch_corrected",
  attendanceClosed: "attendance.closed",
  qrTokenIssued: "attendance.qr_token_issued",
  qrTokenRotated: "attendance.qr_token_rotated",
  qrRejected: "attendance.qr_rejected",
} as const;

export type AttendanceAuditAction = (typeof attendanceAuditActions)[keyof typeof attendanceAuditActions];
