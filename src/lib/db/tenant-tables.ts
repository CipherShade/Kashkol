/**
 * The tenant-table registry.
 *
 * Every table listed here carries a non-null `workspace_id`, an index on that
 * column, and a row-level-security policy. The workspace root is protected by
 * an id-based policy instead. `scripts/check-project-rules.mjs` compares this
 * list with the Prisma schema and the migration so they cannot drift.
 */
export const TENANT_TABLES = [
  "workspace_settings",
  "workspace_member",
  "workspace_invitation",
  "permission_grant",
  "onboarding_task",
  "audit_event",
  "student",
  "student_note",
  "portal_grant",
  "portal_invitation",
  "portal_push_subscription",
  "subject",
  "group",
  "enrollment",
  "teaching_session",
  "session_revision",
  "attendance_mark",
  "attendance_revision",
  "attendance_token",
  "assessment",
  "assessment_score",
  "homework",
  "homework_submission",
  "homework_resource",
  "student_follow_up",
  "student_follow_up_event",
  "payment",
  "payment_revision",
  "payment_adjustment",
  "fee_rule",
  "report_export",
  "file",
  "file_group_access",
  "file_student_access",
  "guardian",
  "notification",
  "message_outbox",
  "notification_settings",
  "notification_log",
  "video_lesson",
  "video_group_access",
  "video_student_access",
  "online_exam",
  "online_exam_student_assignment",
  "online_exam_question",
  "online_exam_attempt",
  "online_exam_response",
  "break_glass_grant",
  "form",
  "form_section",
  "form_question",
  "form_question_option",
  "form_question_logic",
  "form_submission",
  "form_answer",
  "form_answer_file",
  "form_upload",
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

export const TENANT_ROOT_TABLE = "workspace" as const;

export const RLS_TABLES = [TENANT_ROOT_TABLE, ...TENANT_TABLES] as const;

/** Tables Better Auth owns; they are global by design, not tenant-scoped. */
export const IDENTITY_TABLES = [
  "user",
  "session",
  "account",
  "verification",
  "rate_limit",
] as const;
