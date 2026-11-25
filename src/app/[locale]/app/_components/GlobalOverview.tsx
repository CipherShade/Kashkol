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

  const revenueTone = "success";

  const attendanceTone =
    attendance.rate !== null && attendance.rate < 75 ? "danger" : "success";

  return (
    <div className="app-stat-grid">
      {/* 1. Attendance */}
      <Link href="/app/sessions" className="ui-stat" data-interactive="true" data-tone={attendanceTone}>
        <div className="ui-stat-top">
          <span className="ui-stat-label">{t("kpiAttendanceTitle")}</span>
          <span className="ui-stat-icon" aria-hidden="true">
            <Icon name="checkCircle" size={18} />
          </span>
        </div>
        <div className="ui-stat-value">
          {attendance.rate !== null ? `${attendance.rate}%` : "—"}
        </div>
        {attendance.rate !== null ? (
          <div className="ui-stat-meter" aria-hidden="true">
            <span data-tone={attendanceTone} style={{ inlineSize: `${attendance.rate}%` }} />
          </div>
        ) : null}
        <div className="ui-stat-hint">
          <span>
            {t("kpiAttendanceCounts", {
              present: attendance.presentCount,
              absent: attendance.absentCount,
            })}
          </span>
          <span className="ui-stat-hint-sub">
            {attendance.awaitingCount > 0
              ? t("kpiAttendanceAwaiting", { count: attendance.awaitingCount })
              : t("kpiAttendanceUpToDate")}
          </span>
        </div>
      </Link>

      {/* 2. Revenue — owner-only. Assistants get no card, not even an empty one. */}
      {canSeeFinancials ? (
        <Link href="/app/payments" className="ui-stat" data-interactive="true" data-tone={revenueTone}>
          <div className="ui-stat-top">
            <span className="ui-stat-label">{t("kpiRevenueTitle")}</span>
            <span className="ui-stat-icon" aria-hidden="true">
              <Icon name="creditCard" size={18} />
            </span>
          </div>
          <div className="ui-stat-value">
            {formattedCollected}{" "}
            <span className="ui-stat-unit">{revenue.currency}</span>
          </div>
          <div className="ui-stat-hint">
            <span>{t("kpiRevenueCollectedHint", { currency: revenue.currency })}</span>
            <span className="ui-stat-hint-sub">
              {revenue.priorPeriodChangePercent !== null
                ? `${revenue.priorPeriodChangePercent > 0 ? "+" : ""}${revenue.priorPeriodChangePercent}%`
                : " "}
            </span>
          </div>
        </Link>
      ) : null}

      {/* 3. Students */}
      <Link href="/app/students" className="ui-stat" data-interactive="true" data-tone="primary">
        <div className="ui-stat-top">
          <span className="ui-stat-label">{t("kpiStudentsTitle")}</span>
          <span className="ui-stat-icon" aria-hidden="true">
            <Icon name="users" size={18} />
          </span>
        </div>
        <div className="ui-stat-value">{students.total}</div>
        <div className="ui-stat-hint">
          <span>
            {t("kpiStudentsActive", { count: students.active })}
            {students.inactive > 0 ? ` • ${t("kpiStudentsInactive", { count: students.inactive })}` : ""}
          </span>
          <span className="ui-stat-hint-sub">
            {t("kpiStudentsNewEnrolled", { count: students.newlyEnrolled })}
          </span>
        </div>
      </Link>

      {/* 4. Academic */}
      <Link href="/app/assessments" className="ui-stat" data-interactive="true">
        <div className="ui-stat-top">
          <span className="ui-stat-label">{t("kpiAcademicTitle")}</span>
          <span className="ui-stat-icon" aria-hidden="true">
            <Icon name="bar" size={18} />
          </span>
        </div>
        <div className="ui-stat-value">
          {academic.averageGradePercent !== null ? `${academic.averageGradePercent}%` : "—"}
        </div>
        <div className="ui-stat-hint">
          <span>
            {academic.homeworkCompletionRate !== null
              ? t("kpiAcademicHomeworkRate", { rate: academic.homeworkCompletionRate })
              : t("kpiAcademicNoAssessments")}
          </span>
          <span className="ui-stat-hint-sub">
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
