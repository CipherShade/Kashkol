import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import {
  formatPerformanceDate,
  formatPerformanceNumber,
  formatPerformancePercent,
} from "@/components/performance/performance-format";
import { ParentPerformanceReportClient } from "@/components/portal/parent-performance-report-client";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { DataTable, type Column } from "@/components/ui/table";
import { AppError } from "@/lib/http/errors";
import { requireParentPortalContext } from "@/modules/identity/session";
import { getParentPerformanceReport, parentPerformanceReportQuerySchema } from "@/modules/performance";
import { getParentPortalOverview } from "@/modules/portals/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Performance.parent" });
  return {
    title: t("title"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

function value(source: Record<string, string | string[] | undefined>, key: string) {
  const raw = source[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export default async function ParentPerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Performance");
  const raw = await searchParams;

  let portal;
  try {
    portal = await requireParentPortalContext();
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHORIZED") {
      return redirect({ href: "/portal", locale });
    }
    return redirect({ href: "/not-available", locale });
  }

  let overview;
  try {
    overview = await getParentPortalOverview(portal, value(raw, "studentId") ?? null);
  } catch {
    return redirect({ href: "/not-available", locale });
  }

  const backHref = `/portal/parent?studentId=${encodeURIComponent(overview.activeChild.student.id)}`;
  const shell = (children: React.ReactNode) => (
    <div className="app-page space-y-6">
      <PageHeader
        eyebrow={t("parent.title")}
        title={t("parent.title")}
        description={t("parent.subtitle")}
        actions={
          <Link className="ui-button" data-variant="secondary" href={backHref}>
            {t("parent.back")}
          </Link>
        }
      />
      {children}
    </div>
  );

  if (!overview.activeChild.permissions.showGrades) {
    return shell(
      <Alert tone="warning" title={t("parent.noAccess")} description={t("parent.publishedOnly")} />,
    );
  }

  const parsed = parentPerformanceReportQuerySchema.safeParse({
    ...(value(raw, "from") ? { from: value(raw, "from") } : {}),
    ...(value(raw, "to") ? { to: value(raw, "to") } : {}),
    locale,
    format: "json",
  });

  if (!parsed.success) {
    return shell(<Alert tone="danger" title={t("parent.noReport")} live="alert" />);
  }

  let report;
  try {
    report = await getParentPerformanceReport(
      portal,
      overview.activeChild.student.id,
      parsed.data,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "FORBIDDEN") {
      return shell(<Alert tone="warning" title={t("parent.noAccess")} live="alert" />);
    }
    return shell(<Alert tone="danger" title={t("parent.noReport")} live="alert" />);
  }

  const trendKey = {
    improving: "parentReport.trendImproving",
    steady: "parentReport.trendSteady",
    declining: "parentReport.trendDeclining",
    insufficient_data: "parentReport.trendInsufficient",
  }[report.trend.classification];

  const statusKey = (status: string) =>
    `parentReport.status_${status}` as
      | "parentReport.status_graded"
      | "parentReport.status_missing"
      | "parentReport.status_excused"
      | "parentReport.status_not_taken";

  type HistoryRow = (typeof report.history)[number];
  type TopicRow = (typeof report.topics)[number];

  return shell(
    <>
      <Card>
        <CardHeader title={t("parentReport.student")} titleId="parent-report-student-title" />
        <CardBody className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {overview.children.map((child) => (
              <Link
                key={child.studentId}
                className="ui-button"
                data-variant={child.studentId === report.student.id ? "primary" : "outline"}
                href={`/portal/parent/performance?studentId=${encodeURIComponent(child.studentId)}`}
              >
                {child.firstName} {child.lastName}
              </Link>
            ))}
          </div>
          <form method="get" className="app-filter-row">
            <input type="hidden" name="studentId" value={report.student.id} />
            <label className="app-filter">
              <span>{t("parent.from")}</span>
              <input className="ui-input" type="date" name="from" defaultValue={report.from ?? ""} />
            </label>
            <label className="app-filter">
              <span>{t("parent.to")}</span>
              <input className="ui-input" type="date" name="to" defaultValue={report.to ?? ""} />
            </label>
            <button type="submit" className="ui-button" data-variant="primary">
              {t("parent.apply")}
            </button>
            <Link className="ui-button" data-variant="secondary" href={`/portal/parent/performance?studentId=${encodeURIComponent(report.student.id)}`}>
              {t("parent.allPeriod")}
            </Link>
          </form>
        </CardBody>
      </Card>

      <div className="app-kpi-grid">
        <Stat label={t("parentReport.average")} value={formatPerformancePercent(report.summary.averagePercent, locale)} />
        <Stat label={t("parentReport.latest")} value={formatPerformancePercent(report.summary.latestPercent, locale)} />
        <Stat label={t("parentReport.previous")} value={formatPerformancePercent(report.summary.previousPercent, locale)} />
        <Stat label={t("parentReport.completed")} value={formatPerformanceNumber(report.summary.completedCount, locale)} />
        <Stat label={t("parentReport.missed")} value={formatPerformanceNumber(report.summary.missedCount, locale)} />
        <Stat label={t("parentReport.trend")} value={t(trendKey)} />
      </div>

      <Card>
        <CardHeader
          title={t("parentReport.overview")}
          description={`${t("parentReport.student")}: ${report.student.name}`}
          titleId="parent-report-overview-title"
        />
        <CardBody className="grid gap-2 text-sm">
          <p>{t("parentReport.teacher")}: {report.teacherName}</p>
          <p>{t("parentReport.period")}: {report.from ?? t("parentReport.allPeriod")} — {report.to ?? t("parentReport.allPeriod")}</p>
          <p>{t("parentReport.generatedAt")}: {formatPerformanceDate(report.generatedAt, locale)}</p>
          <p>{t("parent.publishedOnly")}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("parentReport.history")} titleId="parent-report-history-title" />
        <CardBody>
          <DataTable
            caption={t("parentReport.history")}
            columns={[
              {
                key: "date",
                header: t("parentReport.date"),
                cell: (row) => formatPerformanceDate(row.date, locale),
              },
              {
                key: "title",
                header: t("parentReport.history"),
                cell: (row) => row.title,
              },
              {
                key: "status",
                header: t("parentReport.status"),
                cell: (row) => t(statusKey(row.status)),
              },
              {
                key: "score",
                header: t("parentReport.score"),
                align: "end",
                cell: (row) =>
                  row.score === null
                    ? "—"
                    : `${formatPerformanceNumber(row.score, locale)}/${formatPerformanceNumber(row.maxScore, locale)}`,
              },
            ] satisfies Column<HistoryRow>[]}
            rows={report.history}
            rowKey={(row) => `${row.assessmentId}-${row.date}`}
            empty={t("parentReport.noHistory")}
            scrollLabel={t("parentReport.history")}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("parentReport.topics")} titleId="parent-report-topics-title" />
        <CardBody>
          <DataTable
            caption={t("parentReport.topics")}
            columns={[
              {
                key: "topic",
                header: t("parentReport.topicObservation"),
                cell: (row) => row.topic,
              },
              {
                key: "observed",
                header: t("parentReport.observedCount"),
                align: "end",
                cell: (row) => formatPerformanceNumber(row.observedCount, locale),
              },
              {
                key: "incorrect",
                header: t("parentReport.incorrectRate"),
                align: "end",
                cell: (row) => formatPerformancePercent(row.incorrectRatePercent, locale),
              },
            ] satisfies Column<TopicRow>[]}
            rows={report.topics}
            rowKey={(row) => row.topic}
            empty={t("parentReport.noTopicEvidence")}
            scrollLabel={t("parentReport.topics")}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("parentReport.notes")} titleId="parent-report-notes-title" />
        <CardBody>
          {report.notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("parentReport.noNotes")}</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {report.notes.map((note) => (
                <li key={note.id} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{formatPerformanceDate(note.createdAt, locale)}</p>
                  <p>{note.body}</p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("parentReport.recommendations")} titleId="parent-report-recommendations-title" />
        <CardBody>
          {report.recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("parentReport.noRecommendations")}</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {report.recommendations.map((risk) => (
                <li key={risk.riskKey} className="rounded-lg border border-border p-3">
                  <p className="font-medium">{t(`parentReport.title_${risk.ruleKey}` as "parentReport.title_low_average")}</p>
                  <p className="mt-1">{t(`parentReport.description_${risk.ruleKey}` as "parentReport.description_low_average")}</p>
                  <p className="mt-1 text-muted-foreground">{t(`parentReport.action_${risk.ruleKey}` as "parentReport.action_low_average")}</p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("parent.title")} titleId="parent-report-export-title" />
        <CardBody>
          <ParentPerformanceReportClient
            studentId={report.student.id}
            from={report.from ?? undefined}
            to={report.to ?? undefined}
            locale={locale === "ar" ? "ar" : "en"}
          />
        </CardBody>
      </Card>
    </>,
  );
}
