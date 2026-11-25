-- F-P2-07: workspace-configurable notification rules and one new rule type.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'payment_overdue';

ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "notification_rule_config" JSONB;
