import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/ui/icon";
import type { RecentActivityEvent } from "@/modules/dashboard/schemas";

type RecentActivityProps = {
  events: RecentActivityEvent[];
  locale: string;
};

export function RecentActivity({ events, locale }: RecentActivityProps) {
  const t = useTranslations("Dashboard");

  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const entityIconMap: Record<string, IconName> = {
    student: "user",
    group: "users",
    session: "calendar",
    attendance: "checkCircle",
    payment: "creditCard",
    homework: "book",
    assessment: "bar",
    exam: "bar",
    form: "clipboard",
    member: "staff",
  };

  return (
    <Card labelledBy="recent-activity-title" className="app-page-section">
      <CardHeader
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="activity" size={20} />
            <span>{t("activityTitle")}</span>
          </div>
        }
        titleId="recent-activity-title"
        description={t("activitySubtitle")}
        actions={
          <Link
            href="/app/audit"
            className="ui-button"
            data-variant="ghost"
            data-size="sm"
          >
            <span>{t("viewAuditLogAction")}</span>
            <Icon name="arrowRight" size={13} />
          </Link>
        }
      />
      <CardBody>
        {events.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--muted)", fontSize: "0.875rem" }}>
            <p style={{ margin: 0 }}>{t("activityEmptyMessage")}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {events.map((event) => {
              const icon = entityIconMap[event.entityType] || "activity";
              const formattedDate = dateFormat.format(new Date(event.createdAt));

              return (
                <div
                  key={event.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                    padding: "12px 16px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        backgroundColor: "var(--surface-2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--primary)",
                        flexShrink: 0,
                      }}
                    >
                      <Icon name={icon} size={16} />
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: 600, color: "var(--ink)", fontSize: "0.875rem" }}>
                          {event.actorName}
                        </span>
                        <Badge tone="neutral">{event.action}</Badge>
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                        {formattedDate}
                      </span>
                    </div>
                  </div>

                  <div>
                    {event.link !== "/app" ? (
                      <Link
                        href={event.link}
                        className="ui-button"
                        data-variant="ghost"
                        data-size="sm"
                      >
                        <Icon name="externalLink" size={13} />
                        <span>{t("viewAction")}</span>
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
