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

  const [timezone, groups, students] = await Promise.all([
    getReportTimezone(scope),
    isAllowed(scope, "grades", "read")
      ? getGroups(scope, groupQuerySchema.parse({}))
      : Promise.resolve([]),
    isAllowed(scope, "students", "read")
      ? getStudents(scope, studentQuerySchema.parse({ pageSize: 100, status: "active" }))
      : Promise.resolve({ items: [] }),
  ]);
  const today = currentDateInTimezone(new Date(), timezone);
  return (
    <div className="app-page space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <ReportsClient
        availableTypes={availableTypes}
        groups={groups.map(({ id, name }) => ({ id, name }))}
        students={students.items.map(({ id, firstName, lastName }) => ({
          id,
          name: `${firstName} ${lastName}`,
        }))}
        defaultFrom={subtractDays(today, 29)}
        defaultTo={today}
        locale={locale}
      />
    </div>
  );
}
