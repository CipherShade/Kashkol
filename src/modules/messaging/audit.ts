export const messagingAuditActions = {
  notificationEnqueued: "messaging.notification.enqueued",
  notificationSent: "messaging.notification.sent",
  notificationFailed: "messaging.notification.failed",
  notificationRetried: "messaging.notification.retried",
  notificationPrepared: "messaging.notification.prepared",
  guardianCreated: "messaging.guardian.created",
  settingsUpdated: "integrations.settings_updated",
} as const;
