import { getServerEnv, isWebPushConfigured } from "@/lib/config/env";
import webpush from "web-push";

export type PushPayloadInput = {
  kind: "parent" | "student";
  locale?: "ar" | "en";
  includeSensitiveDetails: boolean;
  eventType:
    | "attendance"
    | "homework"
    | "grade"
    | "schedule"
    | "material"
    | "payment"
    | "general";
  /**
   * Optional summary text that is ONLY included when `includeSensitiveDetails`
   * is explicitly opted into by the user. Even when opted in, raw private notes,
   * tokens, and phone numbers are scrubbed.
   */
  summaryText?: string;
  studentId?: string;
};

export type PushNotificationPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  sensitiveIncluded: boolean;
};

const SENSITIVE_PATTERNS = [
  /\b\d{1,3}\s*\/\s*\d{1,3}\b/g,
  /\b\d{1,3}(?:\.\d+)?%\b/g,
  /\b(?:EGP|ج\.م|جنيه)\s*\d+/gi,
];

function scrubSecrets(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "[redacted]")
    .replace(/\+?\d{10,15}/g, "[redacted]")
    .trim()
    .slice(0, 180);
}

/**
 * Build a Web Push notification payload that defaults to generic lock-screen-safe
 * text (`includeSensitiveDetails = false`).
 *
 * Grades, scores, attendance statuses, student names, and balances are NEVER
 * placed in the payload unless the recipient has explicitly opted in.
 */
export function buildPushNotificationPayload(
  input: PushPayloadInput,
): PushNotificationPayload {
  const locale = input.locale ?? "ar";
  const basePath =
    input.kind === "parent"
      ? `/${locale}/portal/parent${input.studentId ? `?studentId=${encodeURIComponent(input.studentId)}` : ""}`
      : `/${locale}/portal/student`;

  const genericTitle =
    locale === "ar"
      ? input.kind === "parent"
        ? "كشكول — تحديث في بوابة ولي الأمر"
        : "كشكول — تحديث في بوابة الطالب"
      : input.kind === "parent"
        ? "Kashkol — Parent Portal Update"
        : "Kashkol — Student Portal Update";

  const genericBody =
    locale === "ar"
      ? "يوجد إشعار جديد في البوابة. افتح كشكول لعرض التفاصيل بأمان."
      : "You have a new update in your portal. Open Kashkol to view details securely.";

  if (!input.includeSensitiveDetails || !input.summaryText?.trim()) {
    return {
      title: genericTitle,
      body: genericBody,
      url: basePath,
      tag: `kashkol-${input.kind}-${input.eventType}`,
      sensitiveIncluded: false,
    };
  }

  return {
    title: genericTitle,
    body: scrubSecrets(input.summaryText),
    url: basePath,
    tag: `kashkol-${input.kind}-${input.eventType}`,
    sensitiveIncluded: true,
  };
}

/** Verify that a default payload contains no grades, percentages, or currency figures. */
export function isLockScreenSafePayload(payload: PushNotificationPayload): boolean {
  const combined = `${payload.title} ${payload.body}`;
  return !SENSITIVE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(combined);
  });
}

export type WebPushSubscription = {
  endpoint: string;
  p256dhKey: string;
  authKey: string;
};

export type WebPushDelivery = (subscription: WebPushSubscription, payload: string) => Promise<void>;

async function sendWithWebPush(subscription: WebPushSubscription, payload: string): Promise<void> {
  const env = getServerEnv();
  webpush.setVapidDetails(
    env.WEB_PUSH_VAPID_SUBJECT ?? "",
    env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "",
    env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "",
  );

  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dhKey, auth: subscription.authKey },
    },
    payload,
    { TTL: 60 * 60 },
  );
}

export function getWebPushPublicConfig() {
  const env = getServerEnv();
  const configured = isWebPushConfigured(env);
  return {
    configured,
    vapidPublicKey: configured ? (env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null) : null,
    subject: configured ? (env.WEB_PUSH_VAPID_SUBJECT ?? null) : null,
  };
}

/**
 * Dispatch a Web Push notification through the configured push service.
 *
 * `delivered: true` is returned only after the push service accepted the
 * message. An unconfigured deployment reports `unconfigured`; a transport
 * failure reports `send_failed`. Nothing is written to an in-memory history
 * and no success is simulated.
 *
 * The transport is injectable so tests can prove the call without network
 * access.
 */
export async function dispatchWebPushNotification(
  subscription: WebPushSubscription & { includeSensitiveDetails: boolean },
  input: Omit<PushPayloadInput, "includeSensitiveDetails">,
  send: WebPushDelivery = sendWithWebPush,
): Promise<{ delivered: boolean; reason?: "unconfigured" | "send_failed"; payload: PushNotificationPayload }> {
  const payload = buildPushNotificationPayload({
    ...input,
    includeSensitiveDetails: subscription.includeSensitiveDetails,
  });

  if (!isWebPushConfigured()) {
    return { delivered: false, reason: "unconfigured", payload };
  }

  try {
    await send(subscription, JSON.stringify(payload));
    return { delivered: true, payload };
  } catch {
    return { delivered: false, reason: "send_failed", payload };
  }
}
