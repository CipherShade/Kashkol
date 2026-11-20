import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { TrendLineChart } from "@/app/[locale]/app/_components/charts/TrendLineChart";
import {
  formatPerformanceDate,
  formatPerformanceNumber,
  formatPerformancePercent,
} from "@/components/performance/performance-format";
import { StudentPerformanceActions } from "@/components/performance/student-performance-actions";
import { Alert } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { DataTable, type Column } from "@/components/ui/table";
import { AppError } from "@/lib/http/errors";
import { requireStaffSession } from "@/modules/identity/session";
import {
  getPerformancePaperAssessments,
  getStudentPerformance,
  studentPerformanceQuerySchema,
} from "@/modules/performance";
import { isAllowed } from "@/modules/tenancy/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; studentId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Performance.profile" });
  return { title: t("title") };
}

function value(source: Record<string, string | string[] | undefined>, key: string) {
  const raw = source[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

const riskCopy = {
  low_average: {
    title: "risks.low_average.title",
    description: "risks.low_average.description",
    action: "risks.low_average.action",
  },
  declining_trend: {
    title: "risks.declining_trend.title",
    description: "risks.declining_trend.description",
    action: "risks.declining_trend.action",
  },
  weak_topic: {
    title: "risks.weak_topic.title",
    description: "risks.weak_topic.description",
    action: "risks.weak_topic.action",
  },
} as const;

export default async function StudentPerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, studentId } = await params;
  setRequestLocale(locale);
  const { scope } = await requireStaffSession();
  const t = await getTranslations("Performance");
  if (!isAllowed(scope, "grades", "read")) {
    return (
      <div className="app-page">
        <PageHeader title={t("profile.title")} />
        <Card>
          <CardBody>{t("noPermission")}</CardBody>
        </Card>
      </div>
    );
  }

  const raw = await searchParams;
  const parsed = studentPerformanceQuerySchema.safeParse({
    ...(value(raw, "from") ? { from: value(raw, "from") } : {}),
    ...(value(raw, "to") ? { to: value(raw, "to") } : {}),
    ...(value(raw, "type") ? { type: value(raw, "type") } : {}),
  });
  const query = parsed.success ? parsed.data : {};
  const canWrite = isAllowed(scope, "grades", "write") && isAllowed(scope, "students", "read");

  let profile;
  try {
    profile = await getStudentPerformance(scope, studentId, query);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const assessments = canWrite ? await getPerformancePaperAssessments(scope, studentId) : [];

  const dataState =
    profile.dataState === "no_data"
      ? { title: t("states.noDataTitle"), description: t("states.noData"), tone: "info" as const }
      : profile.dataState === "insufficient_data"
        ? { title: t("states.insufficientTitle"), description: t("states.insufficient"), tone: "warning" as const }
        : null;

  const trendData = profile.history
    .filter((row) => row.percent !== null)
    .map((row) => ({ label: formatPerformanceDate(row.date, locale), value: row.percent ?? 0 }));

  type HistoryRow = (typeof profile.history)[number];
  const historyColumns: Array<Column<HistoryRow>> = [
    { key: "date", header: t("profile.date"), cell: (row) => formatPerformanceDate(row.date, locale) },
    { key: "title", header: t("overview.gradedResults"), cell: (row) => row.title },
    { key: "group", header: t("overview.group"), cell: (row) => row.groupName },
    {
      key: "status",
      header: t("profile.status"),
      cell: (row) => t(`status.${row.status}` as "status.graded"),
    },
    {
      key: "score",
      header: t("profile.score"),
      align: "end",
      cell: (row) =>
        row.score === null ? "—" : `${formatPerformanceNumber(row.score, locale)}/${formatPerformanceNumber(row.maxScore, locale)}`,
    },
    {
      key: "percent",
      header: t("overview.average"),
      align: "end",
      cell: (row) => formatPerformancePercent(row.percent, locale),
    },
    {
      key: "change",
      header: t("profile.change"),
      align: "end",
      cell: (row) =>
        row.changePercent === null ? "—" : formatPerformancePercent(row.changePercent, locale),
    },
  ];

  type TopicRow = (typeof profile.topics)[number];
  const topicColumns: Array<Column<TopicRow>> = [
    { key: "topic", header: t("profile.topic"), cell: (row) => row.topic },
    {
      key: "observed",
      header: t("profile.observations"),
      align: "end",
      cell: (row) => formatPerformanceNumber(row.observedCount, locale),
    },
    {
      key: "incorrect",
      header: t("profile.incorrectRate"),
      align: "end",
      cell: (row) => formatPerformancePercent(row.incorrectRatePercent, locale),
    },
    {
      key: "source",
      header: t("profile.topics"),
      cell: (row) =>
        row.manualObservationCount > 0 ? t("profile.teacherEntered") : t("profile.questionRecord"),
    },
  ];

  const actionRisks = profile.risks.map((risk) => {
    const copy = riskCopy[risk.ruleKey];
    return {
      ruleKey: risk.ruleKey,
      riskKey: risk.riskKey,
      title: t(copy.title),
      description: t(copy.description),
      action: t(copy.action),
      threshold: risk.threshold,
      detectedAt: risk.detectedAt,
      evidenceIds: risk.evidenceIds,
      acknowledgedAt: risk.state?.acknowledgedAt ?? null,
    };
  });

  return (
    <div className="app-page space-y-6">
      <PageHeader
        eyebrow={t("profile.title")}
        title={profile.student.name}
        description={profile.student.grade ?? undefined}
        actions={
          <Link className="ui-button" data-variant="secondary" href="/app/performance">
            <Icon name="chevronLeft" directional size={16} />
            {t("profile.back")}
          </Link>
        }
      />

      <form method="get" className="app-filter-row">
        <label className="app-filter">
          <span>{t("filters.from")}</span>
          <input className="ui-input" type="date" name="from" defaultValue={query.from ?? ""} />
        </label>
        <label className="app-filter">
          <span>{t("filters.to")}</span>
          <input className="ui-input" type="date" name="to" defaultValue={query.to ?? ""} />
        </label>
        <label className="app-filter">
          <span>{t("class.title")}</span>
          <select className="ui-select" name="type" defaultValue={query.type ?? ""}>
            <option value="">{t("filters.allSubjects")}</option>
            <option value="paper_exam">{t("bulk.types.paper_exam")}</option>
            <option value="quiz">{t("bulk.types.quiz")}</option>
            <option value="test">{t("bulk.types.test")}</option>
            <option value="other">{t("bulk.types.other")}</option>
          </select>
        </label>
        <button type="submit" className="ui-button" data-variant="primary">
          {t("filters.apply")}
        </button>
      </form>

      {dataState ? (
        <Alert tone={dataState.tone} title={dataState.title} description={dataState.description} />
      ) : null}

      <div className="app-kpi-grid">
        <Stat label={t("profile.latest")} value={formatPerformancePercent(profile.summary.latestPercent, locale)} icon="activity" />
        <Stat label={t("profile.previous")} value={formatPerformancePercent(profile.summary.previousPercent, locale)} icon="activity" />
        <Stat label={t("profile.average")} value={formatPerformancePercent(profile.summary.averagePercent, locale)} icon="target" />
        <Stat label={t("profile.highest")} value={formatPerformancePercent(profile.summary.highestPercent, locale)} icon="checkCircle" />
        <Stat label={t("profile.lowest")} value={formatPerformancePercent(profile.summary.lowestPercent, locale)} icon="alert" />
        <Stat label={t("profile.completed")} value={formatPerformanceNumber(profile.summary.completedCount, locale)} hint={t("overview.gradedResults")} />
        <Stat label={t("profile.missed")} value={formatPerformanceNumber(profile.summary.missedCount, locale)} tone="warn" />
      </div>

      <Card>
        <CardHeader
          title={t("profile.trendRule")}
          description={profile.trend.rule}
          titleId="profile-trend-rule"
        />
        <CardBody className="grid gap-2 text-sm">
          <p>
            {t("overview.trend")}: {t(`trends.${profile.trend.classification}` as "trends.steady")}
          </p>
          <p>
            {t("profile.sampleSize")}: {formatPerformanceNumber(profile.trend.sampleSize, locale)}
          </p>
          <p>
            {t("profile.changes")}: {profile.summary.consecutiveChanges.length}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("profile.history")} titleId="profile-history-title" />
        <CardBody>
          <TrendLineChart
            data={trendData}
            valueFormatter={(value) => formatPerformancePercent(value, locale)}
            emptyLabel={t("profile.noHistory")}
            ariaLabel={t("profile.history")}
          />
          <div className="mt-4">
            <DataTable
              caption={t("profile.history")}
              columns={historyColumns}
              rows={profile.history}
              rowKey={(row) => `${row.assessmentId}-${row.date}`}
              empty={t("profile.noHistory")}
              scrollLabel={t("profile.history")}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("profile.topics")} titleId="profile-topics-title" />
        <CardBody>
          <DataTable
            caption={t("profile.topics")}
            columns={topicColumns}
            rows={profile.topics}
            rowKey={(row) => row.topic}
            empty={t("profile.noTopicEvidence")}
            scrollLabel={t("profile.topics")}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("profile.shareableNotes")} titleId="profile-notes-list-title" />
        <CardBody>
          {profile.reportNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("parentReport.noNotes")}</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {profile.reportNotes.map((note) => (
                <li key={note.id} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    {formatPerformanceDate(note.createdAt, locale)}
                  </p>
                  <p>{note.body}</p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <StudentPerformanceActions
        studentId={studentId}
        risks={actionRisks}
        assessments={assessments}
        from={query.from}
        to={query.to}
        locale={locale}
        canWrite={canWrite}
      />
    </div>
  );
}
