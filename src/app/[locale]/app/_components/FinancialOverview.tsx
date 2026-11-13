import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { TrendLineChart } from "./charts/TrendLineChart";
import { BarChart } from "./charts/BarChart";
import type { FinancialSummary } from "@/modules/dashboard/schemas";

type FinancialOverviewProps = {
  data: FinancialSummary | null;
  currency: string;
};

export function FinancialOverview({ data, currency }: FinancialOverviewProps) {
  const t = useTranslations("Dashboard");

  if (!data) {
    return (
      <Card labelledBy="financial-overview-title" className="app-page-section">
        <CardHeader
          title={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Icon name="creditCard" size={20} />
              <span>{t("financialTitle")}</span>
            </div>
          }
          titleId="financial-overview-title"
        />
        <CardBody>
          <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)" }}>
            <p>{t("financialRestrictedMessage")}</p>
          </div>
        </CardBody>
      </Card>
    );
  }

  const formattedCollected = (data.totalRevenueMinor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  const formattedExpected =
    data.expectedRevenueMinor !== null
      ? (data.expectedRevenueMinor / 100).toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })
      : null;

  const trendData = data.revenueTrend.map((d) => ({
    label: d.label.slice(5), // "MM"
    value: Math.round(d.amountMinor / 100),
  }));

  const groupBarItems = data.revenueByGroup
    .filter((g) => g.amountMinor > 0)
    .map((g) => ({
      id: g.groupId,
      label: g.groupName,
      value: Math.round(g.amountMinor / 100),
      color: g.color,
    }));

  return (
    <Card labelledBy="financial-overview-title" className="app-page-section">
      <CardHeader
        title={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon name="creditCard" size={20} />
            <span>{t("financialTitle")}</span>
            <Badge tone="success">
              {formattedCollected} {currency}
            </Badge>
          </div>
        }
        titleId="financial-overview-title"
        description={t("financialSubtitle")}
        actions={
          <Link
            href="/app/payments"
            className="ui-button"
            data-variant="secondary"
            data-size="sm"
          >
            <Icon name="bar" size={14} />
            <span>{t("openPaymentsLedger")}</span>
          </Link>
        }
      />
      <CardBody>
        {/* KPI Row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}>
              {t("financialCollectedLabel")}
            </span>
            <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--ink)", marginTop: "4px" }}>
              {formattedCollected} <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{currency}</span>
            </div>
          </div>

          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 500 }}>
              {t("financialExpectedLabel")}
            </span>
            <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--ink)", marginTop: "4px" }}>
              {formattedExpected !== null ? (
                <>
                  {formattedExpected} <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{currency}</span>
                </>
              ) : (
                <span style={{ fontSize: "0.9375rem", color: "var(--muted)", fontWeight: 400 }}>
                  {t("kpiRevenueNoRules")}
                </span>
              )}
            </div>
          </div>

        </div>

        {/* Charts Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "24px",
            marginBottom: "24px",
          }}
        >
          {/* Revenue Over Time Line Chart */}
          <div
            style={{
              padding: "20px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              backgroundColor: "var(--surface)",
            }}
          >
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 16px", color: "var(--ink)" }}>
              {t("financialTrendChartTitle")}
            </h3>
            <TrendLineChart
              data={trendData}
              height={180}
              valueFormatter={(val) => `${val.toLocaleString()} ${currency}`}
              emptyLabel={t("financialTrendEmpty")}
            />
          </div>

          {/* Revenue By Group Bar Chart */}
          <div
            style={{
              padding: "20px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              backgroundColor: "var(--surface)",
            }}
          >
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 16px", color: "var(--ink)" }}>
              {t("financialByGroupChartTitle")}
            </h3>
            {groupBarItems.length > 0 ? (
              <BarChart
                items={groupBarItems}
                valueFormatter={(val) => `${val.toLocaleString()} ${currency}`}
              />
            ) : (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--muted)", fontSize: "0.875rem" }}>
                {t("financialByGroupEmpty")}
              </div>
            )}
          </div>
        </div>

        {/* Recent Transactions List */}
        {data.recentPayments.length > 0 && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: 0, color: "var(--ink)" }}>
                {t("financialRecentPaymentsTitle")}
              </h3>
              <Link
                href="/app/payments"
                style={{ fontSize: "0.8125rem", color: "var(--primary)", textDecoration: "none", fontWeight: 500 }}
              >
                {t("viewAllAction")}
              </Link>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {data.recentPayments.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--surface-2)",
                    fontSize: "0.875rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ color: "var(--success)", display: "inline-flex" }}>
                      <Icon name="checkCircle" size={16} />
                    </span>
                    <Link
                      href={p.studentId ? `/app/students/${p.studentId}` : "/app/payments"}
                      style={{ fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}
                    >
                      {p.studentName}
                    </Link>
                    <Badge tone="neutral">{p.method}</Badge>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>{p.paidOn}</span>
                    <span style={{ fontWeight: 700, color: "var(--success)" }}>
                      +{(p.amountMinor / 100).toLocaleString()} {currency}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
