import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BarChart } from "@/app/[locale]/app/_components/charts/BarChart";
import { TrendLineChart } from "@/app/[locale]/app/_components/charts/TrendLineChart";
import {
  formatPerformanceDate,
  formatPerformanceNumber,
  formatPerformancePercent,
} from "@/components/performance/performance-format";
import { PerformanceSettingsClient } from "@/components/performance/performance-settings-client";
import { Alert } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormField, Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { DataTable, type Column } from "@/components/ui/table";
import { requireStaffSession } from "@/modules/identity/session";
import {
  getPerformanceOverview,
  performanceOverviewQuerySchema,
} from "@/modules/performance";
import { isAllowed } from "@/modules/tenancy/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Performance" });
  return { title: t("title") };
}

function value(source: Record<string, string | string[] | undefined>, key: string) {
  const raw = source[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export default async function PerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { scope } = await requireStaffSession();
  const t = await getTranslations("Performance");
  if (!isAllowed(scope, "grades", "read")) {
    return (
      <div className="app-page">
        <PageHeader title={t("title")} />
        <Card>
          <CardBody>{t("noPermission")}</CardBody>
        </Card>
      </div>
    );
  }

  const raw = await searchParams;
  const parsed = performanceOverviewQuerySchema.safeParse({
    ...(value(raw, "from") ? { from: value(raw, "from") } : {}),
    ...(value(raw, "to") ? { to: value(raw, "to") } : {}),
    ...(value(raw, "groupId") ? { groupId: value(raw, "groupId") } : {}),
    ...(value(raw, "subjectId") ? { subjectId: value(raw, "subjectId") } : {}),
    ...(value(raw, "q") ? { q: value(raw, "q") } : {}),
  });
  const query = parsed.success ? parsed.data : {};
  const canWrite = isAllowed(scope, "grades", "write");
  const canWriteSettings = isAllowed(scope, "settings", "write");
  const result = await getPerformanceOverview(scope, query);

  const trendLabel = {
    improving: t("trends.improving"),
    steady: t("trends.steady"),
    declining: t("trends.declining"),
    insufficient_data: t("trends.insufficient_data"),
  }[result.overall.trend.classification];

  const dataState =
    result.dataState === "no_data"
      ? { title: t("states.noDataTitle"), description: t("states.noData"), tone: "info" as const }
      : result.dataState === "insufficient_data"
        ? { title: t("states.insufficientTitle"), description: t("states.insufficient"), tone: "warning" as const }
        : null;

  const topicItems = result.topics.slice(0, 8).map((topic) => ({
    id: topic.topic,
    label: topic.topic,
    value: topic.incorrectRatePercent,
    supportingText: t("profile.observations", { count: topic.observedCount }),
  }));

  const groupItems = result.groupSummaries.slice(0, 10).map((group) => ({
    id: group.groupId,
    label: group.groupName,
    value: group.summary.averagePercent ?? 0,
    supportingText: t("overview.sampleCount", { count: group.summary.gradedCount }),
  }));

  const volumeItems = result.assessmentVolume.slice(0, 8).map((assessment) => ({
    id: assessment.id,
    label: assessment.title,
    value: assessment.gradedCount,
    supportingText: formatPerformanceDate(assessment.date, locale),
  }));

  const trendData = result.assessmentAverages.map((assessment) => ({
    label: formatPerformanceDate(assessment.date, locale),
    value: assessment.averagePercent,
  }));

  type StudentRow = (typeof result.studentSummaries)[number];
  const studentColumns: Array<Column<StudentRow>> = [
    {
      key: "name",
      header: t("overview.name"),
      cell: (row) => (
        <Link
          className="app-student-link"
          href={`/app/performance/students/${row.studentId}`}
        >
          {row.name}
        </Link>
      ),
    },
    { key: "grade", header: t("overview.grade"), cell: (row) => row.grade ?? "—" },
    {
      key: "average",
      header: t("overview.average"),
      align: "end",
      cell: (row) => formatPerformancePercent(row.summary.averagePercent, locale),
    },
    {
      key: "graded",
      header: t("overview.gradedResults"),
      align: "end",
      cell: (row) => formatPerformanceNumber(row.summary.gradedCount, locale),
    },
    {
      key: "trend",
      header: t("overview.trend"),
      cell: (row) =>
        ({
          improving: t("trends.improving"),
          steady: t("trends.steady"),
          declining: t("trends.declining"),
          insufficient_data: t("trends.insufficient_data"),
        })[row.trend.classification],
    },
    {
      key: "risks",
      header: t("overview.atRisk"),
      align: "end",
      cell: (row) =>
        row.riskCount > 0 ? t("overview.riskCount", { count: row.riskCount }) : t("overview.noRisks"),
    },
  ];

  return (
    <div className="app-page space-y-6">
      <PageHeader
        eyebrow={t("title")}
        title={t("overview.title")}
        description={t("subtitle")}
        actions={
          canWrite ? (
            <Link className="ui-button" data-variant="secondary" href="/app/performance/bulk-grades">
              {t("bulk.title")}
            </Link>
          ) : null
        }
      />

      <Card>
        <CardHeader title={t("filters.title")} description={t("filters.active")} titleId="performance-filters-title" />
        <CardBody>
          <form method="get" className="grid gap-3 md:grid-cols-5 md:items-end">
            <FormField label={t("filters.from")}>
              <Input type="date" name="from" defaultValue={query.from ?? ""} />
            </FormField>
            <FormField label={t("filters.to")}>
              <Input type="date" name="to" defaultValue={query.to ?? ""} />
            </FormField>
            <FormField label={t("filters.group")}>
              <Select name="groupId" defaultValue={query.groupId ?? ""}>
                <option value="">{t("filters.allGroups")}</option>
                {result.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t("filters.subject")}>
              <Select name="subjectId" defaultValue={query.subjectId ?? ""}>
                <option value="">{t("filters.allSubjects")}</option>
                {result.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t("filters.studentSearch")}>
              <Input name="q" maxLength={120} defaultValue={query.q ?? ""} />
            </FormField>
            <div className="flex gap-2 md:col-span-5">
              <button type="submit" className="ui-button" data-variant="primary">
                {t("filters.apply")}
              </button>
              <Link className="ui-button" data-variant="secondary" href="/app/performance">
                {t("filters.reset")}
              </Link>
            </div>
          </form>
        </CardBody>
      </Card>

      {dataState ? (
        <Alert tone={dataState.tone} title={dataState.title} description={dataState.description} />
      ) : null}

      <div className="app-kpi-grid">
        <Stat
          label={t("overview.gradedResults")}
          value={formatPerformanceNumber(result.overall.gradedResultCount, locale)}
          hint={t("overview.sampleCount", { count: result.overall.summary.totalRecords })}
          icon="checkCircle"
        />
        <Stat
          label={t("overview.average")}
          value={formatPerformancePercent(result.overall.summary.averagePercent, locale)}
          hint={trendLabel}
          icon="target"
        />
        <Stat
          label={t("overview.atRisk")}
          value={formatPerformanceNumber(result.overall.atRiskStudentCount, locale)}
          hint={t("overview.students")}
          icon="alert"
          tone={result.overall.atRiskStudentCount > 0 ? "warn" : "default"}
        />
        <Stat
          label={t("overview.insufficientStudents")}
          value={formatPerformanceNumber(result.overall.insufficientDataStudentCount, locale)}
          hint={t("states.insufficient")}
          icon="info"
          tone="muted"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title={t("overview.topicRates")} titleId="performance-topics-chart-title" />
          <CardBody>
            <BarChart
              items={topicItems}
              maxValue={100}
              valueFormatter={(value) => formatPerformancePercent(value, locale)}
              emptyLabel={t("class.noEvidence")}
              ariaLabel={t("overview.topicRates")}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("overview.groupAverages")} titleId="performance-groups-chart-title" />
          <CardBody>
            <BarChart
              items={groupItems}
              maxValue={100}
              valueFormatter={(value) => formatPerformancePercent(value, locale)}
              emptyLabel={t("overview.noGroups")}
              ariaLabel={t("overview.groupAverages")}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("overview.assessmentVolume")} titleId="performance-volume-chart-title" />
          <CardBody>
            <BarChart
              items={volumeItems}
              valueFormatter={(value) => formatPerformanceNumber(value, locale)}
              emptyLabel={t("states.noData")}
              ariaLabel={t("overview.assessmentVolume")}
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("profile.history")} titleId="performance-history-chart-title" />
        <CardBody>
          <TrendLineChart
            data={trendData}
            valueFormatter={(value) => formatPerformancePercent(value, locale)}
            emptyLabel={t("profile.noHistory")}
            ariaLabel={t("profile.history")}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("overview.studentTable")}
          description={t("overview.studentCountHint")}
          titleId="performance-students-title"
        />
        <CardBody>
          <DataTable
            caption={t("overview.studentTable")}
            columns={studentColumns}
            rows={result.studentSummaries}
            rowKey={(row) => row.studentId}
            empty={t("overview.noStudents")}
            scrollLabel={t("overview.studentTable")}
          />
          {result.groupSummaries.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {result.groupSummaries.map((group) => (
                <Link
                  key={group.groupId}
                  className="ui-button"
                  data-variant="outline"
                  href={`/app/performance/classes/${group.groupId}`}
                >
                  {t("overview.openClass")}: {group.groupName}
                </Link>
              ))}
            </div>
          ) : null}
        </CardBody>
      </Card>

      {canWriteSettings ? (
        <PerformanceSettingsClient initialSettings={result.settings} canWrite={canWriteSettings} />
      ) : null}
    </div>
  );
}
