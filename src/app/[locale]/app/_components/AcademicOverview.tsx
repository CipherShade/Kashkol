import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { BarChart } from "./charts/BarChart";
import { TrendLineChart } from "./charts/TrendLineChart";
import type { AcademicSummary } from "@/modules/dashboard/schemas";

type AcademicOverviewProps = {
  data: AcademicSummary;
};

export function AcademicOverview({ data }: AcademicOverviewProps) {
  const t = useTranslations("Dashboard");

  const groupBarItems = data.groupComparisons
    .filter((g) => g.averagePercent !== null)
    .map((g) => ({
      id: g.groupId,
      label: g.groupName,
      value: g.averagePercent ?? 0,
      color: g.color,
      supportingText: t("academicGroupGradedCount", { count: g.gradedCount }),
    }));

  const trendData = data.gradeTrend.map((d) => ({
    label: d.label.length > 10 ? `${d.label.slice(0, 8)}…` : d.label,
    value: d.averagePercent ?? 0,
  }));

  return (
    <Card labelledBy="academic-overview-title" className="app-page-section">
      <CardHeader
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="bar" size={20} />
            <span>{t("academicTitle")}</span>
            {data.overallAveragePercent !== null ? (
              <Badge tone="primary">
                {t("academicOverallAverage", { percent: data.overallAveragePercent })}
              </Badge>
            ) : null}
          </div>
        }
        titleId="academic-overview-title"
        description={t("academicSubtitle")}
        actions={
          <div style={{ display: "flex", gap: "8px" }}>
            <Link
              href="/app/assessments"
              className="ui-button"
              data-variant="secondary"
              data-size="sm"
            >
              <Icon name="target" size={14} />
              <span>{t("openAssessmentsAction")}</span>
            </Link>
          </div>
        }
      />
      <CardBody>
        {/* Academic Highlights */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          {/* Overall Average */}
          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}>
              {t("academicOverallAverageLabel")}
            </span>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ink)", marginTop: "4px" }}>
              {data.overallAveragePercent !== null ? `${data.overallAveragePercent}%` : "—"}
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              {t("academicCalculatedFromScores")}
            </span>
          </div>

          {/* Highest Performing Group */}
          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}>
              {t("academicHighestGroupLabel")}
            </span>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--success)", marginTop: "4px" }}>
              {data.highestPerformingGroup ? data.highestPerformingGroup.name : "—"}
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              {data.highestPerformingGroup
                ? `${data.highestPerformingGroup.averagePercent}% ${t("academicAverageSuffix")}`
                : t("academicInsufficientData")}
            </span>
          </div>

          {/* Group Requiring Attention */}
          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}>
              {t("academicNeedsAttentionGroupLabel")}
            </span>
            <div
              style={{
                fontSize: "1.25rem",
                fontWeight: 700,
                color: data.needsAttentionGroup ? "var(--warn)" : "var(--ink)",
                marginTop: "4px",
              }}
            >
              {data.needsAttentionGroup ? data.needsAttentionGroup.name : "—"}
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              {data.needsAttentionGroup
                ? `${data.needsAttentionGroup.averagePercent}% ${t("academicAverageSuffix")}`
                : t("academicInsufficientData")}
            </span>
          </div>

          {/* Homework Completion */}
          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}>
              {t("academicHomeworkCompletionLabel")}
            </span>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--ink)", marginTop: "4px" }}>
              {data.homeworkCompletionRate !== null ? `${data.homeworkCompletionRate}%` : "—"}
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              {t("academicActiveSubmissionsCount")}
            </span>
          </div>
        </div>

        {/* Charts Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "24px",
          }}
        >
          {/* Group Performance Comparison Bar Chart */}
          <div
            style={{
              padding: "20px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              backgroundColor: "var(--surface)",
            }}
          >
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 16px", color: "var(--ink)" }}>
              {t("academicGroupComparisonChartTitle")}
            </h3>
            {groupBarItems.length > 0 ? (
              <BarChart
                items={groupBarItems}
                maxValue={100}
                valueFormatter={(val) => `${val}%`}
              />
            ) : (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--muted)", fontSize: "0.875rem" }}>
                {t("academicNoScoresRecorded")}
              </div>
            )}
          </div>

          {/* Grade Trend Line Chart */}
          <div
            style={{
              padding: "20px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              backgroundColor: "var(--surface)",
            }}
          >
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 16px", color: "var(--ink)" }}>
              {t("academicGradeTrendChartTitle")}
            </h3>
            {trendData.length > 0 ? (
              <TrendLineChart
                data={trendData}
                color="var(--chart-2, #5cc8a1)"
                height={180}
                valueFormatter={(val) => `${val}%`}
                emptyLabel={t("academicGradeTrendEmpty")}
              />
            ) : (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--muted)", fontSize: "0.875rem" }}>
                {t("academicGradeTrendEmpty")}
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
