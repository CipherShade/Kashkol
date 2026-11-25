import { z } from "zod";

/**
 * F-P2-07: the five rule-generated notification kinds and their cooldown.
 *
 * The JSON shape is persisted on `workspace_settings.notification_rule_config`.
 * A missing or malformed row falls back to these defaults rather than disabling
 * the feature silently. The opt-in digest flag lives in the existing
 * `workspace_settings.email_digest_enabled` column.
 */
export const notificationRuleConfigSchema = z
  .object({
    atRiskEnabled: z.boolean().default(true),
    unrecordedSessionEnabled: z.boolean().default(true),
    homeworkDueSoonEnabled: z.boolean().default(true),
    assessmentPendingGradesEnabled: z.boolean().default(true),
    paymentOverdueEnabled: z.boolean().default(true),
    cooldownHours: z.coerce.number().int().min(1).max(168).default(24),
    paymentOverdueDays: z.coerce.number().int().min(1).max(365).default(30),
  })
  .strict();

/** User-editable rule configuration. */
export type NotificationRuleConfig = z.infer<typeof notificationRuleConfigSchema>;

/**
 * Stored configuration includes a private delivery cursor. It is never part of
 * the editable input schema, so a client cannot forge "digest already sent".
 */
export const storedNotificationRuleConfigSchema = notificationRuleConfigSchema.extend({
  _lastDigestAt: z.string().datetime().optional(),
});

export type StoredNotificationRuleConfig = z.infer<typeof storedNotificationRuleConfigSchema>;

export const DEFAULT_NOTIFICATION_RULE_CONFIG: StoredNotificationRuleConfig =
  storedNotificationRuleConfigSchema.parse({});

export const notificationRulesSettingsSchema = z
  .object({
    rules: notificationRuleConfigSchema,
    emailDigestEnabled: z.boolean().default(false),
  })
  .strict();

export type NotificationRulesSettingsInput = z.infer<typeof notificationRulesSettingsSchema>;

export type NotificationRulesSettings = {
  rules: StoredNotificationRuleConfig;
  emailDigestEnabled: boolean;
};

/** Malformed stored JSON is treated as an unset configuration, never as a rule change. */
export function parseNotificationRuleConfig(raw: unknown): StoredNotificationRuleConfig {
  const parsed = storedNotificationRuleConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_NOTIFICATION_RULE_CONFIG;
}

/**
 * The digest cursor is server-owned. Strip it before returning settings to a
 * client so a subsequent POST round-trip passes the strict input schema and a
 * user cannot forge "digest already sent".
 */
export function publicNotificationRuleConfig(
  rules: StoredNotificationRuleConfig,
): NotificationRuleConfig {
  const { _lastDigestAt: _privateCursor, ...editable } = rules;
  return editable;
}
