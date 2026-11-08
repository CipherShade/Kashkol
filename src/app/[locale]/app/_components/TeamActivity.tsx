import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import type { AssistantActivityItem } from "@/modules/dashboard/schemas";

type TeamActivityProps = {
  data: AssistantActivityItem[] | null;
  locale: string;
};

export function TeamActivity({ data, locale }: TeamActivityProps) {
  const t = useTranslations("Dashboard");

  if (data === null) {
    return null; // Assistant without team permission does not see the team card
  }

  const dateFormat = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <Card labelledBy="team-activity-title" className="app-page-section">
      <CardHeader
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="staff" size={20} />
            <span>{t("teamTitle")}</span>
            <Badge tone="primary">{data.length}</Badge>
          </div>
        }
        titleId="team-activity-title"
        description={t("teamSubtitle")}
        actions={
          <Link
            href="/app/team"
            className="ui-button"
            data-variant="secondary"
            data-size="sm"
          >
            <Icon name="users" size={14} />
            <span>{t("manageTeamAction")}</span>
          </Link>
        }
      />
      <CardBody>
        {data.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              color: "var(--muted)",
              fontSize: "0.875rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ opacity: 0.5, display: "inline-flex" }}>
              <Icon name="staff" size={24} />
            </span>
            <p style={{ margin: 0, fontWeight: 500 }}>{t("teamNoAssistants")}</p>
            <Link
              href="/app/settings"
              className="ui-button"
              data-variant="outline"
              data-size="sm"
              style={{ marginTop: "8px" }}
            >
              <Icon name="plus" size={14} />
              <span>{t("inviteAssistantAction")}</span>
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {data.map((assistant) => (
              <div
                key={assistant.userId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "16px",
                  padding: "16px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--surface)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "200px" }}>
                  <Avatar name={assistant.name} size="md" />
                  <div>
                    <span style={{ fontWeight: 600, color: "var(--ink)", fontSize: "0.9375rem" }}>
                      {assistant.name}
                    </span>
                    <p style={{ margin: "2px 0 0", fontSize: "0.8125rem", color: "var(--muted)" }}>
                      {assistant.email}
                    </p>
                  </div>
                </div>

                {/* Contribution Counters */}
                <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                  <div style={{ textAlign: "center", minWidth: "90px" }}>
                    <div style={{ fontWeight: 700, fontSize: "1.125rem", color: "var(--ink)" }}>
                      {assistant.attendanceRecordedCount}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                      {t("teamAttendanceMarks")}
                    </span>
                  </div>

                  <div style={{ textAlign: "center", minWidth: "90px" }}>
                    <div style={{ fontWeight: 700, fontSize: "1.125rem", color: "var(--ink)" }}>
                      {assistant.homeworkReviewedCount}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                      {t("teamHomeworkReviewed")}
                    </span>
                  </div>

                  <div style={{ textAlign: "center", minWidth: "90px" }}>
                    <div style={{ fontWeight: 700, fontSize: "1.125rem", color: "var(--ink)" }}>
                      {assistant.examsGradedCount}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                      {t("teamExamsGraded")}
                    </span>
                  </div>
                </div>

                {/* Last Activity */}
                <div style={{ textAlign: "end", minWidth: "160px" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)", display: "block" }}>
                    {t("teamLastActivity")}
                  </span>
                  <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--ink)" }}>
                    {assistant.lastActivityAt
                      ? dateFormat.format(new Date(assistant.lastActivityAt))
                      : t("teamNoRecentActivity")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
