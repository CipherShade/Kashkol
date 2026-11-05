"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { usePWAInstall } from "@/lib/pwa/use-pwa-install";

export type PortalNotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

type PushSubscriptionRecord = {
  id: string;
  kind: "parent" | "student";
  endpoint: string;
  includeSensitiveDetails: boolean;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PortalNotificationsPanel({
  initialNotifications,
  onNotificationRead,
}: {
  initialNotifications: PortalNotificationItem[] | null;
  onNotificationRead?: (id: string) => void;
}) {
  const t = useTranslations("Portal.notifications");
  const { isIOS, isInstalled } = usePWAInstall();

  const [readIds, setReadIds] = useState<Record<string, string>>({});
  const [pushConfigured, setPushConfigured] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<PushSubscriptionRecord[]>(
    [],
  );
  const [permissionState, setPermissionState] = useState<
    NotificationPermission | "unsupported"
  >(() => {
    if (typeof window === "undefined") return "default";
    if (
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return "unsupported";
    }
    return window.Notification.permission;
  });
  const [busyPush, setBusyPush] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);

  const notifications = (initialNotifications ?? []).map((item) =>
    readIds[item.id]
      ? { ...item, isRead: true, readAt: readIds[item.id] }
      : item,
  );

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length === 0) return;
    try {
      await Promise.all(
        unreadIds.map((id) =>
          fetch(`/api/portal/notifications/${encodeURIComponent(id)}/read`, {
            method: "POST",
          }),
        ),
      );
      const nowIso = new Date().toISOString();
      setReadIds((prev) => {
        const next = { ...prev };
        for (const id of unreadIds) next[id] = nowIso;
        return next;
      });
    } catch {
      // Best-effort; do not block UI
    }
  }, [notifications]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }

    fetch("/api/portal/push", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          configured: boolean;
          vapidPublicKey: string | null;
          subscriptions: PushSubscriptionRecord[];
        };
        setPushConfigured(Boolean(data.configured));
        setVapidPublicKey(data.vapidPublicKey ?? null);
        setSubscriptions(data.subscriptions ?? []);
      })
      .catch(() => {
        // Silent fallback to in-app notifications
      });
  }, []);

  const handleMarkRead = useCallback(
    async (notificationId: string) => {
      try {
        const res = await fetch(
          `/api/portal/notifications/${encodeURIComponent(notificationId)}/read`,
          { method: "POST" },
        );
        if (!res.ok) return;
        const nowIso = new Date().toISOString();
        setReadIds((prev) => ({ ...prev, [notificationId]: nowIso }));
        onNotificationRead?.(notificationId);
      } catch {
        // Ignore transient network errors
      }
    },
    [onNotificationRead],
  );

  const handleEnablePush = async () => {
    if (
      permissionState === "unsupported" ||
      !pushConfigured ||
      !vapidPublicKey
    ) {
      return;
    }

    setBusyPush(true);
    setPushFeedback(null);
    try {
      const permission = await window.Notification.requestPermission();
      setPermissionState(permission);
      if (permission !== "granted") {
        setPushFeedback(t("permissionDeniedFallback"));
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const appServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const browserSub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      });

      const json = browserSub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setPushFeedback(t("pushError"));
        return;
      }

      const res = await fetch("/api/portal/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
          includeSensitiveDetails: false,
        }),
      });

      if (!res.ok) {
        setPushFeedback(t("pushError"));
        return;
      }

      const saved = (await res.json()) as {
        subscription: PushSubscriptionRecord;
      };
      setSubscriptions((prev) => [
        saved.subscription,
        ...prev.filter((s) => s.endpoint !== saved.subscription.endpoint),
      ]);
      setPushFeedback(t("pushEnabledSuccess"));
    } catch {
      setPushFeedback(t("pushError"));
    } finally {
      setBusyPush(false);
    }
  };

  const handleToggleLockScreenDetails = async (
    sub: PushSubscriptionRecord,
    nextValue: boolean,
  ) => {
    setBusyPush(true);
    try {
      const res = await fetch("/api/portal/push", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          includeSensitiveDetails: nextValue,
        }),
      });
      if (!res.ok) return;
      setSubscriptions((prev) =>
        prev.map((item) =>
          item.endpoint === sub.endpoint
            ? { ...item, includeSensitiveDetails: nextValue }
            : item,
        ),
      );
    } finally {
      setBusyPush(false);
    }
  };

  const handleDisablePush = async (sub: PushSubscriptionRecord) => {
    setBusyPush(true);
    try {
      await fetch("/api/portal/push", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      setSubscriptions((prev) =>
        prev.filter((item) => item.endpoint !== sub.endpoint),
      );
    } finally {
      setBusyPush(false);
    }
  };

  const activeSub = subscriptions[0] ?? null;

  return (
    <div className="space-y-5">
      {/* Web Push & Lock-Screen Privacy Card */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--text-primary)]">
              <Icon name="lock" size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {t("pushSettingsTitle")}
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {t("lockScreenPrivacyNote")}
              </p>
            </div>
          </div>

          {activeSub ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busyPush}
              onClick={() => void handleDisablePush(activeSub)}
              className="gap-1.5"
            >
              <Icon name="xCircle" size={14} />
              <span>{t("disablePushAction")}</span>
            </Button>
          ) : (
            permissionState !== "unsupported" &&
            permissionState !== "denied" &&
            pushConfigured &&
            !(isIOS && !isInstalled) && (
              <Button
                type="button"
                size="sm"
                disabled={busyPush}
                onClick={() => void handleEnablePush()}
                className="gap-1.5"
              >
                <Icon name="bell" size={14} />
                <span>{t("enablePushAction")}</span>
              </Button>
            )
          )}
        </div>

        {/* Platform / Configuration Status Messages */}
        {isIOS && !isInstalled && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-secondary)]">
            <Icon name="phone" size={16} className="mt-0.5 shrink-0 text-[var(--brand-fg)]" />
            <span>{t("iosHomeScreenRequirement")}</span>
          </div>
        )}

        {permissionState === "denied" && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-secondary)]">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-[var(--warning-fg)]" />
            <span>{t("permissionDeniedFallback")}</span>
          </div>
        )}

        {!pushConfigured && (
          <div className="mt-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            {t("inAppFallbackActive")}
          </div>
        )}

        {pushFeedback && (
          <p className="mt-2.5 text-xs font-medium text-[var(--text-secondary)]">
            {pushFeedback}
          </p>
        )}

        {activeSub && (
          <div className="mt-3.5 border-t border-[var(--border-subtle)] pt-3.5">
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <div>
                <span className="block text-xs font-semibold text-[var(--text-primary)]">
                  {t("optInSensitiveTitle")}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                  {t("optInSensitiveDescription")}
                </span>
              </div>
              <input
                type="checkbox"
                checked={activeSub.includeSensitiveDetails}
                disabled={busyPush}
                onChange={(e) =>
                  void handleToggleLockScreenDetails(
                    activeSub,
                    e.target.checked,
                  )
                }
                className="mt-1 h-4 w-4 rounded border-[var(--border-strong)]"
              />
            </label>
          </div>
        )}
      </div>

      {/* In-App Notification Center List */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="bell" size={16} className="text-[var(--brand-fg)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {t("inAppCenterTitle")}
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <span className="rounded-full bg-[var(--brand-fg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--surface-elevated)]">
                {unreadCount}
              </span>
            )}
            <span className="text-xs text-[var(--text-secondary)]">
              {t("unreadCount", { count: unreadCount })}
            </span>
          </div>
          {unreadCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={false}
              onClick={() => void handleMarkAllRead()}
              className="gap-1.5 text-xs"
            >
              {t("markAllReadAction")}
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
            {t("emptyNotifications")}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {notifications.map((item) => (
              <li
                key={item.id}
                className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 ${
                  item.isRead ? "opacity-75" : "bg-[var(--surface-muted)]/40"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {!item.isRead && (
                      <span
                        className="inline-block h-2 w-2 rounded-full bg-[var(--brand-fg)]"
                        aria-hidden="true"
                      />
                    )}
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {item.title}
                    </p>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {item.body}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>

                {!item.isRead && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleMarkRead(item.id)}
                    className="gap-1 text-xs"
                  >
                    <Icon name="checkCircle" size={14} />
                    <span>{t("markReadAction")}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
