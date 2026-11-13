import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import type { DashboardData } from "@/modules/dashboard/schemas";

type GlobalOverviewProps = {
  data: DashboardData["globalOverview"];
  canSeeFinancials: boolean;
};

export function GlobalOverview({ data, canSeeFinancials }: GlobalOverviewProps) {
  const t = useTranslations("Dashboard");

  const students = data.students;
  const revenue = data.revenue;
  const attendance = data.attendance;
  const academic = data.academic;

  const formattedCollected = (revenue.collectedMinor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  const formattedExpected =
    revenue.expectedMinor !== null
      ? (revenue.expectedMinor / 100).toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })
      : null;

  return (
    <div className="app-stat-grid" style={{ marginBottom: "24px" }}>
      {/* 1. Students Card */}
      <Link
        href="/app/students"
        className="ui-stat"
        data-interactive="true"
        data-variant="invert"
        style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
      >
        <div className="ui-stat-top">
          <span className="ui-stat-label">{t("kpiStudentsTitle")}</span>
          <span className="ui-stat-icon" aria-hidden="true">
            <Icon name="users" size={18} />
          </span>
        </div>
        <div className="ui-stat-value">{students.total}</div>
        <div className="ui-stat-hint" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span>
            {t("kpiStudentsActive", { count: students.active })}
            {students.inactive > 0 ? ` • ${t("kpiStudentsInactive", { count: students.inactive })}` : ""}
          </span>
          <span style={{ fontSize: "0.75rem", opacity: 0.85 }}>
            {t("kpiStudentsNewEnrolled", { count: students.newlyEnrolled })}
          </span>
        </div>
      </Link>

      {/* 2. Revenue Card */}
      {canSeeFinancials ? (
        <Link
          href="/app/payments"
          className="ui-stat"
          data-interactive="true"
          data-tone={
            revenue.expectedMinor !== null && revenue.collectedMinor < revenue.expectedMinor
              ? "warn"
              : "success"
          }
          style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
        >
          <div className="ui-stat-top">
            <span className="ui-stat-label">{t("kpiRevenueTitle")}</span>
            <span className="ui-stat-icon" aria-hidden="true">
              <Icon name="creditCard" size={18} />
            </span>
          </div>
          <div className="ui-stat-value">
            {formattedCollected} <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>{revenue.currency}</span>
          </div>
          <div className="ui-stat-hint" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "0.75rem", opacity: 0.85 }}>
              {formattedExpected !== null
                ? t("kpiRevenueExpected", { amount: formattedExpected, currency: revenue.currency })
                : t("kpiRevenueNoRules")}
              {revenue.priorPeriodChangePercent !== null
                ? ` • ${revenue.priorPeriodChangePercent > 0 ? "+" : ""}${revenue.priorPeriodChangePercent}%`
                : ""}
            </span>
          </div>
        </Link>
      ) : (
        <div className="ui-stat" data-tone="muted">
          <div className="ui-stat-top">
            <span className="ui-stat-label">{t("kpiRevenueTitle")}</span>
            <span className="ui-stat-icon" aria-hidden="true">
              <Icon name="lock" size={18} />
            </span>
          </div>
          <div className="ui-stat-value">—</div>
          <div className="ui-stat-hint">{t("permissionRestricted")}</div>
        </div>
      )}

      {/* 3. Attendance Card */}
      <Link
        href="/app/sessions"
        className="ui-stat"
        data-interactive="true"
        data-tone={attendance.rate !== null && attendance.rate < 75 ? "danger" : "primary"}
        style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
      >
        <div className="ui-stat-top">
          <span className="ui-stat-label">{t("kpiAttendanceTitle")}</span>
          <span className="ui-stat-icon" aria-hidden="true">
            <Icon name="checkCircle" size={18} />
          </span>
        </div>
        <div className="ui-stat-value">
          {attendance.rate !== null ? `${attendance.rate}%` : "—"}
        </div>
        <div className="ui-stat-hint" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span>
            {t("kpiAttendanceCounts", {
              present: attendance.presentCount,
              absent: attendance.absentCount,
            })}
          </span>
          <span style={{ fontSize: "0.75rem", opacity: 0.85 }}>
            {attendance.awaitingCount > 0
              ? t("kpiAttendanceAwaiting", { count: attendance.awaitingCount })
              : t("kpiAttendanceUpToDate")}
          </span>
        </div>
      </Link>

      {/* 4. Academic Performance Card */}
      <Link
        href="/app/assessments"
        className="ui-stat"
        data-interactive="true"
        data-tone="default"
        style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
      >
        <div className="ui-stat-top">
          <span className="ui-stat-label">{t("kpiAcademicTitle")}</span>
          <span className="ui-stat-icon" aria-hidden="true">
            <Icon name="bar" size={18} />
          </span>
        </div>
        <div className="ui-stat-value">
          {academic.averageGradePercent !== null ? `${academic.averageGradePercent}%` : "—"}
        </div>
        <div className="ui-stat-hint" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span>
            {academic.homeworkCompletionRate !== null
              ? t("kpiAcademicHomeworkRate", { rate: academic.homeworkCompletionRate })
              : t("kpiAcademicNoAssessments")}
          </span>
          <span style={{ fontSize: "0.75rem", opacity: 0.85 }}>
            {academic.priorPeriodChangePercent !== null
              ? t("kpiAcademicTrendChange", {
                  change: `${academic.priorPeriodChangePercent > 0 ? "+" : ""}${academic.priorPeriodChangePercent}%`,
                })
              : t("kpiAcademicAssessmentsActive")}
          </span>
        </div>
      </Link>
    </div>
  );
}
