import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ReportsClient } from "@/components/reports/reports-client";
import { requireStaffSession } from "@/modules/identity/session";
import { getGroups } from "@/modules/groups/service";
import { groupQuerySchema } from "@/modules/groups/schemas";
import { getStudents } from "@/modules/students/service";
import { studentQuerySchema } from "@/modules/students/schemas";
import { getReportTimezone } from "@/modules/reports/repository";
import { currentTerm, previousTerm } from "@/modules/terms/resolution";
import { getTermsForReporting } from "@/modules/terms/service";
import { currentDateInTimezone } from "@/modules/payments/calculations";
import type { ReportQuery } from "@/modules/reports/schemas";
import { isAllowed } from "@/modules/tenancy/types";

export const dynamic = "force-dynamic";

function subtractDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

export default async function ReportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { scope } = await requireStaffSession();
  const t = await getTranslations("Reports");
  const availableTypes = [
    isAllowed(scope, "attendance", "read") ? "attendance" : null,
    isAllowed(scope, "students", "read") ? "enrollment" : null,
    isAllowed(scope, "grades", "read") ? "academics" : null,
    isAllowed(scope, "homework", "read") ? "homework" : null,
    isAllowed(scope, "payments", "read") ? "payments" : null,
    isAllowed(scope, "payments", "read") ? "sessionRevenue" : null,
  ].filter((type): type is ReportQuery["type"] => type !== null);
  if (availableTypes.length === 0) {
    return (
      <div className="app-page">
        <PageHeader title={t("title")} />
        <Card>
          <CardBody>{t("noPermission")}</CardBody>
        </Card>
      </div>
    );
  }

  const [timezone, groups, students, terms] = await Promise.all([
    getReportTimezone(scope),
    isAllowed(scope, "grades", "read")
      ? getGroups(scope, groupQuerySchema.parse({}))
      : Promise.resolve([]),
    isAllowed(scope, "students", "read")
      ? getStudents(scope, studentQuerySchema.parse({ pageSize: 100, status: "active" }))
      : Promise.resolve({ items: [] }),
    getTermsForReporting(scope),
  ]);
  const today = currentDateInTimezone(new Date(), timezone);
  // F-P3-07 AC-2: reports default to the current term when one is defined.
  // With no terms, the existing last-30-days default remains in force.
  const defaultTerm = currentTerm(terms, today);
  const defaultPrevious = previousTerm(terms, defaultTerm);
  const defaultFrom = defaultTerm?.startDate ?? subtractDays(today, 29);
  const defaultTo = defaultTerm?.endDate ?? today;
  return (
    <div className="app-page space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <ReportsClient
        availableTypes={availableTypes}
        groups={groups.map(({ id, name, grade }) => ({ id, name, grade: grade ?? null }))}
        students={students.items.map(({ id, firstName, lastName, grade }) => ({
          id,
          name: `${firstName} ${lastName}`,
          grade: grade ?? null,
        }))}
        terms={terms}
        defaultTermId={defaultTerm?.id ?? null}
        defaultPreviousTermId={defaultPrevious?.id ?? null}
        today={today}
        defaultFrom={defaultFrom}
        defaultTo={defaultTo}
        locale={locale}
      />
    </div>
  );
}
