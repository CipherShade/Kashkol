import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import type { DashboardData, DashboardFilter } from "@/modules/dashboard/schemas";

type DashboardHeaderProps = {
  userName: string;
  workspace: DashboardData["workspace"];
  activePeriod: DashboardFilter["period"];
  canSeeSettings: boolean;
};

export function DashboardHeader({
  userName,
  workspace,
  activePeriod,
  canSeeSettings,
}: DashboardHeaderProps) {
  const t = useTranslations("Dashboard");

  const periods: Array<{ key: DashboardFilter["period"]; labelKey: string }> = [
    { key: "today", labelKey: "periodToday" },
    { key: "this_week", labelKey: "periodThisWeek" },
    { key: "this_month", labelKey: "periodThisMonth" },
    { key: "all", labelKey: "periodAll" },
  ];

  return (
    <section className="app-hero" style={{ marginBottom: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span className="ui-page-eyebrow">{t("eyebrow")}</span>
            <Badge tone="primary" icon="shield">
              {workspace.name}
            </Badge>
          </div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "var(--ink)",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            {t("heroTitle", { name: userName })}
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--muted)",
              marginTop: "4px",
              marginBottom: 0,
            }}
          >
            {workspace.teachingName}
            {workspace.primarySubject ? ` • ${workspace.primarySubject}` : ""}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Period selector */}
          <div
            role="tablist"
            aria-label={t("filterPeriodAria")}
            style={{
              display: "inline-flex",
              backgroundColor: "var(--surface-sunken, #e5e5df)",
              borderRadius: "var(--radius-pill, 999px)",
              padding: "3px",
              gap: "2px",
            }}
          >
            {periods.map(({ key, labelKey }) => {
              const isActive = activePeriod === key;
              return (
                <Link
                  key={key}
                  href={`/app?period=${key}`}
                  role="tab"
                  aria-selected={isActive}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "var(--radius-pill, 999px)",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    textDecoration: "none",
                    transition: "all 0.15s ease",
                    backgroundColor: isActive ? "var(--surface, #ffffff)" : "transparent",
                    color: isActive ? "var(--ink, #0b0b0d)" : "var(--muted, #6e6e76)",
                    boxShadow: isActive ? "var(--shadow-sm)" : "none",
                  }}
                >
                  {t(labelKey)}
                </Link>
              );
            })}
          </div>

          {canSeeSettings ? (
            <Link
              href="/app/settings"
              className="ui-button"
              data-variant="secondary"
              data-size="sm"
            >
              <Icon name="gear" size={15} />
              <span>{t("manageSettings")}</span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
