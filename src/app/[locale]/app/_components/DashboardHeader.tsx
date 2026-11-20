import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import type { DashboardData, DashboardFilter } from "@/modules/dashboard/schemas";

type DashboardHeaderProps = {
  userName: string;
  workspace: DashboardData["workspace"];
  activePeriod: DashboardFilter["period"];
  canSeeSettings: boolean;
  currentDate: string;
  sessionCount: number;
  attentionCount: number;
  locale: string;
};

export function DashboardHeader({
  userName,
  workspace,
  activePeriod,
  canSeeSettings,
  currentDate,
  sessionCount,
  attentionCount,
  locale,
}: DashboardHeaderProps) {
  const t = useTranslations("Dashboard");

  const periods: Array<{ key: DashboardFilter["period"]; labelKey: string }> = [
    { key: "today", labelKey: "periodToday" },
    { key: "this_week", labelKey: "periodThisWeek" },
    { key: "this_month", labelKey: "periodThisMonth" },
    { key: "all", labelKey: "periodAll" },
  ];

  const dateLabel = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${currentDate}T12:00:00`));

  return (
    <section className="app-hero">
      <div className="app-hero-layout">
        <div className="app-hero-copy">
          <div className="app-hero-topline">
            <span className="app-hero-meta">{dateLabel}</span>
            <span className="app-hero-context">
              {workspace.name}
              {workspace.primarySubject ? ` • ${workspace.primarySubject}` : ""}
            </span>
          </div>

          <h1 className="ui-page-title">{t("heroTitle", { name: userName })}</h1>

          <p className="app-hero-subtitle">
            {t("heroSummary", { sessions: sessionCount, attention: attentionCount })}
          </p>
        </div>

        <div className="app-hero-actions">
          <div role="tablist" aria-label={t("filterPeriodAria")} className="app-hero-periods">
            {periods.map(({ key, labelKey }) => {
              const isActive = activePeriod === key;
              return (
                <Link
                  key={key}
                  href={`/app?period=${key}`}
                  role="tab"
                  aria-selected={isActive}
                  className="app-hero-period"
                  data-active={isActive}
                >
                  {t(labelKey)}
                </Link>
              );
            })}
          </div>

          {canSeeSettings ? (
            <Link href="/app/settings" className="ui-button" data-variant="secondary" data-size="sm">
              <Icon name="gear" size={15} />
              <span>{t("manageSettings")}</span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
