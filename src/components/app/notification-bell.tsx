"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  MenuHeader,
  MenuSeparator,
} from "@/components/ui/dropdown-menu";

export type StaffNotification = {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  messageKey: string | null;
  messageParams: Record<string, unknown> | null;
  title: string | null;
  body: string | null;
  isRead: boolean;
  readAt: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const t = useTranslations("Notifications");
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyMarkAll, setBusyMarkAll] = useState<boolean>(false);

  const refreshNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: StaffNotification[];
        unreadCount: number;
      };
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Best-effort fetch
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/notifications", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as {
          notifications: StaffNotification[];
          unreadCount: number;
        };
      })
      .then((data) => {
        if (!active || !data) return;
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      })
      .catch(() => {
        // Best-effort fetch
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleMarkAsRead = useCallback(
    async (notificationId: string) => {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        await fetch(`/api/notifications/${notificationId}/read`, {
          method: "POST",
          headers: { "content-type": "application/json" },
        });
      } catch {
        // Rollback on network failure
        void refreshNotifications();
      }
    },
    [refreshNotifications],
  );

  const handleMarkAllRead = useCallback(async () => {
    setBusyMarkAll(true);
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })),
    );
    setUnreadCount(0);

    try {
      await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
    } catch {
      void refreshNotifications();
    } finally {
      setBusyMarkAll(false);
    }
  }, [refreshNotifications]);

  /** F-P2-07 AC-3: every rule-generated alert opens its relevant screen. */
  const deepLinkFor = (item: StaffNotification): string | null => {
    const { entityType, entityId } = item;
    if (!entityType || !entityId) return null;
    switch (entityType) {
      case "teaching_session":
        return `/app/sessions/${entityId}`;
      case "student":
        return `/app/students/${entityId}`;
      case "group":
        return `/app/groups/${entityId}`;
      case "homework":
        return `/app/homework?homework=${entityId}`;
      case "assessment":
        return `/app/assessments?assessment=${entityId}`;
      default:
        return null;
    }
  };

  const handleNotificationClick = (item: StaffNotification) => {
    if (!item.isRead) {
      void handleMarkAsRead(item.id);
    }

    const href = deepLinkFor(item);
    if (href) {
      startTransition(() => {
        router.push(href);
      });
    }
  };

  const formatNotificationMessage = (item: StaffNotification): string => {
    if (item.messageKey) {
      try {
        const keyParts = item.messageKey.split(".");
        const subKey = keyParts[keyParts.length - 1];
        // @ts-expect-error dynamic key resolution for message interpolation
        return t(`messages.${subKey}`, item.messageParams ?? {});
      } catch {
        // Fallback to title/body if key formatting fails
      }
    }
    return item.title ?? item.body ?? t(`types.${item.type}` as "types.general");
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  return (
    <DropdownMenu
      label={t("bell")}
      align="end"
      sideOffset={8}
      trigger={
        <span className="inline-flex">
          <Tooltip label={unreadCount > 0 ? t("unreadCount", { count: unreadCount }) : t("bell")}>
            <button
              type="button"
              className="ui-button app-notification-trigger relative"
              data-variant="ghost"
              data-size="icon"
              aria-label={t("bell")}
            >
              <Icon name="bell" size={18} />
              {unreadCount > 0 && (
                <span className="app-notification-badge" aria-hidden="true">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </Tooltip>
        </span>
      }
    >
      <div className="w-80 sm:w-96 p-2">
        <MenuHeader>
          <div className="flex items-center justify-between w-full">
            <span className="font-semibold text-sm">{t("bell")}</span>
            {unreadCount > 0 && (
              <Button
                type="button"
                data-variant="ghost"
                data-size="sm"
                className="text-xs h-7 px-2"
                disabled={busyMarkAll}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleMarkAllRead();
                }}
              >
                {t("markAllRead")}
              </Button>
            )}
          </div>
        </MenuHeader>
        <MenuSeparator />

        {loading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {t("unreadCount", { count: 0 })}
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-8 px-4 text-center space-y-1">
            <p className="font-medium text-sm">{t("empty")}</p>
            <p className="text-xs text-muted-foreground">{t("emptyHint")}</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-1 py-1">
            {notifications.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                className={`w-full text-start p-2.5 rounded-md transition-colors cursor-pointer border ${
                  item.isRead
                    ? "bg-transparent border-transparent hover:bg-muted/50"
                    : "bg-primary/5 border-primary/20 hover:bg-primary/10"
                }`}
                onClick={() => handleNotificationClick(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleNotificationClick(item);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        item.severity === "critical"
                          ? "bg-destructive"
                          : item.severity === "warning"
                          ? "bg-amber-500"
                          : "bg-primary"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-semibold">
                      {t(`types.${item.type}` as "types.general")}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {formatTimestamp(item.createdAt)}
                  </span>
                </div>
                <p className="text-xs mt-1 leading-snug line-clamp-2">
                  {formatNotificationMessage(item)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </DropdownMenu>
  );
}
