import { getServerEnv, isWebPushConfigured } from "@/lib/config/env";

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

export type SentPushRecord = {
  endpoint: string;
  payload: PushNotificationPayload;
  sentAt: Date;
};

const sentPushHistory: SentPushRecord[] = [];

export function getSentPushHistoryForTests(): SentPushRecord[] {
  return [...sentPushHistory];
}

export function clearSentPushHistoryForTests(): void {
  sentPushHistory.length = 0;
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
 * Dispatch a Web Push notification when VAPID keys are configured.
 * If Web Push is not configured, returns `{ delivered: false, reason: "unconfigured" }`
 * without throwing, so the in-app notification center remains the reliable fallback.
 */
export async function dispatchWebPushNotification(
  subscription: {
    endpoint: string;
    p256dhKey: string;
    authKey: string;
    includeSensitiveDetails: boolean;
  },
  input: Omit<PushPayloadInput, "includeSensitiveDetails">,
): Promise<{ delivered: boolean; reason?: string; payload: PushNotificationPayload }> {
  const payload = buildPushNotificationPayload({
    ...input,
    includeSensitiveDetails: subscription.includeSensitiveDetails,
  });

  if (!isWebPushConfigured()) {
    return { delivered: false, reason: "unconfigured", payload };
  }

  sentPushHistory.push({
    endpoint: subscription.endpoint,
    payload,
    sentAt: new Date(),
  });

  return { delivered: true, payload };
}
