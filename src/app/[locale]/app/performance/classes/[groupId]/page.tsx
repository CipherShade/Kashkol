import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  formatPerformanceDate,
  formatPerformanceNumber,
  formatPerformancePercent,
} from "@/components/performance/performance-format";
import { Alert } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { DataTable, type Column } from "@/components/ui/table";
import { AppError } from "@/lib/http/errors";
import { requireStaffSession } from "@/modules/identity/session";
import { getClassIntelligence, classIntelligenceQuerySchema } from "@/modules/performance";
import { isAllowed } from "@/modules/tenancy/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; groupId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Performance.class" });
  return { title: t("title") };
}

function value(source: Record<string, string | string[] | undefined>, key: string) {
  const raw = source[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export default async function PerformanceClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; groupId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, groupId } = await params;
  setRequestLocale(locale);
  const { scope } = await requireStaffSession();
  const t = await getTranslations("Performance");
  if (!isAllowed(scope, "grades", "read")) {
    return (
      <div className="app-page">
        <PageHeader title={t("class.title")} />
        <Card>
          <CardBody>{t("noPermission")}</CardBody>
        </Card>
      </div>
    );
  }

  const raw = await searchParams;
  const parsed = classIntelligenceQuerySchema.safeParse({
    groupId,
    ...(value(raw, "from") ? { from: value(raw, "from") } : {}),
    ...(value(raw, "to") ? { to: value(raw, "to") } : {}),
  });
  if (!parsed.success) notFound();

  let result;
  try {
    result = await getClassIntelligence(scope, parsed.data);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  type StudentRow = Awaited<ReturnType<typeof getClassIntelligence>>["students"][number];

  return (
    <div className="app-page space-y-6">
      <PageHeader
        eyebrow={t("class.title")}
        title={result.group.name}
        description={t(result.comparable ? "class.comparableNote" : "class.notComparableNote")}
        actions={
          <Link className="ui-button" data-variant="secondary" href="/app/performance">
            <Icon name="chevronLeft" directional size={16} />
            {t("class.back")}
          </Link>
        }
      />

      <Card>
        <CardBody>
          <form method="get" className="app-filter-row">
            <label className="app-filter">
              <span>{t("filters.from")}</span>
              <input className="ui-input" type="date" name="from" defaultValue={result.query.from ?? ""} />
            </label>
            <label className="app-filter">
              <span>{t("filters.to")}</span>
              <input className="ui-input" type="date" name="to" defaultValue={result.query.to ?? ""} />
            </label>
            <button type="submit" className="ui-button" data-variant="primary">
              {t("class.apply")}
            </button>
          </form>
        </CardBody>
      </Card>

      {!result.comparable ? (
        <Alert tone="warning" title={t("class.notComparableNote")} description={t("states.insufficient")} />
      ) : null}

      <div className="app-kpi-grid">
        <Stat
          label={t("class.comparableStudents")}
          value={formatPerformanceNumber(result.comparableStudentCount, locale)}
          hint={t("class.comparableNote")}
        />
        <Stat
          label={t("class.improvingPercent")}
          value={formatPerformancePercent(result.improvingPercent, locale)}
          icon="checkCircle"
        />
        <Stat
          label={t("class.decliningPercent")}
          value={formatPerformancePercent(result.decliningPercent, locale)}
          icon="alert"
          tone={result.decliningPercent > 0 ? "warn" : "default"}
        />
        <Stat
          label={t("class.steadyPercent")}
          value={formatPerformancePercent(result.steadyPercent, locale)}
          icon="activity"
        />
        <Stat
          label={t("class.insufficientPercent")}
          value={formatPerformancePercent(result.insufficientPercent, locale)}
          icon="info"
          tone="muted"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("class.difficultTopics")} titleId="class-difficult-title" />
          <CardBody>
            <ul className="grid gap-2 text-sm">
              {result.difficultTopics.length === 0 ? (
                <li className="text-muted-foreground">{t("class.noEvidence")}</li>
              ) : (
                result.difficultTopics.map((topic) => (
                  <li key={topic.topic} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <span className="font-medium">{topic.topic}</span>
                    <span>
                      {t("class.incorrectRate")}: {formatPerformancePercent(topic.incorrectRatePercent, locale)}
                      {" · "}
                      {t("class.observations", { count: topic.observedCount })}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("class.strongTopics")} titleId="class-strong-title" />
          <CardBody>
            <ul className="grid gap-2 text-sm">
              {result.strongTopics.length === 0 ? (
                <li className="text-muted-foreground">{t("class.noEvidence")}</li>
              ) : (
                result.strongTopics.map((topic) => (
                  <li key={topic.topic} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <span className="font-medium">{topic.topic}</span>
                    <span>
                      {t("class.incorrectRate")}: {formatPerformancePercent(topic.incorrectRatePercent, locale)}
                      {" · "}
                      {t("class.observations", { count: topic.observedCount })}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("class.weakestAssessments")} titleId="class-weak-assessments-title" />
        <CardBody>
          <ul className="grid gap-2 text-sm">
            {result.weakestAssessments.length === 0 ? (
              <li className="text-muted-foreground">{t("class.noAssessments")}</li>
            ) : (
              result.weakestAssessments.map((assessment) => (
                <li key={assessment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <span className="font-medium">{assessment.title}</span>
                  <span>
                    {formatPerformanceDate(assessment.date, locale)} · {t("class.average")}: {" "}
                    {formatPerformancePercent(assessment.averagePercent ?? 0, locale)} · {" "}
                    {t("class.sampleSize", { count: assessment.sampleSize })}
                  </span>
                </li>
              ))
            )}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("class.hardestQuestions")} titleId="class-questions-title" />
        <CardBody>
          <ul className="grid gap-2 text-sm">
            {result.questionIncorrectRates.length === 0 ? (
              <li className="text-muted-foreground">{t("class.noEvidence")}</li>
            ) : (
              result.questionIncorrectRates.map((question) => (
                <li key={question.questionId} className="rounded-lg border border-border p-3">
                  <p className="font-medium">{question.prompt}</p>
                  <p className="mt-1 text-muted-foreground">
                    {t("class.topic")}: {question.topic || "—"} · {t("class.incorrectRate")}: {" "}
                    {formatPerformancePercent(question.incorrectRatePercent, locale)} · {" "}
                    {t("class.observations", { count: question.observedCount })}
                  </p>
                </li>
              ))
            )}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("class.comparableStudents")} titleId="class-students-title" />
        <CardBody>
          <DataTable
            caption={t("class.comparableStudents")}
            columns={[
              {
                key: "name",
                header: t("overview.name"),
                cell: (row) => (
                  <Link className="app-student-link" href={`/app/performance/students/${row.studentId}`}>
                    {row.name}
                  </Link>
                ),
              },
              {
                key: "average",
                header: t("class.average"),
                align: "end",
                cell: (row) => formatPerformancePercent(row.summary.averagePercent, locale),
              },
              {
                key: "trend",
                header: t("overview.trend"),
                cell: (row) => t(`trends.${row.trend.classification}` as "trends.steady"),
              },
              {
                key: "sample",
                header: t("class.sampleSize"),
                align: "end",
                cell: (row) => formatPerformanceNumber(row.summary.gradedCount, locale),
              },
            ] satisfies Column<StudentRow>[]}
            rows={result.students}
            rowKey={(row) => row.studentId}
            empty={t("overview.noStudents")}
            scrollLabel={t("class.comparableStudents")}
          />
        </CardBody>
      </Card>
    </div>
  );
}
