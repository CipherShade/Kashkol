import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TrendLineChart } from "@/app/[locale]/app/_components/charts/TrendLineChart";
import { formatPerformanceNumber, formatPerformancePercent } from "@/components/performance/performance-format";
import { Alert } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { AppError } from "@/lib/http/errors";
import { requireStaffSession } from "@/modules/identity/session";
import {
  PROGRESS_DIRECTION_RULE,
  getStudentProgress,
  studentPerformanceQuerySchema,
} from "@/modules/performance";
import type { ProgressDirection, ProgressSeries } from "@/modules/performance";
import { isAllowed } from "@/modules/tenancy/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; studentId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Students.progress" });
  return { title: t("title") };
}

function value(source: Record<string, string | string[] | undefined>, key: string) {
  const raw = source[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export default async function StudentProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, studentId } = await params;
  setRequestLocale(locale);
  const { scope } = await requireStaffSession();
  const t = await getTranslations("Students.progress");

  if (!isAllowed(scope, "students", "read")) {
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
  const parsed = studentPerformanceQuerySchema.safeParse({
    ...(value(raw, "from") ? { from: value(raw, "from") } : {}),
    ...(value(raw, "to") ? { to: value(raw, "to") } : {}),
  });
  let progress;
  try {
    progress = await getStudentProgress(scope, studentId, parsed.success ? parsed.data : {});
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const sources: Array<{
    key: "attendance" | "assessment" | "homework";
    label: string;
    permission: string;
    series: ProgressSeries | null;
    allowed: boolean;
  }> = [
    {
      key: "attendance",
      label: t("attendance"),
      permission: "attendance:read",
      series: progress.series.attendance,
      allowed: progress.sources.attendance,
    },
    {
      key: "assessment",
      label: t("assessment"),
      permission: "grades:read",
      series: progress.series.assessment,
      allowed: progress.sources.assessment,
    },
    {
      key: "homework",
      label: t("homework"),
      permission: "homework:read",
      series: progress.series.homework,
      allowed: progress.sources.homework,
    },
  ];

  return (
    <div className="app-page space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={progress.student.name}
        description={t("subtitle")}
        actions={
          <Link className="ui-button" data-variant="secondary" href={`/app/students/${studentId}`}>
            <Icon name="chevronLeft" directional size={16} />
            {t("backToProfile")}
          </Link>
        }
      />

      <form method="get" className="app-filter-row">
        <label className="app-filter">
          <span>{t("from")}</span>
          <input className="ui-input" type="date" name="from" defaultValue={progress.query.from ?? ""} />
        </label>
        <label className="app-filter">
          <span>{t("to")}</span>
          <input className="ui-input" type="date" name="to" defaultValue={progress.query.to ?? ""} />
        </label>
        <button type="submit" className="ui-button" data-variant="primary">
          {t("apply")}
        </button>
      </form>

      <Card>
        <CardHeader title={t("ruleTitle")} description={t("ruleDescription")} titleId="progress-rule-title" />
        <CardBody className="grid gap-1 text-sm">
          <p dir="ltr" className="text-xs text-muted-foreground">
            {PROGRESS_DIRECTION_RULE}
          </p>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {sources.map((source) => {
          const direction = source.series?.direction ?? "insufficient_data";
          const directionKey = `directions.${direction}` as `directions.${ProgressDirection}`;
          return (
            <Card key={source.key}>
              <CardHeader
                title={source.label}
                description={t("direction", {
                  value: t(directionKey),
                })}
                titleId={`progress-${source.key}-title`}
              />
              <CardBody className="grid gap-3">
                {!source.allowed ? (
                  <Alert
                    tone="info"
                    title={t("hiddenTitle")}
                    description={t("hiddenDescription", { permission: source.permission })}
                  />
                ) : source.series && source.series.points.length > 0 ? (
                  <>
                    <TrendLineChart
                      data={source.series.points.map((point) => ({
                        label: point.period,
                        value: point.value,
                      }))}
                      valueFormatter={(point) => formatPerformancePercent(point, locale)}
                      emptyLabel={t("noData")}
                      ariaLabel={source.label}
                    />
                    <p className="text-sm">
                      {t("change")}: {formatPerformancePercent(source.series.deltaPercent, locale)}
                    </p>
                    <p className="text-sm">
                      {t("sampleSize")}: {formatPerformanceNumber(source.series.sampleSize, locale)}
                    </p>
                    {source.series.points.length < 3 ? (
                      <p className="text-sm text-muted-foreground">{t("directionHint")}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("noData")}</p>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
