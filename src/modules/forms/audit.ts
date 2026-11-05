export const formAuditActions = {
  formCreated: "form.created",
  formDraftUpdated: "form.draft_updated",
  formSettingsUpdated: "form.settings_updated",
  formPublished: "form.published",
  formArchived: "form.archived",
  formDuplicated: "form.duplicated",
  submissionReceived: "form.submission_received",
  submissionArchived: "form.submission_archived",
} as const;

export type FormAuditAction = (typeof formAuditActions)[keyof typeof formAuditActions];
