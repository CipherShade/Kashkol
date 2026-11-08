import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import type { PendingWorkSummary } from "@/modules/dashboard/schemas";

type PendingWorkProps = {
  data: PendingWorkSummary;
};

export function PendingWork({ data }: PendingWorkProps) {
  const t = useTranslations("Dashboard");

  const cards = [
    {
      id: "homework",
      title: t("pendingHwTitle"),
      icon: "book" as const,
      count: data.homework.awaitingReviewCount + data.homework.pendingSubmissionsCount,
      primaryHint: t("pendingHwAwaitingReview", { count: data.homework.awaitingReviewCount }),
      secondaryHint: t("pendingHwNotSubmitted", { count: data.homework.pendingSubmissionsCount }),
      link: "/app/homework",
      linkText: t("pendingOpenHw"),
      tone: (data.homework.awaitingReviewCount > 0 ? "warn" : "neutral") as "warn" | "neutral",
    },
    {
      id: "exams",
      title: t("pendingExamsTitle"),
      icon: "bar" as const,
      count: data.exams.awaitingGradingCount + data.exams.upcomingCount,
      primaryHint: t("pendingExamsAwaitingGrading", { count: data.exams.awaitingGradingCount }),
      secondaryHint: t("pendingExamsUpcoming", { count: data.exams.upcomingCount }),
      link: "/app/assessments",
      linkText: t("pendingOpenExams"),
      tone: (data.exams.awaitingGradingCount > 0 ? "danger" : "neutral") as "danger" | "neutral",
    },
    {
      id: "essays",
      title: t("pendingEssaysTitle"),
      icon: "edit" as const,
      count: data.essays.awaitingGradingCount,
      primaryHint: t("pendingEssaysAwaitingManual", { count: data.essays.awaitingGradingCount }),
      secondaryHint: t("pendingEssaysInExams"),
      link: "/app/assessments",
      linkText: t("pendingOpenEssays"),
      tone: (data.essays.awaitingGradingCount > 0 ? "warn" : "neutral") as "warn" | "neutral",
    },
    {
      id: "forms",
      title: t("pendingFormsTitle"),
      icon: "clipboard" as const,
      count: data.forms.activeFormsCount,
      primaryHint: t("pendingFormsActiveCount", { count: data.forms.activeFormsCount }),
      secondaryHint: t("pendingFormsSubmissionsCount", { count: data.forms.recentSubmissionsCount }),
      link: "/app/forms",
      linkText: t("pendingOpenForms"),
      tone: "neutral" as const,
    },
  ];

  return (
    <Card labelledBy="pending-work-title" className="app-page-section">
      <CardHeader
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="clock" size={20} />
            <span>{t("pendingTitle")}</span>
          </div>
        }
        titleId="pending-work-title"
        description={t("pendingSubtitle")}
      />
      <CardBody>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          {cards.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "16px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, color: "var(--ink)" }}>
                    <Icon name={item.icon} size={16} />
                    <span>{item.title}</span>
                  </span>
                  <Badge tone={item.tone}>{item.count}</Badge>
                </div>
                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "3px" }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--ink)" }}>
                    {item.primaryHint}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                    {item.secondaryHint}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: "16px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                <Link
                  href={item.link}
                  className="ui-button"
                  data-variant="ghost"
                  data-size="sm"
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  <span>{item.linkText}</span>
                  <Icon name="arrowRight" size={13} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
