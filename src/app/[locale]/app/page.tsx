import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/ui/icon";
import { requireStaffSession } from "@/modules/identity/session";
import { getDashboardData } from "@/modules/dashboard/service";
import { dashboardFilterSchema } from "@/modules/dashboard/schemas";
import { DashboardHeader } from "./_components/DashboardHeader";
import { GlobalOverview } from "./_components/GlobalOverview";
import { TodayOperations } from "./_components/TodayOperations";
import { AttentionCenter } from "./_components/AttentionCenter";
import { FinancialOverview } from "./_components/FinancialOverview";
import { AcademicOverview } from "./_components/AcademicOverview";
import { PendingWork } from "./_components/PendingWork";
import { TeamActivity } from "./_components/TeamActivity";
import { RecentActivity } from "./_components/RecentActivity";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Dashboard" });
  return { title: t("title") };
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  const { user, scope } = await requireStaffSession();
  const t = await getTranslations("Dashboard");

  const filter = dashboardFilterSchema.parse({
    period: resolvedSearchParams.period || "this_month",
  });

  const data = await getDashboardData(scope, filter);

  return (
    <div className="app-page">
      {/* Dashboard Header */}
      <DashboardHeader
        userName={user.name}
        workspace={data.workspace}
        activePeriod={filter.period}
        canSeeSettings={data.permissions.canSeeTeam}
      />

      {/* Section 1: Global Overview */}
      <GlobalOverview
        data={data.globalOverview}
        canSeeFinancials={data.permissions.canSeeFinancials}
      />

      {/* Section 2: Today's Operations */}
      <TodayOperations data={data.todayOperations} locale={locale} />

      {/* Section 3: Attention Center */}
      <AttentionCenter
        students={data.attentionCenter.students}
        alerts={data.attentionCenter.alerts}
      />

      {/* Section 4: Financial Overview */}
      <FinancialOverview
        data={data.financialOverview}
        currency={data.workspace.currency}
      />

      {/* Section 5: Academic Overview */}
      <AcademicOverview data={data.academicOverview} />

      {/* Section 6: Pending Work */}
      <PendingWork data={data.pendingWork} />

      {/* Section 7: Team Activity */}
      {data.permissions.canSeeTeam ? (
        <TeamActivity data={data.teamActivity} locale={locale} />
      ) : null}

      {/* Section 8: Recent Activity */}
      <RecentActivity events={data.recentActivity} locale={locale} />

      {/* Trust & Audit Note */}
      <p className="app-inline-note" style={{ marginTop: "16px" }}>
        <Icon name="shield" size={15} />
        <span>{t("auditNote")}</span>
      </p>
    </div>
  );
}
