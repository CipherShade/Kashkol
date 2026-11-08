import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import type { DashboardData, TodaySessionItem } from "@/modules/dashboard/schemas";

type TodayOperationsProps = {
  data: DashboardData["todayOperations"];
  locale: string;
};

export function TodayOperations({ data, locale }: TodayOperationsProps) {
  const t = useTranslations("Dashboard");

  const sessions = data.sessions;
  const timeFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const statusToneMap: Record<TodaySessionItem["status"], "outline" | "primary" | "success" | "danger"> = {
    scheduled: "outline",
    started: "primary",
    completed: "success",
    cancelled: "danger",
  };

  return (
    <Card labelledBy="today-operations-title" className="app-page-section">
      <CardHeader
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="calendar" size={20} />
            <span>{t("todayTitle")}</span>
            <Badge tone="primary">
              {t("todaySessionCount", { count: data.totalSessionsCount })}
            </Badge>
          </div>
        }
        titleId="today-operations-title"
        description={
          data.sessionsAwaitingAttendanceCount > 0
            ? t("todayAwaitingAttendanceNotice", { count: data.sessionsAwaitingAttendanceCount })
            : t("todaySubtitle")
        }
        actions={
          <div style={{ display: "flex", gap: "8px" }}>
            <Link
              href="/app/calendar"
              className="ui-button"
              data-variant="secondary"
              data-size="sm"
            >
              <Icon name="calendar" size={14} />
              <span>{t("viewFullCalendar")}</span>
            </Link>
          </div>
        }
      />
      <CardBody>
        {sessions.length === 0 ? (
          <div
            style={{
              padding: "36px 16px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "var(--surface-sunken)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--muted)",
              }}
            >
              <Icon name="calendar" size={24} />
            </div>
            <div>
              <p style={{ fontWeight: 600, color: "var(--ink)", margin: 0 }}>{t("todayEmptyTitle")}</p>
              <p style={{ fontSize: "0.875rem", color: "var(--muted)", margin: "4px 0 0" }}>
                {t("todayEmptySubtitle")}
              </p>
            </div>
            <Link
              href="/app/calendar"
              className="ui-button"
              data-variant="primary"
              data-size="sm"
            >
              <Icon name="plus" size={14} />
              <span>{t("scheduleSessionAction")}</span>
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {sessions.map((session) => {
              const startsAtDate = new Date(session.startsAt);
              const formattedTime = timeFormat.format(startsAtDate);

              return (
                <div
                  key={session.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "16px",
                    padding: "16px",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--surface-2)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "220px" }}>
                    <span
                      style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        backgroundColor: session.groupColor || "var(--primary)",
                        flexShrink: 0,
                      }}
                      aria-hidden="true"
                    />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: 600, color: "var(--ink)", fontSize: "0.9375rem" }}>
                          {session.groupName}
                        </span>
                        <Badge tone={statusToneMap[session.status]}>
                          {t(`sessionStatus_${session.status}`)}
                        </Badge>
                      </div>
                      <div
                        style={{
                          fontSize: "0.8125rem",
                          color: "var(--muted)",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginTop: "2px",
                        }}
                      >
                        <span>{formattedTime}</span>
                        {session.enrolledStudentsCount > 0 ? (
                          <>
                            <span>•</span>
                            <span>{t("sessionEnrolledStudents", { count: session.enrolledStudentsCount })}</span>
                          </>
                        ) : null}
                        {session.room ? (
                          <>
                            <span>•</span>
                            <span>{session.room}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    {/* Attendance status badge */}
                    {session.hasAttendance ? (
                      <Badge tone="success" icon="checkCircle">
                        {t("attendanceDone")}
                      </Badge>
                    ) : session.status !== "cancelled" ? (
                      <Badge tone="warn" icon="clock">
                        {t("attendancePending")}
                      </Badge>
                    ) : null}

                    {/* Online meeting action if available */}
                    {session.meetingUrl ? (
                      <a
                        href={session.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ui-button"
                        data-variant="outline"
                        data-size="sm"
                      >
                        <Icon name="externalLink" size={14} />
                        <span>{t("joinMeetingAction")}</span>
                      </a>
                    ) : null}

                    {/* Take / View Attendance button */}
                    <Link
                      href={`/app/sessions/${session.id}`}
                      className="ui-button"
                      data-variant={session.hasAttendance ? "secondary" : "primary"}
                      data-size="sm"
                    >
                      <Icon name="check" size={14} />
                      <span>{session.hasAttendance ? t("viewAttendanceAction") : t("takeAttendanceAction")}</span>
                    </Link>

                    {/* Open session details */}
                    <Link
                      href={`/app/sessions`}
                      className="ui-button"
                      data-variant="ghost"
                      data-size="sm"
                    >
                      <span>{t("sessionDetailsAction")}</span>
                    </Link>
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
