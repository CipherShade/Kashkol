import { getServerEnv } from "@/lib/config/env";
import { withScope } from "@/lib/db/scope";
import { newRequestId } from "@/lib/http/request-id";
import { createNotificationWorkerScope } from "@/lib/worker/system-actor";
import { listActiveWorkspaceIdsForWorker } from "@/modules/tenancy/repository";
import { getEmailTransport } from "@/modules/identity/email";
import { writeAuditEvent } from "@/modules/audit/service";
import { findNotificationRuleSettingsTx } from "./repository";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";

const DIGEST_INTERVAL_MS = 24 * 60 * 60 * 1000;

type DigestRow = { type: string; count: number };

/**
 * F-P2-07 AC-4: the digest carries only type labels and counts. It never
 * includes note bodies, message bodies, student names, or phone numbers.
 */
export function buildDigestText(rows: readonly DigestRow[], locale: "ar" | "en"): string {
  const catalogue = locale === "ar" ? ar : en;
  const labels = catalogue.Notifications.types as Record<string, string>;
  // Only known current types enter a digest; no legacy type remains in storage.
  const lines = rows
    .filter((row) => labels[row.type] !== undefined)
    .map((row) => `- ${labels[row.type]}: ${row.count}`);
  const heading = locale === "ar" ? "ملخص إشعارات كشكول" : "Kashkol notification digest";
  return [heading, "", ...lines].join("\n");
}

function digestPeriodStart(lastDigestAt: string | undefined, now: Date): Date {
  const parsed = lastDigestAt ? new Date(lastDigestAt) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  return new Date(now.getTime() - DIGEST_INTERVAL_MS);
}

type DigestPlan =
  | { status: "disabled" | "waiting" | "no-recipient" }
  | {
      status: "due";
      to: string;
      subject: string;
      text: string;
      periodStart: Date;
    };

/**
 * Send one digest per opted-in workspace, at most once every 24 hours.
 * When no email provider is configured the digest is skipped — never faked.
 *
 * The read, the network send and the cursor write are three separate steps:
 * no outbound call is ever made inside a tenant transaction (AGENTS.md §6).
 * The audit event is written in the same transaction as the cursor mutation.
 */
export async function drainNotificationDigests(
  now: Date = new Date(),
): Promise<{ workspaces: number; sent: number; skipped: number }> {
  const env = getServerEnv();
  const transport = getEmailTransport(env);
  if (!transport.configured) return { workspaces: 0, sent: 0, skipped: 0 };

  const workspaceIds = await listActiveWorkspaceIdsForWorker();
  let sent = 0;
  let skipped = 0;

  for (const workspaceId of workspaceIds) {
    const scope = createNotificationWorkerScope(workspaceId);
    try {
      const plan = await withScope(scope, async (tx): Promise<DigestPlan> => {
        const settings = await findNotificationRuleSettingsTx(tx, workspaceId);
        if (!settings.emailDigestEnabled) return { status: "disabled" };

        const periodStart = digestPeriodStart(settings.rules._lastDigestAt, now);
        if (now.getTime() - periodStart.getTime() < DIGEST_INTERVAL_MS) {
          return { status: "waiting" };
        }

        const [recipient, localeRow, rows] = await Promise.all([
          tx.workspaceMember.findFirst({
            where: {
              workspaceId,
              role: "owner",
              status: "active",
              removedAt: null,
            },
            select: { user: { select: { email: true } } },
          }),
          tx.workspaceSettings.findUnique({
            where: { workspaceId },
            select: { locale: true },
          }),
          tx.notification.groupBy({
            by: ["type"],
            where: {
              workspaceId,
              recipientUserId: { not: null },
              createdAt: { gt: periodStart, lte: now },
            },
            _count: { _all: true },
          }),
        ]);

        if (!recipient) return { status: "no-recipient" };
        const typedRows: DigestRow[] = rows.map((row) => ({
          type: String(row.type),
          count: row._count._all,
        }));
        const locale = localeRow?.locale === "en" ? "en" : "ar";
        return {
          status: "due",
          to: recipient.user.email,
          subject: locale === "en" ? "Kashkol digest" : "ملخص كشكول",
          text: buildDigestText(typedRows, locale),
          periodStart,
        };
      });

      if (plan.status !== "due") {
        skipped += 1;
        continue;
      }

      try {
        await transport.send({ to: plan.to, subject: plan.subject, text: plan.text });
      } catch {
        // A failed send is never recorded as delivered; the next cycle retries.
        skipped += 1;
        continue;
      }

      await withScope(scope, async (tx) => {
        const latest = await findNotificationRuleSettingsTx(tx, workspaceId);
        await tx.workspaceSettings.update({
          where: { workspaceId },
          data: {
            notificationRuleConfig: {
              ...latest.rules,
              _lastDigestAt: now.toISOString(),
            },
          },
        });
        await writeAuditEvent(tx, {
          workspaceId,
          actorUserId: "system:notification-digest",
          actorDisplayName: "Notification digest",
          actorType: "system",
          entityType: "notification_digest",
          entityId: workspaceId,
          action: "notification_digest.sent",
          diff: { periodStart: plan.periodStart.toISOString(), sentAt: now.toISOString() },
          requestId: newRequestId(),
          ipHash: null,
        });
      });
      sent += 1;
    } catch {
      skipped += 1;
    }
  }

  return { workspaces: workspaceIds.length, sent, skipped };
}
